# Hướng dẫn tạo seed data & PDF fixture

Tài liệu này hướng dẫn cách:

1. Bơm **seed data** (phòng ban, user, biểu mẫu, quy tắc) vào DocFlow qua API.
2. Sinh **PDF fixture** (10 file, 200KB → 500MB) để upload trong các kịch bản test.

---

## 1. Cấu trúc dữ liệu

```
data/
├── seed/
│   ├── departments.json        # 5 phòng ban (KT, PC, NS, KD, IT)
│   ├── users.json              # 500 user (đầy đủ profile + department_code)
│   ├── forms.json              # 30 biểu mẫu (FormTemplateCreate payload)
│   ├── rules.json              # 30 quy tắc (RuleCreate payload)
│   └── department-ids.json     # ← do seed.sh sinh ra sau khi tạo phòng ban
├── users-import.csv            # 500 user đúng template hệ thống (UTF-8 BOM)
└── fixtures/
    ├── sample.pdf              # PDF mẫu sẵn có
    └── pdfs/                   # ← do gen_test_pdfs.sh sinh ra
        ├── invoice-small-pass.pdf
        ├── invoice-small-fail.pdf
        ├── contract-medium-pass.pdf
        ├── contract-medium-fail.pdf
        ├── hr-leave-pass.pdf
        ├── hr-leave-fail.pdf
        ├── scan-large-pass.pdf
        ├── scan-xlarge-pass.pdf
        ├── upload-stress-200mb.pdf
        └── upload-stress-500mb.pdf
```

Các file `data/seed/*.json` và `data/users-import.csv` là **source of truth** — chỉnh trực tiếp nếu muốn đổi dataset.

---

## 2. Seed data — push lên DocFlow qua API

### 2.1. Yêu cầu

- `bash`, `curl`, `jq` (macOS có sẵn `curl` + `jq`)
- Hệ thống DocFlow đang chạy (mặc định `http://localhost:29002/api`)
- Tài khoản admin có quyền tạo phòng ban / import user / tạo form / tạo rule

### 2.2. Biến môi trường

| Biến             | Mặc định                      | Ghi chú                              |
| ---------------- | ----------------------------- | ------------------------------------ |
| `BASE_URL`       | `http://localhost:29002/api`  | URL gốc API (không có dấu `/` cuối)  |
| `ADMIN_USERNAME` | `admin`                       | Tài khoản admin                      |
| `ADMIN_PASSWORD` | `admin123`                    | Mật khẩu admin                       |

### 2.3. Chạy đầy đủ (one command)

```bash
./scripts/seed.sh
```

Thứ tự thực hiện:

1. **Login** admin → lấy `access_token` + `csrf_token`
2. **POST `/v1/departments`** ← `data/seed/departments.json` (skip nếu trùng tên)
3. **POST `/v1/users/import`** ← `data/users-import.csv` (preview trước → import)
4. **POST `/v1/form-templates`** ← `data/seed/forms.json` (mapping `department_code` → `department_id`)
5. **POST `/v1/rules`** ← `data/seed/rules.json` (mapping tương tự)

### 2.4. Chạy từng phần

```bash
./scripts/seed.sh --depts-only      # chỉ tạo 5 phòng ban
./scripts/seed.sh --users-only      # chỉ import 500 user (preview + import)
./scripts/seed.sh --preview-users   # chỉ preview CSV, KHÔNG import thật
./scripts/seed.sh --forms-only      # chỉ tạo 30 form (cần department-ids.json)
./scripts/seed.sh --rules-only      # chỉ tạo 30 rule (cần department-ids.json)
```

### 2.5. Chạy với server khác

```bash
BASE_URL=http://staging.docflow.local:29002/api \
ADMIN_USERNAME=admin ADMIN_PASSWORD='your-secret' \
./scripts/seed.sh
```

### 2.6. Phân bổ dữ liệu mặc định

| Loại        | Số lượng | Phân bố                                                 |
| ----------- | -------: | ------------------------------------------------------- |
| Departments | 5        | KT (Kế toán), PC (Pháp chế), NS (Nhân sự), KD (Kinh doanh), IT |
| Users       | 500      | 470 user / 25 manager / 5 admin, round-robin 5 phòng ban       |
| Forms       | 30       | 6 form / phòng ban, mỗi form 3-5 field                          |
| Rules       | 30       | 6 rule / phòng ban, mix `prompt`/`expression`, severity error/warning/info |

> ⚠️ **Forms & Rules không check trùng tên** — chạy `seed.sh` 2 lần sẽ tạo bản sao.
> Cần thì xóa thủ công hoặc reset DB trước khi chạy lại.

---

## 3. PDF fixture — sinh file test để upload

### 3.1. Yêu cầu

- Python 3.8+
- Deps: `reportlab`, `Pillow`, `pypdf` (script tự cài qua `pip`)
- macOS: dùng font `Arial Unicode` để render tiếng Việt (auto-detect)

### 3.2. Chạy đầy đủ

```bash
./scripts/gen_test_pdfs.sh
```

Lần đầu sẽ cài 3 package Python + sinh 10 file vào `data/fixtures/pdfs/`. Thời gian tổng ~3-5 phút (chủ yếu là 2 file stress 200MB/500MB).

### 3.3. Chạy với flag

