#!/usr/bin/env python3
"""
Sinh 10 file PDF mẫu để test DocFlow load.

Mỗi file mô phỏng một biểu mẫu (Hóa đơn / Hợp đồng / Đơn nghỉ phép) ở 2 trạng thái:
  - PASS : tất cả rule liên quan đều thỏa
  - FAIL : cố ý vi phạm ≥1 rule

Output: data/fixtures/pdfs/*.pdf  (10 file, size 200KB → 500MB)

Yêu cầu: reportlab, Pillow, pypdf
"""

from __future__ import annotations

import io
import os
import random
import sys
from pathlib import Path

from reportlab.lib.colors import HexColor, black, red
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm, mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from PIL import Image, ImageDraw, ImageFilter
from pypdf import PdfReader, PdfWriter

random.seed(7)

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "data" / "fixtures" / "pdfs"
OUT_DIR.mkdir(parents=True, exist_ok=True)

# ── Font đăng ký (Vietnamese support) ────────────────────────────────────────
FONT_CANDIDATES = [
    "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",  # macOS
    "/Library/Fonts/Arial Unicode.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",       # Linux
]
FONT_NAME = "VN"
for fp in FONT_CANDIDATES:
    if Path(fp).is_file():
        pdfmetrics.registerFont(TTFont(FONT_NAME, fp))
        print(f"[font] using {fp}")
        break
else:
    FONT_NAME = "Helvetica"
    print("[font] WARNING: no Vietnamese font found, fallback to Helvetica (may render ?)")

A4_W, A4_H = A4  # 595 x 842 points


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def header(c: canvas.Canvas, title: str, subtitle: str = "") -> None:
    c.setFont(FONT_NAME, 18)
    c.drawCentredString(A4_W / 2, A4_H - 2.5 * cm, title)
    if subtitle:
        c.setFont(FONT_NAME, 11)
        c.drawCentredString(A4_W / 2, A4_H - 3.3 * cm, subtitle)
    c.setStrokeColor(black)
    c.line(2 * cm, A4_H - 3.7 * cm, A4_W - 2 * cm, A4_H - 3.7 * cm)


def field(c: canvas.Canvas, x: float, y: float, label: str, value: str, value_color=black) -> None:
    c.setFont(FONT_NAME, 10)
    c.setFillColor(black)
    c.drawString(x, y, f"{label}:")
    c.setFont(FONT_NAME, 11)
    c.setFillColor(value_color)
    c.drawString(x + 5 * cm, y, value)


def draw_signature(c: canvas.Canvas, x: float, y: float, name: str) -> None:
    """Mô phỏng chữ ký bằng đường lượn sóng."""
    c.setStrokeColor(HexColor("#1f3a93"))
    c.setLineWidth(1.2)
    path = c.beginPath()
    path.moveTo(x, y)
    for i in range(1, 30):
        path.curveTo(
            x + i * 2, y + random.uniform(-3, 6),
            x + i * 2 + 1, y + random.uniform(-3, 6),
            x + i * 2 + 2, y + random.uniform(-2, 4),
        )
    c.drawPath(path, stroke=1)
    c.setFont(FONT_NAME, 9)
    c.setFillColor(black)
    c.drawString(x, y - 0.6 * cm, f"({name})")


def draw_red_stamp(c: canvas.Canvas, x: float, y: float, text: str = "CÔNG TY ABC") -> None:
    c.setStrokeColor(red)
    c.setFillColor(red)
    c.setLineWidth(1.5)
    c.circle(x, y, 1.5 * cm, stroke=1, fill=0)
    c.setFont(FONT_NAME, 7)
    c.drawCentredString(x, y + 0.2 * cm, text)
    c.drawCentredString(x, y - 0.3 * cm, "ĐÃ DUYỆT")
    c.setFillColor(black)


