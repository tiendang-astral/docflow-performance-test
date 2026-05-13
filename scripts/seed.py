#!/usr/bin/env python3
"""
DocFlow Load-Test Seed Script
==============================
Tạo test data quy mô lớn cho k6 load tests.

Mặc định (--count 100) tạo:
  • 5   departments
  • 100 users   (80 user · 10 admin · 10 leader)
  • Gắn users vào departments (round-robin)
  • 30  templates  (có fields) → approve
  • 20  rules → approve
  • 100 dossiers (gắn template)

Kết quả: data/fixtures/seed-result.json
         data/users.json  (cập nhật với toàn bộ load-test users)

Usage:
    python3 scripts/seed.py
    python3 scripts/seed.py --count 200
    python3 scripts/seed.py --base-url http://staging:29002/api
    python3 scripts/seed.py --dry-run
"""

import argparse, json, math, os, sys
from pathlib import Path

try:
    import requests
except ImportError:
    sys.exit("Thiếu requests: pip install requests")

BASE_DIR   = Path(__file__).parent.parent
USERS_FILE = BASE_DIR / "data" / "users.json"
OUT_FILE   = BASE_DIR / "data" / "fixtures" / "seed-result.json"

DEFAULT_BASE_URL = "http://localhost:29002/api"
ADMIN_USER       = {"username": "admin", "password": "admin123"}
LT_PASSWORD      = "LoadTest@123"


# ── Data generators ────────────────────────────────────────────────────────

DEPT_NAMES = [
    ("Phòng Hành chính",       "Quản lý hành chính và nhân sự"),
    ("Phòng Kỹ thuật",         "Phát triển và vận hành hệ thống"),
    ("Phòng Kinh doanh",       "Quản lý hợp đồng và khách hàng"),
    ("Phòng Kế toán",          "Quản lý tài chính và kế toán"),
    ("Phòng Pháp chế",         "Tư vấn pháp lý và tuân thủ"),
]

TEMPLATE_TOPICS = [
    ("Hợp đồng Lao động",      "hop-dong-lao-dong",  [
        ("ho_ten",       "Họ và tên",         "text",   True),
        ("ngay_sinh",    "Ngày sinh",          "date",   True),
        ("chuc_vu",      "Chức vụ",            "text",   True),
        ("luong",        "Mức lương (VNĐ)",    "number", True),
        ("ngay_ky",      "Ngày ký HĐ",         "date",   True),
        ("thoi_han",     "Thời hạn HĐ",        "text",   False),
    ]),
    ("Hoá đơn GTGT",           "hoa-don-gtgt",       [
        ("so_hoa_don",   "Số hoá đơn",         "text",   True),
        ("ngay_lap",     "Ngày lập",           "date",   True),
        ("ten_don_vi",   "Tên đơn vị bán",     "text",   True),
        ("ma_so_thue",   "Mã số thuế",         "text",   True),
        ("tong_tien",    "Tổng tiền",          "number", True),
        ("thue_gtgt",    "Thuế GTGT 10%",      "number", True),
    ]),
    ("Biên bản Nghiệm thu",    "bien-ban-nghiem-thu",[
        ("ten_cong_trinh","Tên công trình",    "text",   True),
        ("ngay_nghiem_thu","Ngày nghiệm thu",  "date",   True),
        ("ket_qua",      "Kết quả",            "text",   True),
        ("gia_tri",      "Giá trị nghiệm thu", "number", False),
        ("ghi_chu",      "Ghi chú",            "text",   False),
    ]),
    ("Phiếu Nhập kho",         "phieu-nhap-kho",     [
        ("ma_hang",      "Mã hàng hoá",        "text",   True),
        ("ten_hang",     "Tên hàng hoá",       "text",   True),
        ("so_luong",     "Số lượng nhập",      "number", True),
        ("don_gia",      "Đơn giá",            "number", True),
        ("ngay_nhap",    "Ngày nhập kho",      "date",   True),
    ]),
    ("Hợp đồng Mua bán",       "hop-dong-mua-ban",   [
        ("ben_mua",      "Bên mua",            "text",   True),
        ("ben_ban",      "Bên bán",            "text",   True),
        ("hang_hoa",     "Hàng hoá/Dịch vụ",  "text",   True),
        ("gia_tri_hd",   "Giá trị HĐ",         "number", True),
        ("ngay_ky",      "Ngày ký",            "date",   True),
        ("ngay_hieu_luc","Ngày hiệu lực",      "date",   False),
    ]),
    ("Đề xuất Mua sắm",        "de-xuat-mua-sam",    [
        ("ten_hang",     "Tên hàng cần mua",   "text",   True),
        ("so_luong",     "Số lượng",           "number", True),
        ("don_gia_dk",   "Đơn giá dự kiến",    "number", True),
        ("ly_do",        "Lý do mua sắm",      "text",   True),
        ("ngay_can",     "Ngày cần có",        "date",   False),
    ]),
    ("Phiếu Chi",              "phieu-chi",           [
        ("nguoi_nhan",   "Người nhận tiền",    "text",   True),
        ("so_tien",      "Số tiền",            "number", True),
        ("noi_dung",     "Nội dung chi",       "text",   True),
        ("ngay_chi",     "Ngày chi",           "date",   True),
        ("nguoi_ky",     "Người ký duyệt",     "text",   False),
    ]),
    ("Báo cáo Công tác",       "bao-cao-cong-tac",   [
        ("tieu_de",      "Tiêu đề báo cáo",    "text",   True),
        ("nguoi_lap",    "Người lập",          "text",   True),
        ("thoi_gian",    "Thời gian",          "text",   True),
        ("noi_dung",     "Nội dung chính",     "text",   True),
        ("ket_luan",     "Kết luận",           "text",   False),
    ]),
    ("Tờ trình",               "to-trinh",            [
        ("tieu_de",      "Tiêu đề",            "text",   True),
        ("nguoi_trinh",  "Người trình",        "text",   True),
        ("nguoi_duyet",  "Người duyệt",        "text",   True),
        ("noi_dung",     "Nội dung đề xuất",   "text",   True),
        ("ngay_lap",     "Ngày lập",           "date",   True),
    ]),
    ("Biên bản Họp",           "bien-ban-hop",        [
        ("chu_tri",      "Người chủ trì",      "text",   True),
        ("thanh_phan",   "Thành phần tham dự", "text",   True),
        ("ngay_hop",     "Ngày họp",           "date",   True),
        ("noi_dung",     "Nội dung cuộc họp",  "text",   True),
        ("ket_luan",     "Kết luận / Kiến nghị","text",  True),
    ]),
]