```bash
./scripts/gen_test_pdfs.sh --skip-install     # đã cài deps rồi
./scripts/gen_test_pdfs.sh --force            # gen lại file đã tồn tại
./scripts/gen_test_pdfs.sh --only=invoice     # chỉ gen file có "invoice" trong tên
./scripts/gen_test_pdfs.sh --only=stress      # chỉ gen file 200MB + 500MB
```

### 3.4. Bộ 10 file output

| File                          | Size  | Pages | Mục đích                                          |
| ----------------------------- | -----:| -----:| ------------------------------------------------- |
| `invoice-small-pass.pdf`      | 200KB | 1     | Hóa đơn GTGT hợp lệ (đủ MST, thuế 10%, số tiền >0) |
| `invoice-small-fail.pdf`      | 200KB | 1     | Vi phạm: thiếu MST, thuế 15%, số tiền âm, ngày 2099 |
| `hr-leave-pass.pdf`           | 500KB | 1     | Đơn nghỉ 7 ngày, có phê duyệt                      |
| `hr-leave-fail.pdf`           | 500KB | 1     | Vi phạm: nghỉ 76 ngày (>30), chưa phê duyệt         |
| `contract-medium-pass.pdf`    | 2MB   | 4     | Hợp đồng đủ chữ ký A+B, dấu đỏ, ngày hợp lệ        |
| `contract-medium-fail.pdf`    | 2MB   | 4     | Vi phạm: thiếu ký B, không dấu, ngày sai, số tiền âm |
| `scan-large-pass.pdf`         | 32MB  | 28    | Scan ảnh nhiều trang, stress OCR realistic         |
| `scan-xlarge-pass.pdf`        | 128MB | 108   | Hồ sơ scan độ phân giải cao, OCR ở giới hạn thật   |
| `upload-stress-200mb.pdf`     | 200MB | 1     | Test upload throughput (base PDF + binary padding) |
| `upload-stress-500mb.pdf`     | 500MB | 1     | Test upload limit + timeout                        |

**Đặc điểm kỹ thuật:**

- **Small/medium files** (≤2MB): nội dung text tiếng Việt từ form blueprint, có chữ ký vẽ tay + dấu đỏ mô phỏng cho case PASS.
- **Scan files**: mỗi trang là 1 JPEG nhiễu mô phỏng trang giấy scan (~1MB/trang).
- **Stress files**: 1 trang nội dung ngắn + binary padding nhúng làm PDF attachment để đạt size mục tiêu. Phần lớn dung lượng là padding → không phù hợp test OCR/extraction, chỉ phù hợp test upload pipeline.
- **PASS/FAIL labels** ở footer mỗi PDF để verify mắt thường khi debug.

---

## 4. Quy trình điển hình (end-to-end)

```bash
# 1. Khởi tạo dataset trên hệ thống DocFlow
./scripts/seed.sh

# 2. Sinh file PDF để upload
./scripts/gen_test_pdfs.sh

# 3. Bắt đầu chạy k6 load test (xem tests/)
k6 run tests/luong-07/load.js
```

---

## 5. Troubleshooting

### `pip: command not found`

Script `gen_test_pdfs.sh` dùng `python3 -m pip` rồi. Nếu vẫn lỗi:

```bash
python3 -m ensurepip --upgrade
python3 -m pip install -r <(echo -e "reportlab\nPillow\npypdf")
./scripts/gen_test_pdfs.sh --skip-install
```

### Treo ở bước `▶ Forms` / `▶ Rules`

Xảy ra khi `jq` đợi stdin. Đảm bảo dùng version mới nhất của `seed.sh` (đã fix bằng `--argjson idx` thay vì `--args`).

### `missing department-ids.json — chạy --depts-only trước`

`seed.sh --forms-only` và `--rules-only` cần file map `code → dept_id` được sinh ở bước departments. Chạy `./scripts/seed.sh --depts-only` trước.

### Login failed (HTTP 401)

Kiểm tra:
```bash
curl -X POST "$BASE_URL/v1/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin123"}'
```

Sai password → set `ADMIN_PASSWORD` env var rồi chạy lại.

### Forms/Rules trả về 400 do trùng tên

Hệ thống reject vì `name` đã tồn tại. Xóa thủ công bằng UI hoặc reset DB. Nếu cần re-run idempotent, đổi `name` trong `data/seed/{forms,rules}.json` rồi chạy lại.

### Upload PDF lớn timeout

File 200MB/500MB có thể vượt giới hạn của API gateway / proxy. Kiểm tra:
- nginx `client_max_body_size`
- uvicorn/gunicorn `--limit-request-line` / `--limit-request-field_size`
- timeout của client (k6 mặc định 60s — cần tăng cho file lớn)

---

## 6. Tuỳ biến dataset

Tất cả dữ liệu seed là JSON / CSV thuần — chỉnh trực tiếp file rồi chạy lại `seed.sh`:

- Thêm phòng ban: append vào `data/seed/departments.json` (cần field `code`, `name`, `description`).
- Đổi role split: edit `data/users-import.csv` + `data/seed/users.json`.
- Thêm field cho biểu mẫu: edit `fields[]` trong `data/seed/forms.json` (xem schema `FormFieldCreate` trong `docs/api.json`).
- Đổi rule condition: edit `condition` trong `data/seed/rules.json`. `rule_type` chỉ có 2 giá trị: `prompt` hoặc `expression`.

PDF fixture: chỉnh blueprint trong [scripts/gen_test_pdfs.py](gen_test_pdfs.py), section `JOBS` để đổi danh sách / target size.
