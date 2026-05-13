# Luồng test chính số 8: Gán file cho biểu mẫu

## Mục tiêu

Kiểm tra người dùng gán file nguồn cho node biểu mẫu.

## Preconditions

```text
Canvas đã có biểu mẫu
Kho dữ liệu đã có file sẵn sàng
```

## Các bước test

```text
1. Mở canvas hồ sơ
2. Chọn file trong kho dữ liệu
3. Kéo file thả vào node biểu mẫu
4. Hoặc mở chi tiết biểu mẫu và chọn file
5. Lưu gán file
6. Kiểm tra số file đã gán trên node
```

## Expected result

```text
File được gán thành công cho biểu mẫu
Node biểu mẫu hiển thị số file đã gán
Mở lại canvas vẫn giữ thông tin gán file
```

## API/Action cần test bằng k6

```text
POST /profiles/{id}/forms/{formNodeId}/files
GET /profiles/{id}/forms/{formNodeId}/files
DELETE /profiles/{id}/forms/{formNodeId}/files/{fileId}
```
