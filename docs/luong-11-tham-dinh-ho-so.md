# Luồng test chính số 11: Thẩm định hồ sơ

## Mục tiêu

Kiểm tra hệ thống dùng quy tắc để kiểm tra dữ liệu đã trích xuất.

## Preconditions

```text
Canvas đã có quy tắc
Quy tắc đã nối đúng với biểu mẫu nếu cần
Biểu mẫu đã có dữ liệu trích xuất
Dữ liệu đã được người dùng kiểm tra
```

## Các bước test

```text
1. Mở canvas hồ sơ
2. Kiểm tra biểu mẫu đã có dữ liệu
3. Kiểm tra quy tắc đã được đặt trên canvas
4. Nhấn Thẩm định
5. Chờ hệ thống xử lý
6. Mở màn hình kết quả
```

## Expected result

```text
Hệ thống tạo phiên thẩm định mới
Kết quả từng quy tắc hiển thị rõ ràng
Mỗi quy tắc có trạng thái Đạt, Không đạt hoặc Lỗi
Có giải thích chi tiết cho từng kết quả
```

## API/Action cần test bằng k6

```text
POST /profiles/{id}/validate
GET /profiles/{id}/validation-results
GET /profiles/{id}/validation-results/{runId}
```

## Biến thể cần test

```text
Tất cả quy tắc đạt
Một số quy tắc không đạt
Quy tắc bị lỗi
Không có dữ liệu trích xuất
Quy tắc chưa nối biểu mẫu
Nhiều quy tắc kiểm tra cùng một biểu mẫu
Một quy tắc kiểm tra nhiều biểu mẫu
```
