# Luồng test chính số 12: Chạy toàn luồng

## Mục tiêu

Kiểm tra chức năng xử lý hồ sơ từ đầu đến cuối bằng một thao tác.

## Preconditions

```text
Canvas đã có biểu mẫu và quy tắc
Kho dữ liệu đã có đủ file
File đã sẵn sàng
Nếu hồ sơ nhiều file, đã cấu hình Hồ Sơ Nền / Hướng dẫn phân loại / Agent nếu cần
```

## Các bước test

```text
1. Mở canvas hồ sơ
2. Kiểm tra canvas đã đủ biểu mẫu và quy tắc
3. Kiểm tra kho dữ liệu đã đủ file
4. Bật Agent nếu cần
5. Nhấn Chạy toàn luồng
6. Chờ hệ thống hoàn tất
7. Xem kết quả sau khi chạy xong
```

## Expected result

```text
Hệ thống tự chờ file sẵn sàng
Hệ thống tự trích xuất dữ liệu
Hệ thống tự thẩm định theo quy tắc
Kết quả được hiển thị sau khi hoàn tất
Hồ sơ có trạng thái xử lý phù hợp
```

## API/Action cần test bằng k6

```text
POST /profiles/{id}/run
GET /profiles/{id}/run-status
GET /profiles/{id}/validation-results/latest
```

> Đây là luồng quan trọng nhất cho E2E/performance test. Luồng này phản ánh đúng giá trị chính của hệ thống, nên được ưu tiên hơn các CRUD rời rạc.
