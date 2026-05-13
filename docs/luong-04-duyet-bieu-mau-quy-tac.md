# Luồng test chính số 4: Duyệt biểu mẫu và quy tắc

## Mục tiêu

Kiểm tra trưởng phòng hoặc quản trị viên phê duyệt tài nguyên dùng chung.

## Preconditions

```text
Có biểu mẫu ở trạng thái Chờ duyệt
Có quy tắc ở trạng thái Chờ duyệt
User đăng nhập là Trưởng phòng hoặc Quản trị viên
Trưởng phòng đang chọn đúng phòng ban phụ trách
```

## Các bước test duyệt biểu mẫu

```text
1. Đăng nhập bằng manager hoặc admin
2. Chọn đúng phòng ban
3. Mở Quản trị
4. Mở Duyệt biểu mẫu
5. Chọn biểu mẫu chờ duyệt
6. Kiểm tra thông tin biểu mẫu
7. Nhấn Duyệt hoặc Từ chối
```

## Các bước test duyệt quy tắc

```text
1. Đăng nhập bằng manager hoặc admin
2. Chọn đúng phòng ban
3. Mở Quản trị
4. Mở Duyệt quy tắc
5. Chọn quy tắc chờ duyệt
6. Kiểm tra điều kiện quy tắc
7. Nhấn Duyệt hoặc Từ chối
```

## Expected result

```text
Biểu mẫu/quy tắc được chuyển sang Đã duyệt nếu duyệt
Biểu mẫu/quy tắc được chuyển sang Bị từ chối nếu từ chối
Người không đủ quyền không thể duyệt
```

## API/Action cần test bằng k6

```text
GET /admin/forms/pending
POST /admin/forms/{id}/approve
POST /admin/forms/{id}/reject
GET /admin/rules/pending
POST /admin/rules/{id}/approve
POST /admin/rules/{id}/reject
```
