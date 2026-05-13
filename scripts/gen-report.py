#!/usr/bin/env python3
"""
Tổng hợp kết quả 5 k6 test thành 1 file HTML.

Usage:
    python3 scripts/gen-report.py results/luong-01-smoke-*.json \
                                   results/luong-01-load-*.json  \
                                   ...
    # Hoặc gọi tự động từ run-all.sh (truyền danh sách file JSON qua args)
"""

import json, sys, re
from pathlib import Path
from datetime import datetime

# ── Helpers ───────────────────────────────────────────────────────────────────

def parse_threshold(expr: str, metric_values: dict) -> tuple[float | None, str]:
    """Trả về (actual_value, unit) từ metric values dựa trên threshold expression."""
    expr = expr.strip()
    if expr.startswith("p("):
        m = re.match(r"p\((\d+)\)\s*<\s*[\d.]+", expr)
        if m:
            pct = m.group(1)
            key = f"p({pct})"
            val = metric_values.get(key) or metric_values.get(f"p({pct}.0)")
            return (round(val, 1) if val is not None else None, "ms")
    if expr.startswith("rate"):
        val = metric_values.get("rate")
        return (round(val * 100, 2) if val is not None else None, "%")
    if expr.startswith("count") or expr.startswith("value"):
        val = metric_values.get("count") or metric_values.get("value")
        return (val, "")
    return (None, "")


def load_json(path: Path) -> dict:
    try:
        return json.loads(path.read_text())
    except Exception as e:
        print(f"[WARN] cannot read {path}: {e}", file=sys.stderr)
        return {}


def test_label(filename: str) -> str:
    """luong-01-smoke-2026-... → smoke"""
    parts = Path(filename).stem.split("-")
    for i, p in enumerate(parts):
        if p in ("smoke", "load", "stress", "spike", "soak"):
            return p
    return Path(filename).stem


ORDER = ["smoke", "load", "stress", "spike", "soak"]
TYPE_DESC = {
    "smoke":  "Kiểm tra script hoạt động với tải tối thiểu",
    "load":   "Kiểm tra hành vi ở tải bình thường (20 VUs / 15 phút)",
    "stress": "Tìm ngưỡng hệ thống bắt đầu suy giảm",
    "spike":  "Kiểm tra hành vi khi traffic tăng đột ngột",
    "soak":   "Phát hiện memory/connection leak ở tải dài hạn (2 giờ)",
}

# ── HTML template ─────────────────────────────────────────────────────────────

CSS = """
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Segoe UI', sans-serif; background: #f4f6f9; color: #1a1a2e; }
header { background: #1a1a2e; color: #fff; padding: 24px 40px; }
header h1 { font-size: 22px; font-weight: 600; }
header p  { font-size: 13px; color: #aab; margin-top: 4px; }
main { max-width: 1100px; margin: 32px auto; padding: 0 24px; }
h2 { font-size: 16px; font-weight: 600; margin: 32px 0 12px; color: #1a1a2e; border-left: 4px solid #4361ee; padding-left: 10px; }
h3 { font-size: 14px; font-weight: 600; margin: 20px 0 8px; color: #444; }

/* Summary table */
.summary-table { width: 100%; border-collapse: collapse; background: #fff;
  box-shadow: 0 1px 4px rgba(0,0,0,.08); border-radius: 8px; overflow: hidden; margin-bottom: 8px; }
.summary-table th { background: #1a1a2e; color: #fff; font-size: 12px; text-align: left;
  padding: 10px 14px; text-transform: uppercase; letter-spacing: .05em; }
.summary-table td { padding: 10px 14px; font-size: 13px; border-bottom: 1px solid #eef; }
.summary-table tr:last-child td { border-bottom: none; }
.summary-table tr:hover td { background: #f8faff; }

/* Test section */
.test-card { background: #fff; border-radius: 8px; box-shadow: 0 1px 4px rgba(0,0,0,.08);
  margin-bottom: 24px; overflow: hidden; }
.test-card-header { padding: 14px 20px; display: flex; align-items: center; gap: 12px;
  border-bottom: 1px solid #eef; }
.test-card-header h3 { margin: 0; font-size: 15px; }
.test-card-header p  { margin: 2px 0 0; font-size: 12px; color: #777; }
.test-card-body { padding: 16px 20px; }

/* Threshold table */
.thr-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.thr-table th { text-align: left; padding: 6px 10px; background: #f4f6f9;
  font-weight: 600; color: #555; border-bottom: 2px solid #e0e4ef; }
.thr-table td { padding: 6px 10px; border-bottom: 1px solid #f0f2f8; }
.thr-table tr:last-child td { border-bottom: none; }
.metric-name { font-family: monospace; color: #333; }
.thr-expr { font-family: monospace; color: #555; }

/* Badges */
.badge { display: inline-block; padding: 2px 9px; border-radius: 12px;
  font-size: 11px; font-weight: 700; letter-spacing: .04em; }
.badge-pass   { background: #d1fae5; color: #065f46; }
.badge-fail   { background: #fee2e2; color: #991b1b; }
.badge-skip   { background: #f3f4f6; color: #6b7280; }
.badge-nodata { background: #fff3cd; color: #856404; }

/* Stat pills */
.stats { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; }
.stat  { background: #f4f6f9; border-radius: 6px; padding: 6px 12px; font-size: 12px; }
.stat span { font-weight: 700; font-size: 13px; display: block; }

.actual-ok   { color: #065f46; font-weight: 600; }
.actual-fail { color: #991b1b; font-weight: 600; }
.actual-na   { color: #aaa; }
"""