RULE_TEMPLATES = [
    ("Kiểm tra ngày hợp lệ",      "Ngày hiệu lực phải sau ngày ký. Nếu không thỏa mãn trả về lỗi."),
    ("Kiểm tra số tiền dương",     "Tất cả trường số tiền phải lớn hơn 0."),
    ("Kiểm tra mã số thuế",        "Mã số thuế phải gồm 10 hoặc 13 chữ số."),
    ("Kiểm tra tuổi hợp đồng",     "Người ký hợp đồng phải từ đủ 18 tuổi trở lên."),
    ("Kiểm tra thời hạn hiệu lực", "Thời hạn hợp đồng không được vượt quá 36 tháng."),
    ("Kiểm tra số lượng dương",    "Số lượng nhập kho phải lớn hơn 0 và là số nguyên."),
    ("Kiểm tra đơn giá hợp lý",    "Đơn giá không được phép âm hoặc bằng 0."),
    ("Kiểm tra ngày lập báo cáo",  "Ngày lập báo cáo không được vượt quá ngày hiện tại."),
    ("Kiểm tra chữ ký bắt buộc",   "Người ký duyệt không được để trống trong tài liệu pháp lý."),
    ("Kiểm tra nội dung bắt buộc", "Trường nội dung chính không được để trống hoặc chỉ có khoảng trắng."),
]

DOSSIER_PREFIXES = [
    "Hồ sơ Nhân sự",
    "Hồ sơ Kế toán",
    "Hồ sơ Nghiệm thu",
    "Hồ sơ Hợp đồng",
    "Hồ sơ Mua sắm",
    "Hồ sơ Kiểm toán",
    "Hồ sơ Dự án",
    "Hồ sơ Pháp lý",
    "Hồ sơ Tài chính",
    "Hồ sơ Vận hành",
]

QUARTERS = ["Q1-2025", "Q2-2025", "Q3-2025", "Q4-2025",
            "Q1-2026", "Q2-2026", "T4-2026", "T5-2026"]


def gen_users(count: int) -> list[dict]:
    """Generate load-test user list: 80% user, 10% admin, 10% leader."""
    n_admin  = max(1, math.floor(count * 0.10))
    n_leader = max(1, math.floor(count * 0.10))
    n_user   = count - n_admin - n_leader
    users = []
    for i in range(1, n_user   + 1):
        users.append({"username": f"lt.user.{i:03d}",   "password": LT_PASSWORD, "role": "user"})
    for i in range(1, n_admin  + 1):
        users.append({"username": f"lt.admin.{i:03d}",  "password": LT_PASSWORD, "role": "admin"})
    for i in range(1, n_leader + 1):
        users.append({"username": f"lt.leader.{i:03d}", "password": LT_PASSWORD, "role": "user"})
    return users


