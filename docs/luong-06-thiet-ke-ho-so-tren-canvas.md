# Luồng test chính số 6: Thiết kế hồ sơ trên canvas

## Mục tiêu

Kiểm tra người dùng kéo biểu mẫu, kéo quy tắc và nối quan hệ trên canvas.

## Preconditions

```text
Đã có hồ sơ
Đã có biểu mẫu được duyệt hoặc biểu mẫu của user
Đã có quy tắc được duyệt hoặc quy tắc của user
```

## Các bước test

```text
1. Mở canvas hồ sơ
2. Mở thư viện biểu mẫu/quy tắc
3. Kéo biểu mẫu vào canvas
4. Kéo quy tắc vào canvas
5. Nối quy tắc với biểu mẫu
6. Kiểm tra bảng chi tiết bên phải
7. Lưu thiết kế
```

## Expected result

```text
Canvas lưu được danh sách node
Canvas lưu được vị trí node
Canvas lưu được edge giữa quy tắc và biểu mẫu
Mở lại hồ sơ vẫn thấy thiết kế đã lưu
```

## API/Action cần test bằng k6

```text
GET /profiles/{id}/canvas
PUT /profiles/{id}/canvas
GET /forms?status=approved
GET /rules?status=approved
```