def badge(status: str) -> str:
    cls = {"PASS": "badge-pass", "FAIL": "badge-fail",
           "SKIP": "badge-skip", "NO DATA": "badge-nodata"}.get(status, "badge-skip")
    return f'<span class="badge {cls}">{status}</span>'


def render_threshold_rows(metrics: dict) -> str:
    rows = []
    for metric_name, metric in sorted(metrics.items()):
        thresholds = metric.get("thresholds", {})
        if not thresholds:
            continue
        values = metric.get("values", {})
        for expr, result in thresholds.items():
            ok = result.get("ok", False)
            actual, unit = parse_threshold(expr, values)
            if actual is not None:
                actual_html = (
                    f'<span class="actual-ok">{actual}{unit}</span>'
                    if ok else
                    f'<span class="actual-fail">{actual}{unit}</span>'
                )
            else:
                actual_html = '<span class="actual-na">—</span>'
            rows.append(
                f"<tr>"
                f'<td class="metric-name">{metric_name}</td>'
                f'<td class="thr-expr">{expr}</td>'
                f"<td>{actual_html}</td>"
                f"<td>{badge('PASS' if ok else 'FAIL')}</td>"
                f"</tr>"
            )
    return "\n".join(rows)


def render_stats(metrics: dict) -> str:
    pills = []
    dur = metrics.get("http_req_duration", {}).get("values", {})
    if dur:
        pills.append(f'<div class="stat"><span>{dur.get("p(95)", dur.get("p(95.0)", "—")):.0f} ms</span>p(95)</div>')
        pills.append(f'<div class="stat"><span>{dur.get("avg", 0):.0f} ms</span>avg</div>')
        pills.append(f'<div class="stat"><span>{dur.get("max", 0):.0f} ms</span>max</div>')
    failed = metrics.get("http_req_failed", {}).get("values", {})
    if failed:
        rate = failed.get("rate", 0)
        pills.append(f'<div class="stat"><span>{rate*100:.2f}%</span>error rate</div>')
    reqs = metrics.get("http_reqs", {}).get("values", {})
    if reqs:
        pills.append(f'<div class="stat"><span>{reqs.get("count", 0):.0f}</span>total requests</div>')
        pills.append(f'<div class="stat"><span>{reqs.get("rate", 0):.1f}/s</span>req/s</div>')
    return '<div class="stats">' + "".join(pills) + "</div>" if pills else ""


def render_test_card(label: str, data: dict) -> str:
    metrics = data.get("metrics", {})
    # Count pass/fail thresholds
    all_thr = [(expr, r) for m in metrics.values() for expr, r in m.get("thresholds", {}).items()]
    n_pass = sum(1 for _, r in all_thr if r.get("ok"))
    n_fail = sum(1 for _, r in all_thr if not r.get("ok"))
    overall = "PASS" if n_fail == 0 and all_thr else ("FAIL" if n_fail > 0 else "NO DATA")

    desc = TYPE_DESC.get(label, "")
    thr_rows = render_threshold_rows(metrics)
    stats = render_stats(metrics)

    thr_section = ""
    if thr_rows:
        thr_section = f"""
        <table class="thr-table">
          <thead>
            <tr><th>Metric</th><th>Threshold</th><th>Actual</th><th>Result</th></tr>
          </thead>
          <tbody>{thr_rows}</tbody>
        </table>"""
    else:
        thr_section = '<p style="color:#aaa;font-size:12px">Không có dữ liệu threshold.</p>'

    return f"""
<div class="test-card">
  <div class="test-card-header">
    <div>
      <h3>{label.upper()}</h3>
      <p>{desc}</p>
    </div>
    <div style="margin-left:auto;display:flex;gap:8px;align-items:center">
      <span style="font-size:12px;color:#aaa">{n_pass} pass / {n_fail} fail</span>
      {badge(overall)}
    </div>
  </div>
  <div class="test-card-body">
    {stats}
    {thr_section}
  </div>
</div>"""


