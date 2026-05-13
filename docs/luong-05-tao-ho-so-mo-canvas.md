# Luồng test chính số 5: Tạo hồ sơ và mở canvas

## Mục tiêu

Kiểm tra người dùng tạo hồ sơ và mở màn hình thiết kế hồ sơ.

## Preconditions

```text
User đã đăng nhập
User đã chọn phòng ban
User có quyền tạo hồ sơ
```

## Các bước test

```text
1. Mở màn hình Thiết kế hồ sơ
2. Nhấn Thiết kế nhanh
3. Hệ thống tạo hồ sơ mới
4. Hệ thống chuyển sang canvas
5. Đổi tên hồ sơ
6. Thêm tag cho hồ sơ
7. Lưu thiết kế
```

## Expected result

```text
Hồ sơ được tạo ở trạng thái Nháp
Canvas mở thành công
Tên và tag hồ sơ được lưu
```

## API/Action cần test bằng k6

```text
GET /profiles
POST /profiles
GET /profiles/{id}
PUT /profiles/{id}
GET /profiles/{id}/canvas
PUT /profiles/{id}/canvas
```