def gen_templates(count: int) -> list[dict]:
    out = []
    for i in range(count):
        topic = TEMPLATE_TOPICS[i % len(TEMPLATE_TOPICS)]
        name, tag_base, fields = topic
        suffix = f" #{i // len(TEMPLATE_TOPICS) + 1}" if i >= len(TEMPLATE_TOPICS) else ""
        out.append({
            "name":        f"Mẫu {name}{suffix}",
            "description": f"Biểu mẫu tự động #{i+1} — {name}",
            "tags":        [tag_base, "load-test", f"batch-{i // 10 + 1}"],
            "fields":      [
                {"field_id": f[0], "field_name": f[1], "field_type": f[2],
                 "required": f[3], "description": f"Trường {f[1]}"}
                for f in fields
            ],
        })
    return out


def gen_rules(count: int) -> list[dict]:
    out = []
    for i in range(count):
        base = RULE_TEMPLATES[i % len(RULE_TEMPLATES)]
        suffix = f" #{i // len(RULE_TEMPLATES) + 1}" if i >= len(RULE_TEMPLATES) else ""
        out.append({
            "name":        f"{base[0]}{suffix}",
            "description": f"Rule tự động #{i+1}",
            "condition":   base[1],
            "rule_type":   "prompt",
            "tags":        ["validation", "load-test", f"batch-{i // 10 + 1}"],
        })
    return out


def gen_dossiers(count: int) -> list[dict]:
    out = []
    for i in range(count):
        prefix  = DOSSIER_PREFIXES[i % len(DOSSIER_PREFIXES)]
        quarter = QUARTERS[i % len(QUARTERS)]
        out.append({
            "name":        f"{prefix} {quarter} #{i+1:03d}",
            "description": f"Hồ sơ tự động #{i+1} — {prefix}",
            "tags":        ["load-test", f"batch-{i // 20 + 1}"],
        })
    return out


# ── HTTP client ────────────────────────────────────────────────────────────

class Client:
    def __init__(self, base_url: str, dry_run: bool = False):
        self.base_url = base_url.rstrip("/")
        self.dry_run  = dry_run
        self.session  = requests.Session()
        self.csrf     = ""
        self.access_token = ""
        self.refresh_token = ""

    def _url(self, path): return f"{self.base_url}{path}"

    def _headers(self, extra=None):
        h = {"Content-Type": "application/json"}
        cookie_parts = []
        if self.access_token:
            cookie_parts.append(f"docai_access_token={self.access_token}")
        if self.refresh_token:
            cookie_parts.append(f"docai_refresh_token={self.refresh_token}")
        if self.csrf:
            cookie_parts.append(f"docai_csrf_token={self.csrf}")
        if cookie_parts:
            h["Cookie"] = "; ".join(cookie_parts)
        if self.csrf: h["X-CSRF-Token"] = self.csrf
        if extra: h.update(extra)
        return h

    def login(self, username, password):
        if self.dry_run:
            print(f"[DRY] POST /v1/auth/login  {username}")
            return True
        res = self.session.post(self._url("/v1/auth/login"),
                                json={"username": username, "password": password})
        if res.status_code != 200:
            print(f"[ERROR] login: {res.status_code} {res.text[:200]}")
            return False
        body = res.json()
        self.access_token = body.get("access_token", "")
        self.refresh_token = body.get("refresh_token", "")
        csrf_res   = self.session.get(self._url("/v1/auth/csrf"), headers=self._headers())
        self.csrf  = (csrf_res.cookies.get("docai_csrf_token") or
                      (csrf_res.json().get("csrf_token", "") if csrf_res.content else ""))
        print(f"[OK] Logged in as {username}")
        return True

    def get(self, path, params=None):
        if self.dry_run: return {"items": [], "total": 0}
        res = self.session.get(self._url(path), params=params, headers=self._headers())
        res.raise_for_status()
        return res.json()

    def post(self, path, body):
        if self.dry_run:
            print(f"[DRY] POST {path}  {str(body)[:80]}")
            return {"id": f"dry-{path.split('/')[-1]}"}
        res = self.session.post(self._url(path), json=body, headers=self._headers())
        if res.status_code not in (200, 201):
            print(f"[WARN] POST {path} → {res.status_code}: {res.text[:150]}")
            return {}
        return res.json()

    def put(self, path, body=None):
        if self.dry_run:
            print(f"[DRY] PUT {path}")
            return {}
        res = self.session.put(self._url(path), json=body or {}, headers=self._headers())
        if res.status_code not in (200, 201, 204):
            print(f"[WARN] PUT {path} → {res.status_code}: {res.text[:150]}")
        return res.json() if res.content else {}

    def fetch_all(self, path, tag="items"):
        """Fetch all pages of a paginated list."""
        page, size, out = 1, 100, []
        while True:
            data  = self.get(path, {"page": page, "size": size})
            items = data.get(tag, [])
            out  += items
            if len(items) < size: break
            page += 1
        return out