def render_summary_table(entries: list[dict]) -> str:
    rows = ""
    for e in entries:
        rows += (
            f"<tr>"
            f'<td><strong>{e["label"].upper()}</strong></td>'
            f'<td style="font-size:11px;color:#777">{TYPE_DESC.get(e["label"], "")}</td>'
            f"<td>{badge(e['overall'])}</td>"
            f"<td>{e['n_thr']}</td>"
            f'<td style="color:{"#065f46" if e["n_fail"]==0 else "#991b1b"}">'
            f'{e["n_pass"]}/{e["n_thr"]}</td>'
            f"<td>{e['p95']}</td>"
            f"<td>{e['error_rate']}</td>"
            f"</tr>"
        )
    return f"""
<table class="summary-table">
  <thead>
    <tr><th>Test</th><th>Mục tiêu</th><th>Kết quả</th>
        <th>Thresholds</th><th>Pass</th><th>p(95) ms</th><th>Error rate</th></tr>
  </thead>
  <tbody>{rows}</tbody>
</table>"""


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    if len(sys.argv) < 2:
        sys.exit("Usage: gen-report.py <file1.json> [file2.json ...]")

    files = [Path(p) for p in sys.argv[1:] if Path(p).exists()]
    if not files:
        sys.exit("Không tìm thấy file JSON nào.")

    # Group by test label, giữ file mới nhất
    by_label: dict[str, tuple[Path, dict]] = {}
    for f in files:
        label = test_label(f.name)
        if label not in by_label or f.stat().st_mtime > by_label[label][0].stat().st_mtime:
            by_label[label] = (f, load_json(f))

    # Sắp xếp theo thứ tự cố định
    ordered = [(l, *by_label[l]) for l in ORDER if l in by_label]
    # Thêm các label ngoài ORDER (nếu có)
    for l in sorted(by_label):
        if l not in ORDER:
            ordered.append((l, *by_label[l]))

    # Build summary entries
    summary_entries = []
    for label, _, data in ordered:
        metrics = data.get("metrics", {})
        all_thr = [(expr, r) for m in metrics.values() for expr, r in m.get("thresholds", {}).items()]
        n_pass = sum(1 for _, r in all_thr if r.get("ok"))
        n_fail = sum(1 for _, r in all_thr if not r.get("ok"))
        overall = "PASS" if n_fail == 0 and all_thr else ("FAIL" if n_fail > 0 else "NO DATA")
        dur = metrics.get("http_req_duration", {}).get("values", {})
        p95_raw = dur.get("p(95)") or dur.get("p(95.0)")
        p95 = f"{p95_raw:.0f} ms" if p95_raw else "—"
        failed = metrics.get("http_req_failed", {}).get("values", {})
        er = failed.get("rate")
        error_rate = f"{er*100:.2f}%" if er is not None else "—"
        summary_entries.append({"label": label, "overall": overall,
                                 "n_thr": len(all_thr), "n_pass": n_pass,
                                 "n_fail": n_fail, "p95": p95, "error_rate": error_rate})

    # Build test cards
    cards_html = "\n".join(render_test_card(label, data) for label, _, data in ordered)

    # Count overall
    n_pass_total = sum(1 for e in summary_entries if e["overall"] == "PASS")
    n_fail_total = sum(1 for e in summary_entries if e["overall"] == "FAIL")
    overall_badge = badge("PASS" if n_fail_total == 0 else "FAIL")

    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    luong_name = "luong-01"  # detect from filenames if needed
    for _, f, _ in ordered:
        m = re.search(r"(luong-\d+)", f.name)
        if m:
            luong_name = m.group(1)
            break

    html = f"""<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>K6 Report — {luong_name}</title>
  <style>{CSS}</style>
</head>
<body>
<header>
  <h1>K6 Performance Report — {luong_name.upper()}</h1>
  <p>Tạo lúc {ts} &nbsp;·&nbsp; {n_pass_total} PASS / {n_fail_total} FAIL &nbsp;·&nbsp; {overall_badge}</p>
</header>
<main>
  <h2>Tổng quan</h2>
  {render_summary_table(summary_entries)}

  <h2>Chi tiết Thresholds</h2>
  {cards_html}
</main>
</body>
</html>"""

    out_dir  = Path("results")
    out_dir.mkdir(exist_ok=True)
    out_file = out_dir / f"{luong_name}-report-{datetime.now().strftime('%Y-%m-%dT%H-%M-%S')}.html"
    out_file.write_text(html)
    print(f"[report] {out_file}")


if __name__ == "__main__":
    main()