def make_noise_jpeg(width: int, height: int, quality: int = 85) -> bytes:
    """Sinh ảnh JPEG mô phỏng trang scan — nhiễu + line, dùng để inflate PDF."""
    img = Image.new("RGB", (width, height), "white")
    draw = ImageDraw.Draw(img)
    # Random dark dots/strokes mô phỏng text
    for _ in range(width * height // 800):
        x, y = random.randint(0, width), random.randint(0, height)
        draw.line(
            [(x, y), (x + random.randint(20, 90), y + random.randint(-3, 3))],
            fill=(random.randint(0, 60),) * 3,
            width=random.choice([1, 1, 2]),
        )
    img = img.filter(ImageFilter.GaussianBlur(radius=0.5))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=quality)
    return buf.getvalue()


def inflate_to(pdf_path: Path, target_mb: float) -> None:
    """Phình PDF lên đúng `target_mb` bằng cách attach file binary padding.

    Dùng pypdf attachment — PDF vẫn parse được, file size = base + padding.
    """
    current = pdf_path.stat().st_size
    target = int(target_mb * 1024 * 1024)
    if current >= target:
        return

    reader = PdfReader(str(pdf_path))
    writer = PdfWriter(clone_from=reader)

    # Trừ overhead cho attachment header (~500 bytes)
    needed = target - current - 512
    if needed <= 0:
        return
    pad = os.urandom(needed)
    writer.add_attachment("loadtest-padding.bin", pad)
    with open(pdf_path, "wb") as f:
        writer.write(f)


# ─────────────────────────────────────────────────────────────────────────────
# 1) Hóa đơn GTGT (rule: so_tien>0, thue_suat in [0,5,10], có MST, ngay_lap<=today)
# ─────────────────────────────────────────────────────────────────────────────

def gen_invoice(path: Path, *, passing: bool) -> None:
    c = canvas.Canvas(str(path), pagesize=A4)
    header(c, "HÓA ĐƠN GIÁ TRỊ GIA TĂNG",
           "Mẫu số: 01GTKT0/001  —  Ký hiệu: AA/24E")

    y = A4_H - 5 * cm
    field(c, 2 * cm, y, "Số hóa đơn",   "0001234")
    y -= 0.7 * cm
    field(c, 2 * cm, y, "Ngày lập",
          "2025-08-15" if passing else "2099-12-31",  # FAIL: ngày tương lai
          value_color=black if passing else red)
    y -= 0.7 * cm
    field(c, 2 * cm, y, "Đơn vị bán",   "Công ty TNHH ABC")
    y -= 0.7 * cm
    field(c, 2 * cm, y, "Mã số thuế",
          "0301234567" if passing else "",  # FAIL: thiếu MST
          value_color=black if passing else red)
    y -= 0.7 * cm
    field(c, 2 * cm, y, "Họ tên người mua", "Trần Văn Bình")
    y -= 0.7 * cm
    field(c, 2 * cm, y, "Địa chỉ",     "123 Lê Lợi, Quận 1, TP.HCM")

    y -= 1.2 * cm
    c.setFont(FONT_NAME, 11)
    c.drawString(2 * cm, y, "Chi tiết hàng hóa, dịch vụ:")
    y -= 0.8 * cm
    field(c, 2 * cm, y, "Tên hàng",   "Dịch vụ tư vấn CNTT")
    y -= 0.7 * cm
    field(c, 2 * cm, y, "Số lượng",   "1")
    y -= 0.7 * cm
    field(c, 2 * cm, y, "Đơn giá",    "15,000,000")
    y -= 0.7 * cm
    field(c, 2 * cm, y, "Thuế suất",
          "10%" if passing else "15%",  # FAIL: thuế suất không trong [0,5,10]
          value_color=black if passing else red)
    y -= 0.7 * cm
    field(c, 2 * cm, y, "Tổng tiền",
          "16,500,000 VNĐ" if passing else "-1,500,000 VNĐ",  # FAIL: số tiền âm
          value_color=black if passing else red)
    y -= 0.7 * cm
    field(c, 2 * cm, y, "Đã thanh toán", "Có")

    # Chữ ký + dấu
    draw_signature(c, 12 * cm, 5 * cm, "Người bán hàng")
    if passing:
        draw_red_stamp(c, 15 * cm, 4 * cm)

    # Footer note
    c.setFont(FONT_NAME, 8)
    c.setFillColor(HexColor("#999999"))
    label = "PASS — hợp lệ theo rule KT" if passing else "FAIL — vi phạm rule KT (MST, thuế suất, số tiền, ngày)"
    c.drawString(2 * cm, 1.5 * cm, label)
    c.save()


