# Luồng test chính số 2: Tạo biểu mẫu

## Mục tiêu

Kiểm tra người dùng tạo biểu mẫu để định nghĩa dữ liệu cần trích xuất.

## Preconditions

```text
User đã đăng nhập
User đã chọn đúng phòng ban
User có quyền tạo biểu mẫu
```

## Các bước test

```text
1. Mở màn hình Biểu mẫu
2. Nhấn Tạo biểu mẫu
3. Nhập tên biểu mẫu
4. Nhập mô tả
5. Thêm tag
6. Thêm danh sách trường dữ liệu
7. Nhấn Tạo biểu mẫu
8. Kiểm tra biểu mẫu mới trong danh sách
```

## Expected result

```text
Biểu mẫu được tạo thành công
Biểu mẫu ở trạng thái Chờ duyệt
Biểu mẫu hiển thị trong danh sách Của tôi
```

## API/Action cần test bằng k6

```text
GET /forms
POST /forms
GET /forms/{id}
PUT /forms/{id}
DELETE /forms/{id}
```

## Biến thể cần test

```text
Tạo biểu mẫu hợp lệ
Tạo biểu mẫu thiếu tên
Tạo biểu mẫu không có trường
Tạo biểu mẫu có nhiều trường
Tìm kiếm biểu mẫu
Lọc biểu mẫu theo trạng thái
Lọc biểu mẫu theo nguồn: Công khai / Của tôi
```
