# Luồng test chính số 10: Kiểm tra và xác minh dữ liệu

## Mục tiêu

Kiểm tra người dùng xem lại, sửa và lưu dữ liệu đã trích xuất.

## Preconditions

```text
Đã có dữ liệu trích xuất
User có quyền chỉnh sửa hồ sơ
```

## Các bước test

```text
1. Mở node biểu mẫu
2. Xem dữ liệu đã trích xuất
3. Mở file nguồn để đối chiếu
4. Sửa trường dữ liệu bị sai
5. Nhấn Lưu thay đổi
6. Mở lại biểu mẫu để kiểm tra dữ liệu đã lưu
```

## Expected result

```text
Dữ liệu sửa được lưu thành công
Dữ liệu sau khi sửa không bị mất khi reload
Hồ sơ có thể chuyển sang trạng thái Đã xác minh hoặc Sẵn sàng
```

## API/Action cần test bằng k6

```text
GET /profiles/{id}/forms/{formNodeId}/extraction
PUT /profiles/{id}/forms/{formNodeId}/extraction
POST /profiles/{id}/forms/{formNodeId}/verify
```
