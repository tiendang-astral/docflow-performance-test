# Luồng test chính số 7: Upload tài liệu vào kho dữ liệu

## Mục tiêu

Kiểm tra người dùng tải tài liệu vào kho dữ liệu của hồ sơ.

## Preconditions

```text
Đã có hồ sơ
User có quyền chỉnh sửa hồ sơ
File test tồn tại trên máy
```

## Các bước test

```text
1. Mở canvas hồ sơ
2. Kéo file vào Kho dữ liệu
3. Chờ hệ thống upload
4. Chờ hệ thống xử lý/chuyển đổi file
5. Kiểm tra trạng thái file
6. Xem trước file
```

## Expected result

```text
File upload thành công
File hiển thị trong kho dữ liệu
File chuyển sang trạng thái Sẵn sàng dùng
Người dùng xem trước được file
```

## API/Action cần test bằng k6

```text
POST /profiles/{id}/files
GET /profiles/{id}/files
GET /profiles/{id}/files/{fileId}
DELETE /profiles/{id}/files/{fileId}
POST /profiles/{id}/files/{fileId}/convert
```

## Biến thể cần test

```text
Upload 1 file
Upload nhiều file
Upload file lớn
Upload file sai định dạng
Upload file scan chất lượng thấp
Xóa file
Chuyển đổi lại file
```
