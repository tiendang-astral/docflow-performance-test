# Luồng test chính số 9: Trích xuất dữ liệu

## Mục tiêu

Kiểm tra hệ thống trích xuất dữ liệu từ tài liệu theo biểu mẫu.

## Preconditions

```text
Canvas đã có biểu mẫu
Biểu mẫu đã được gán file
File đã sẵn sàng dùng
```

## Các bước test trích xuất một biểu mẫu

```text
1. Mở canvas hồ sơ
2. Chọn node biểu mẫu
3. Nhấn Trích xuất
4. Chờ hệ thống xử lý
5. Mở kết quả trích xuất
```

## Các bước test trích xuất tổng thể

```text
1. Kiểm tra các biểu mẫu đã nằm trên canvas
2. Kiểm tra file trong kho dữ liệu đã sẵn sàng
3. Nhấn Trích xuất tổng thể
4. Chờ hệ thống xử lý
5. Mở từng biểu mẫu để xem dữ liệu
```

## Expected result

```text
Hệ thống tạo kết quả trích xuất
Các trường có dữ liệu tương ứng
Trạng thái biểu mẫu chuyển sang Đã trích xuất
Có thông báo xử lý thành công hoặc thất bại rõ ràng
```

## API/Action cần test bằng k6

```text
POST /profiles/{id}/forms/{formNodeId}/extract
POST /profiles/{id}/extract-all
GET /profiles/{id}/extractions
GET /profiles/{id}/forms/{formNodeId}/extraction
```

## Biến thể cần test

```text
Trích xuất khi file rõ ràng
Trích xuất khi file scan mờ
Trích xuất khi thiếu file
Trích xuất khi biểu mẫu không có trường
Trích xuất tổng thể với nhiều biểu mẫu
Trích xuất tổng thể với nhiều file
Trích xuất có bật Agent
Trích xuất không bật Agent
```