# ── Seed steps ─────────────────────────────────────────────────────────────

def seed_departments(c: Client) -> list:
    existing = {d["name"]: d for d in c.fetch_all("/v1/departments")}
    result = []
    for dept in DEPT_NAMES:
        name, desc = dept
        if name in existing:
            print(f"  [skip] {name}")
            result.append(existing[name])
        else:
            d = c.post("/v1/departments", {"name": name, "description": desc})
            if d.get("id"):
                print(f"  [+] {name}  id={d['id']}")
                result.append(d)
    return result


def seed_users(c: Client, lt_users: list, departments: list) -> list:
    existing = {u["username"] for u in c.fetch_all("/v1/users")}
    created  = []
    skipped  = 0
    for i, user in enumerate(lt_users):
        uname = user["username"]
        if uname in existing:
            skipped += 1
            continue
        api_role = "admin" if "admin" in uname else "user"
        payload  = {
            "username":  uname,
            "email":     f"{uname}@loadtest.local",
            "full_name": uname.replace(".", " ").title(),
            "role":      api_role,
            "password":  user["password"],
            "is_active": True,
        }
        r = c.post("/v1/users", payload)
        if r.get("id"):
            created.append(r)
    if skipped:
        print(f"  [skip] {skipped} users already exist")
    print(f"  [+] created {len(created)} new users")

    # Fetch full list with IDs for member assignment
    all_users = c.fetch_all("/v1/users")
    lt_map    = {u["username"]: u for u in all_users if u["username"].startswith("lt.")}
    return list(lt_map.values())


def seed_members(c: Client, users: list, departments: list) -> None:
    if not departments: return
    for i, user in enumerate(users):
        uid  = user.get("id")
        dept = departments[i % len(departments)]
        did  = dept.get("id")
        if not uid or not did: continue
        uname     = user.get("username", "")
        dept_role = "head" if ("leader" in uname or "admin" in uname) else "member"
        c.post(f"/v1/departments/{did}/members", {"user_id": uid, "role_in_department": dept_role})
    print(f"  [+] assigned {len(users)} users to departments")


def seed_templates(c: Client, templates_def: list, departments: list) -> list:
    existing = {t["name"]: t for t in c.fetch_all("/v1/templates")}
    result, skipped = [], 0
    for i, tmpl in enumerate(templates_def):
        existing_tmpl = existing.get(tmpl["name"])
        if existing_tmpl:
            skipped += 1
            result.append(existing_tmpl)
            continue
        dept_id = departments[i % len(departments)]["id"] if departments else None
        payload = {k: v for k, v in tmpl.items() if k != "fields"}
        if dept_id: payload["department_id"] = dept_id
        created = c.post("/v1/templates", payload)
        if not created.get("id"): continue
        tid = created["id"]
        for field in tmpl["fields"]:
            c.post(f"/v1/templates/{tid}/fields", field)
        c.put(f"/v1/templates/{tid}/approve")
        result.append(created)
    if skipped: print(f"  [skip] {skipped} templates already exist")
    print(f"  [+] created & approved {len(result)} templates")
    return result


def seed_rules(c: Client, rules_def: list, departments: list) -> list:
    existing = {r["name"]: r for r in c.fetch_all("/v1/rules")}
    result, skipped = [], 0
    for i, rule in enumerate(rules_def):
        existing_rule = existing.get(rule["name"])
        if existing_rule:
            skipped += 1
            result.append(existing_rule)
            continue
        dept_id = departments[i % len(departments)]["id"] if departments else None
        payload = {k: v for k, v in rule.items() if k != "tags"}
        if dept_id: payload["department_id"] = dept_id
        created = c.post("/v1/rules", payload)
        if not created.get("id"): continue
        rid = created["id"]
        c.put(f"/v1/rules/{rid}/approve")
        result.append(created)
    if skipped: print(f"  [skip] {skipped} rules already exist")
    print(f"  [+] created & approved {len(result)} rules")
    return result


