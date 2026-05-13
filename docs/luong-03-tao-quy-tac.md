# Luồng test chính số 3: Tạo quy tắc

## Mục tiêu

Kiểm tra người dùng tạo quy tắc kiểm tra dữ liệu sau khi trích xuất.

## Preconditions

```text
User đã đăng nhập
User đã chọn phòng ban
User có quyền tạo quy tắc
```

## Các bước test

```text
1. Mở màn hình Quy tắc
2. Nhấn Tạo quy tắc
3. Nhập tên quy tắc
4. Nhập mô tả
5. Chọn loại quy tắc: prompt hoặc expression
6. Chọn mức độ: error, warning hoặc info
7. Nhập điều kiện kiểm tra
8. Nhấn Tạo rule
9. Kiểm tra quy tắc mới trong danh sách
```

## Expected result

```text
Quy tắc được tạo thành công
Quy tắc ở trạng thái Chờ duyệt
Quy tắc hiển thị trong danh sách Của tôi
```

## API/Action cần test bằng k6

```text
GET /rules
POST /rules
GET /rules/{id}
PUT /rules/{id}
DELETE /rules/{id}
```

## Biến thể cần test

```text
Tạo quy tắc prompt
Tạo quy tắc expression
Tạo quy tắc thiếu điều kiện
Tạo quy tắc mức error
Tạo quy tắc mức warning
Tìm kiếm quy tắc
Lọc quy tắc theo trạng thái
```