# ─────────────────────────────────────────────────────────────────────────────
# 2) Hợp đồng kinh tế (rule: số tiền dương, có chữ ký A+B, có dấu đỏ, hiệu lực<hết hạn)
# ─────────────────────────────────────────────────────────────────────────────

def gen_contract(path: Path, *, passing: bool) -> None:
    c = canvas.Canvas(str(path), pagesize=A4)
    # Trang 1: thông tin chung
    header(c, "HỢP ĐỒNG KINH TẾ", "Số: HĐKT-2025/0042")
    y = A4_H - 5 * cm
    field(c, 2 * cm, y, "Bên A",         "Công ty TNHH ABC")
    y -= 0.7 * cm
    field(c, 2 * cm, y, "Đại diện",      "Ông Nguyễn Văn An")
    y -= 0.7 * cm
    field(c, 2 * cm, y, "Bên B",         "Công ty TNHH XYZ")
    y -= 0.7 * cm
    field(c, 2 * cm, y, "Đại diện",      "Bà Trần Thị Lan")
    y -= 1 * cm
    field(c, 2 * cm, y, "Ngày hiệu lực", "2025-09-01")
    y -= 0.7 * cm
    field(c, 2 * cm, y, "Ngày hết hạn",
          "2026-09-01" if passing else "2024-09-01",  # FAIL: hết hạn trước hiệu lực
          value_color=black if passing else red)
    y -= 0.7 * cm
    field(c, 2 * cm, y, "Giá trị hợp đồng",
          "500,000,000 VNĐ" if passing else "-50,000,000 VNĐ",  # FAIL: số tiền âm
          value_color=black if passing else red)

    y -= 1.5 * cm
    c.setFont(FONT_NAME, 10)
    txt = (
        "Hai bên thống nhất ký kết hợp đồng theo các điều khoản dưới đây. "
        "Hợp đồng có hiệu lực kể từ ngày ký và chấm dứt vào ngày hết hạn nêu trên. "
        "Mọi tranh chấp sẽ được giải quyết tại Tòa án có thẩm quyền."
    )
    for line in textwrap_wrap(txt, 78):
        c.drawString(2 * cm, y, line)
        y -= 0.5 * cm

    # Chữ ký 2 bên
    draw_signature(c, 3 * cm, 4 * cm, "Đại diện Bên A")
    if passing:
        draw_signature(c, 12 * cm, 4 * cm, "Đại diện Bên B")  # FAIL: thiếu chữ ký B
        draw_red_stamp(c, 16 * cm, 4 * cm)
    else:
        c.setFont(FONT_NAME, 9)
        c.setFillColor(HexColor("#888888"))
        c.drawString(12 * cm, 4 * cm, "(Đại diện Bên B — chưa ký)")

    c.setFont(FONT_NAME, 8)
    c.setFillColor(HexColor("#999999"))
    label = "PASS — đủ chữ ký + dấu" if passing else "FAIL — thiếu chữ ký B, dấu, ngày hết hạn không hợp lệ"
    c.drawString(2 * cm, 1.5 * cm, label)

    # Thêm vài trang điều khoản để file đạt ~1-2MB
    for page in range(3):
        c.showPage()
        c.setFont(FONT_NAME, 12)
        c.drawString(2 * cm, A4_H - 2 * cm, f"Điều {page + 2}. Quyền và nghĩa vụ các bên")
        c.setFont(FONT_NAME, 10)
        y = A4_H - 3 * cm
        body = (
            "Bên A có trách nhiệm cung cấp đầy đủ thông tin, tài liệu liên quan đến đối tượng hợp đồng. "
            "Bên B có nghĩa vụ thanh toán đúng hạn theo tiến độ thỏa thuận. "
            "Trong trường hợp một trong hai bên không thực hiện hoặc thực hiện không đúng nghĩa vụ, "
            "bên còn lại có quyền đơn phương chấm dứt hợp đồng và yêu cầu bồi thường thiệt hại. "
            "Việc thông báo phải được lập thành văn bản và gửi qua hình thức có thể xác nhận được. "
        ) * 8
        for line in textwrap_wrap(body, 80):
            if y < 2 * cm:
                break
            c.drawString(2 * cm, y, line)
            y -= 0.5 * cm
    c.save()


