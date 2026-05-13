# Luồng test chính số 1: Đăng nhập và chọn phòng ban

## Mục tiêu

Kiểm tra người dùng đăng nhập thành công và làm việc trong đúng phạm vi phòng ban.

## Preconditions

```text
User đã tồn tại
User có role hợp lệ
User thuộc ít nhất một phòng ban
```

## Các bước test

```text
1. Mở trang đăng nhập
2. Nhập username/password
3. Nhấn Đăng nhập
4. Kiểm tra dashboard hiển thị
5. Kiểm tra tên người dùng ở góc phải
6. Chọn phòng ban làm việc
7. Kiểm tra danh sách biểu mẫu/quy tắc/hồ sơ theo phòng ban
```

## Expected result

```text
Login thành công
Token/session hợp lệ
Menu hiển thị đúng theo role
Dữ liệu thay đổi theo phòng ban được chọn
```

## API/Action cần test bằng k6

```text
POST /login
GET /me
GET /departments
POST hoặc PUT /selected-department
GET /dashboard
```
