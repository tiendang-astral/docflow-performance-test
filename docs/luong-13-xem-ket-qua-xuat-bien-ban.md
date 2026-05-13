# Luồng test chính số 13: Xem kết quả và xuất biên bản

## Mục tiêu

Kiểm tra người dùng xem kết quả thẩm định và xuất biên bản PDF.

## Preconditions

```text
Hồ sơ đã có ít nhất một phiên thẩm định
Kết quả thẩm định hợp lệ
```

## Các bước test

```text
1. Mở kết quả thẩm định
2. Xem tổng số quy tắc
3. Lọc theo Đạt / Không đạt / Lỗi
4. Chọn từng quy tắc để xem giải thích
5. Mở lịch sử thẩm định
6. Chọn một phiên thẩm định
7. Nhấn Xuất biên bản
8. Tải file PDF
```

## Expected result

```text
Kết quả hiển thị đúng
Bộ lọc hoạt động đúng
Lịch sử thẩm định hiển thị các phiên đã chạy
File PDF biên bản được tạo thành công
```

## API/Action cần test bằng k6

```text
GET /profiles/{id}/validation-results
GET /profiles/{id}/validation-history
POST /profiles/{id}/validation-results/{runId}/export
GET /profiles/{id}/reports/{reportId}
```