def textwrap_wrap(text: str, width: int) -> list[str]:
    import textwrap
    return textwrap.wrap(text, width=width)


# ─────────────────────────────────────────────────────────────────────────────
# 3) Đơn xin nghỉ phép (rule: nghỉ ≤30 ngày)
# ─────────────────────────────────────────────────────────────────────────────

def gen_hr_leave(path: Path, *, passing: bool) -> None:
    c = canvas.Canvas(str(path), pagesize=A4)
    header(c, "ĐƠN XIN NGHỈ PHÉP", "Phòng Nhân sự")

    y = A4_H - 5 * cm
    field(c, 2 * cm, y, "Kính gửi",          "Ban Giám đốc Công ty")
    y -= 0.7 * cm
    field(c, 2 * cm, y, "Họ và tên",         "Lê Thị Hồng")
    y -= 0.7 * cm
    field(c, 2 * cm, y, "Mã nhân viên",      "NV-00128")
    y -= 0.7 * cm
    field(c, 2 * cm, y, "Phòng ban",         "Phòng Nhân sự")
    y -= 0.7 * cm
    field(c, 2 * cm, y, "Ngày bắt đầu nghỉ", "2025-10-01")
    y -= 0.7 * cm
    field(c, 2 * cm, y, "Ngày kết thúc",
          "2025-10-07" if passing else "2025-12-15",  # FAIL: >30 ngày
          value_color=black if passing else red)
    y -= 0.7 * cm
    field(c, 2 * cm, y, "Số ngày",
          "7" if passing else "76",
          value_color=black if passing else red)
    y -= 0.7 * cm
    field(c, 2 * cm, y, "Lý do",             "Việc gia đình")

    y -= 1.5 * cm
    c.setFont(FONT_NAME, 10)
    c.drawString(2 * cm, y, "Tôi cam đoan các thông tin trên là chính xác.")
    y -= 0.5 * cm
    c.drawString(2 * cm, y, "Kính mong Ban Giám đốc xem xét và phê duyệt.")

    draw_signature(c, 12 * cm, 5 * cm, "Người làm đơn")
    if passing:
        draw_signature(c, 4 * cm, 5 * cm, "Trưởng phòng phê duyệt")

    c.setFont(FONT_NAME, 8)
    c.setFillColor(HexColor("#999999"))
    label = "PASS — nghỉ ≤30 ngày, có phê duyệt" if passing else "FAIL — nghỉ 76 ngày, chưa phê duyệt"
    c.drawString(2 * cm, 1.5 * cm, label)
    c.save()


# ─────────────────────────────────────────────────────────────────────────────
# 4) PDF "scan" — nhiều trang với JPEG nhúng để stress OCR
# ─────────────────────────────────────────────────────────────────────────────

def gen_scan_pdf(path: Path, target_mb: float) -> None:
    """Sinh PDF với N trang, mỗi trang là JPEG kích thước lớn."""
    c = canvas.Canvas(str(path), pagesize=A4)

    # JPEG ~2-4MB/page tùy chất lượng
    img_w, img_h = 1700, 2400  # ~A4 @ ~200dpi
    jpeg_bytes = make_noise_jpeg(img_w, img_h, quality=92)
    jpeg_size_mb = len(jpeg_bytes) / (1024 * 1024)
    pages_needed = max(1, int(target_mb / jpeg_size_mb) + 1)
    print(f"  [scan] {jpeg_size_mb:.2f}MB/page → {pages_needed} pages cho target {target_mb}MB")

    # Page 1: thông tin form
    header(c, "HỒ SƠ NHÂN SỰ (Bản scan)", "Phòng Nhân sự")
    field(c, 2 * cm, A4_H - 5 * cm, "Họ tên",  "Phạm Văn Quang")
    field(c, 2 * cm, A4_H - 5.7 * cm, "Mã NV", "NV-00256")
    field(c, 2 * cm, A4_H - 6.4 * cm, "Ngày vào làm", "2020-03-15")
    c.showPage()

    for i in range(pages_needed):
        img = Image.open(io.BytesIO(jpeg_bytes))
        c.drawInlineImage(img, 0, 0, A4_W, A4_H)
        # Mỗi trang sinh JPEG khác để tránh PDF deduplicate
        jpeg_bytes = make_noise_jpeg(img_w, img_h, quality=92)
        c.showPage()

    c.save()