def seed_dossiers(c: Client, dossiers_def: list, templates: list, departments: list) -> list:
    existing = {d["name"]: d for d in c.fetch_all("/v1/dossiers")}
    result, skipped = [], 0
    for i, dossier in enumerate(dossiers_def):
        existing_dossier = existing.get(dossier["name"])
        if existing_dossier:
            skipped += 1
            result.append(existing_dossier)
            continue
        dept_id  = departments[i % len(departments)]["id"] if departments else None
        tmpl_ids = [templates[i % len(templates)]["id"]] if templates else []
        payload  = {
            **dossier,
            "status":     "draft",
            "visibility": "private",
        }
        if dept_id:  payload["department_id"] = dept_id
        if tmpl_ids: payload["template_ids"]  = tmpl_ids
        created = c.post("/v1/dossiers", payload)
        if created.get("id"):
            result.append(created)
    if skipped: print(f"  [skip] {skipped} dossiers already exist")
    print(f"  [+] created {len(result)} dossiers")
    return result


# ── Main ───────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="DocFlow seed script")
    parser.add_argument("--base-url",      default=os.getenv("BASE_URL", DEFAULT_BASE_URL))
    parser.add_argument("--count",   "-n", type=int, default=100,
                        help="Target record count for users/dossiers (default: 100)")
    parser.add_argument("--dry-run",       action="store_true")
    args = parser.parse_args()

    n          = args.count
    n_tmpl     = max(10, n // 4)   # 25% of count
    n_rules    = max(5,  n // 5)   # 20% of count
    n_dossiers = n

    print(f"Base URL  : {args.base_url}")
    print(f"Count     : {n}  (templates={n_tmpl}, rules={n_rules}, dossiers={n_dossiers})")
    print(f"Dry run   : {args.dry_run}\n")

    lt_users   = gen_users(n)
    templates  = gen_templates(n_tmpl)
    rules      = gen_rules(n_rules)
    dossiers   = gen_dossiers(n_dossiers)

    # Update data/users.json — lt.* accounts first so __VU=1 hits a real test user
    static = [
        {"username": "admin",  "password": "admin123",  "role": "admin"},
        {"username": "user",   "password": "user123",   "role": "user"},
        {"username": "leader", "password": "leader123", "role": "user"},
    ]
    if not args.dry_run:
        USERS_FILE.write_text(json.dumps(lt_users + static, ensure_ascii=False, indent=2))
        print(f"[OK] data/users.json updated ({len(static + lt_users)} accounts)\n")

    c = Client(args.base_url, dry_run=args.dry_run)
    if not c.login(ADMIN_USER["username"], ADMIN_USER["password"]):
        sys.exit(1)

    print(f"\n[1/5] Departments ({len(DEPT_NAMES)})")
    dept_result = seed_departments(c)

    print(f"\n[2/5] Users ({n})")
    user_result = seed_users(c, lt_users, dept_result)

    print(f"\n[3/5] Department members")
    seed_members(c, user_result, dept_result)

    print(f"\n[4/5] Templates ({n_tmpl}) + Rules ({n_rules})")
    tmpl_result = seed_templates(c, templates, dept_result)
    rule_result = seed_rules(c, rules, dept_result)

    print(f"\n[5/5] Dossiers ({n_dossiers})")
    dossier_result = seed_dossiers(c, dossiers, tmpl_result, dept_result)

    # Save fixtures
    out = {
        "departments": [{"id": d.get("id"), "name": d.get("name")} for d in dept_result],
        "users":       [{"id": u.get("id"), "username": u.get("username")} for u in user_result],
        "templates":   [{"id": t.get("id"), "name": t.get("name")} for t in tmpl_result],
        "rules":       [{"id": r.get("id"), "name": r.get("name")} for r in rule_result],
        "dossiers":    [{"id": d.get("id"), "name": d.get("name")} for d in dossier_result],
    }
    OUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    OUT_FILE.write_text(json.dumps(out, ensure_ascii=False, indent=2))

    print(f"\n{'─'*50}")
    print(f"[done] {OUT_FILE}")
    print(f"  departments : {len(dept_result)}")
    print(f"  users       : {len(user_result)}")
    print(f"  templates   : {len(tmpl_result)}")
    print(f"  rules       : {len(rule_result)}")
    print(f"  dossiers    : {len(dossier_result)}")


if __name__ == "__main__":
    main()