# ─────────────────────────────────────────────────────────────────────────────
# 5) Stress PDF — base nhỏ + attachment padding để đạt size lớn
# ─────────────────────────────────────────────────────────────────────────────

def gen_stress_pdf(path: Path, target_mb: float) -> None:
    """Base PDF nhỏ + attachment binary padding để đạt target size."""
    c = canvas.Canvas(str(path), pagesize=A4)
    header(c, "TÀI LIỆU STRESS TEST", f"Target size: {target_mb}MB")
    c.setFont(FONT_NAME, 10)
    c.drawString(2 * cm, A4_H - 5 * cm,
                 "File này dùng để test giới hạn upload + storage của DocFlow.")
    c.drawString(2 * cm, A4_H - 5.7 * cm,
                 "Nội dung text cố ý ngắn, phần lớn dung lượng là binary padding.")
    c.save()

    inflate_to(path, target_mb)


# ─────────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────────

JOBS = [
    # (filename, generator, kwargs, target_size_mb_for_inflate)
    ("invoice-small-pass.pdf",     "invoice",  {"passing": True},  0.2),
    ("invoice-small-fail.pdf",     "invoice",  {"passing": False}, 0.2),
    ("contract-medium-pass.pdf",   "contract", {"passing": True},  2.0),
    ("contract-medium-fail.pdf",   "contract", {"passing": False}, 2.0),
    ("hr-leave-pass.pdf",          "hr",       {"passing": True},  0.5),
    ("hr-leave-fail.pdf",          "hr",       {"passing": False}, 0.5),
    ("scan-large-pass.pdf",        "scan",     {"target_mb": 25},  None),
    ("scan-xlarge-pass.pdf",       "scan",     {"target_mb": 100}, None),
    ("upload-stress-200mb.pdf",    "stress",   {"target_mb": 200}, None),
    ("upload-stress-500mb.pdf",    "stress",   {"target_mb": 500}, None),
]

GENERATORS = {
    "invoice":  gen_invoice,
    "contract": gen_contract,
    "hr":       gen_hr_leave,
    "scan":     gen_scan_pdf,
    "stress":   gen_stress_pdf,
}


def main() -> None:
    skip_existing = "--force" not in sys.argv
    only = None
    for a in sys.argv[1:]:
        if a.startswith("--only="):
            only = a.split("=", 1)[1]

    print(f"\n[gen] output → {OUT_DIR.relative_to(ROOT)}\n")
    for fname, kind, kwargs, inflate_mb in JOBS:
        if only and only not in fname:
            continue
        out = OUT_DIR / fname
        if out.exists() and skip_existing:
            size_mb = out.stat().st_size / (1024 * 1024)
            print(f"  ↺ {fname}  ({size_mb:.1f}MB) — exists, skip (--force để gen lại)")
            continue

        print(f"  ▸ {fname} ({kind}, {kwargs})")
        gen = GENERATORS[kind]
        gen(out, **kwargs)
        if inflate_mb is not None:
            inflate_to(out, inflate_mb)

        size_mb = out.stat().st_size / (1024 * 1024)
        print(f"    ✓ {size_mb:.2f}MB")

    print("\n[gen] done.")
    total = sum(f.stat().st_size for f in OUT_DIR.glob("*.pdf"))
    print(f"[gen] tổng dung lượng: {total / (1024 * 1024):.1f}MB ({total / (1024**3):.2f}GB)")


if __name__ == "__main__":
    main()
