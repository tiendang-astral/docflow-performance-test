# Luồng sử dụng chính DocFlow để setup kịch bản test

## 1. Mục tiêu tài liệu

Tài liệu này dùng để thiết kế kịch bản test cho hệ thống DocFlow, đặc biệt phục vụ:

- Functional test
- E2E test
- Performance test bằng k6
- Test theo business flow thay vì chỉ test CRUD rời rạc

Luồng nghiệp vụ chính của DocFlow là:

```text
Đăng nhập
-> Chọn phòng ban
-> Chuẩn bị biểu mẫu
-> Chuẩn bị quy tắc
-> Tạo hồ sơ
-> Thiết kế hồ sơ trên canvas
-> Upload tài liệu
-> Gán file cho biểu mẫu
-> Trích xuất dữ liệu
-> Kiểm tra / xác minh dữ liệu
-> Thẩm định
-> Xem kết quả
-> Xuất biên bản
```

---

## 2. Các vai trò cần chuẩn bị để test

| Vai trò | Dùng để test |
|---|---|
| Người dùng nghiệp vụ | Tạo biểu mẫu, quy tắc, hồ sơ, upload file, trích xuất, xác minh, thẩm định |
| Trưởng phòng | Duyệt biểu mẫu, duyệt quy tắc trong phòng ban phụ trách |
| Quản trị viên | Quản lý user, phòng ban, monitor, phê duyệt toàn hệ thống |


---

## 3. Dữ liệu test cần chuẩn bị

### 3.1. Phòng ban

```text
Phòng Kế toán
Phòng Pháp chế
Phòng Nhân sự
```

### 3.2. Người dùng

Mỗi user nên có:

```text
username
email
password
role
department
status
```

### 3.3. Biểu mẫu

Ví dụ biểu mẫu cần có:

```text
Biểu mẫu Hợp đồng
Biểu mẫu Hóa đơn
Biểu mẫu Hồ sơ nhân sự
Biểu mẫu Phụ lục hợp đồng
```

Mỗi biểu mẫu nên có các trường:

```text
Tên trường
Kiểu dữ liệu
Mô tả trường
Bắt buộc / không bắt buộc
Gợi ý trích xuất
```

### 3.4. Quy tắc

Ví dụ quy tắc cần có:

```text
Ngày hết hạn hợp đồng phải lớn hơn ngày ký
Số tiền trên hóa đơn phải khớp với hợp đồng
Mã nhân viên không được để trống
Tên khách hàng trên hợp đồng và phụ lục phải giống nhau
```

Mỗi quy tắc nên có:

```text
Tên quy tắc
Mô tả
Loại quy tắc: prompt hoặc expression
Mức độ: error, warning, info
Điều kiện kiểm tra
```

### 3.5. Hồ sơ

Ví dụ hồ sơ:

```text
Hồ sơ thẩm định hợp đồng khách hàng A
Hồ sơ kiểm tra hóa đơn tháng 01
Hồ sơ nhân sự nhân viên mới
```

### 3.6. File tài liệu

Cần chuẩn bị nhiều loại file:

```text
File hợp đồng PDF
File hóa đơn PDF
File phụ lục hợp đồng PDF
File hồ sơ nhân sự PDF
File scan chất lượng thấp
File nhiều trang
File thiếu thông tin
File có dữ liệu sai lệch để test thẩm định fail
```

---

## 4. Luồng test chính số 1: Đăng nhập và chọn phòng ban

### Mục tiêu

Kiểm tra người dùng đăng nhập thành công và làm việc trong đúng phạm vi phòng ban.

### Preconditions

```text
User đã tồn tại
User có role hợp lệ
User thuộc ít nhất một phòng ban
```

### Các bước test

```text
1. Mở trang đăng nhập
2. Nhập username/password
3. Nhấn Đăng nhập
4. Kiểm tra dashboard hiển thị
5. Kiểm tra tên người dùng ở góc phải
6. Chọn phòng ban làm việc
7. Kiểm tra danh sách biểu mẫu/quy tắc/hồ sơ theo phòng ban
```

### Expected result

```text
Login thành công
Token/session hợp lệ
Menu hiển thị đúng theo role
Dữ liệu thay đổi theo phòng ban được chọn
```

### API/Action cần test bằng k6

```text
POST /login
GET /me
GET /departments
POST hoặc PUT /selected-department
GET /dashboard
```

---

## 5. Luồng test chính số 2: Tạo biểu mẫu

### Mục tiêu

Kiểm tra người dùng tạo biểu mẫu để định nghĩa dữ liệu cần trích xuất.

### Preconditions

```text
User đã đăng nhập
User đã chọn đúng phòng ban
User có quyền tạo biểu mẫu
```

### Các bước test

```text
1. Mở màn hình Biểu mẫu
2. Nhấn Tạo biểu mẫu
3. Nhập tên biểu mẫu
4. Nhập mô tả
5. Thêm tag
6. Thêm danh sách trường dữ liệu
7. Nhấn Tạo biểu mẫu
8. Kiểm tra biểu mẫu mới trong danh sách
```

### Expected result

```text
Biểu mẫu được tạo thành công
Biểu mẫu ở trạng thái Chờ duyệt
Biểu mẫu hiển thị trong danh sách Của tôi
```

### API/Action cần test bằng k6

```text
GET /forms
POST /forms
GET /forms/{id}
PUT /forms/{id}
DELETE /forms/{id}
```

### Biến thể cần test

```text
Tạo biểu mẫu hợp lệ
Tạo biểu mẫu thiếu tên
Tạo biểu mẫu không có trường
Tạo biểu mẫu có nhiều trường
Tìm kiếm biểu mẫu
Lọc biểu mẫu theo trạng thái
Lọc biểu mẫu theo nguồn: Công khai / Của tôi
```

---

## 6. Luồng test chính số 3: Tạo quy tắc

### Mục tiêu

Kiểm tra người dùng tạo quy tắc kiểm tra dữ liệu sau khi trích xuất.

### Preconditions

```text
User đã đăng nhập
User đã chọn phòng ban
User có quyền tạo quy tắc
```

### Các bước test

```text
1. Mở màn hình Quy tắc
2. Nhấn Tạo quy tắc
3. Nhập tên quy tắc
4. Nhập mô tả
5. Chọn loại quy tắc: prompt hoặc expression
6. Chọn mức độ: error, warning hoặc info
7. Nhập điều kiện kiểm tra
8. Nhấn Tạo rule
9. Kiểm tra quy tắc mới trong danh sách
```

### Expected result

```text
Quy tắc được tạo thành công
Quy tắc ở trạng thái Chờ duyệt
Quy tắc hiển thị trong danh sách Của tôi
```

### API/Action cần test bằng k6

```text
GET /rules
POST /rules
GET /rules/{id}
PUT /rules/{id}
DELETE /rules/{id}
```

### Biến thể cần test

```text
Tạo quy tắc prompt
Tạo quy tắc expression
Tạo quy tắc thiếu điều kiện
Tạo quy tắc mức error
Tạo quy tắc mức warning
Tìm kiếm quy tắc
Lọc quy tắc theo trạng thái
```

---

## 7. Luồng test chính số 4: Duyệt biểu mẫu và quy tắc

### Mục tiêu

Kiểm tra trưởng phòng hoặc quản trị viên phê duyệt tài nguyên dùng chung.

### Preconditions

```text
Có biểu mẫu ở trạng thái Chờ duyệt
Có quy tắc ở trạng thái Chờ duyệt
User đăng nhập là Trưởng phòng hoặc Quản trị viên
Trưởng phòng đang chọn đúng phòng ban phụ trách
```

### Các bước test duyệt biểu mẫu

```text
1. Đăng nhập bằng manager hoặc admin
2. Chọn đúng phòng ban
3. Mở Quản trị
4. Mở Duyệt biểu mẫu
5. Chọn biểu mẫu chờ duyệt
6. Kiểm tra thông tin biểu mẫu
7. Nhấn Duyệt hoặc Từ chối
```

### Các bước test duyệt quy tắc

```text
1. Đăng nhập bằng manager hoặc admin
2. Chọn đúng phòng ban
3. Mở Quản trị
4. Mở Duyệt quy tắc
5. Chọn quy tắc chờ duyệt
6. Kiểm tra điều kiện quy tắc
7. Nhấn Duyệt hoặc Từ chối
```

### Expected result

```text
Biểu mẫu/quy tắc được chuyển sang Đã duyệt nếu duyệt
Biểu mẫu/quy tắc được chuyển sang Bị từ chối nếu từ chối
Người không đủ quyền không thể duyệt
```

### API/Action cần test bằng k6

```text
GET /admin/forms/pending
POST /admin/forms/{id}/approve
POST /admin/forms/{id}/reject
GET /admin/rules/pending
POST /admin/rules/{id}/approve
POST /admin/rules/{id}/reject
```

---

## 8. Luồng test chính số 5: Tạo hồ sơ và mở canvas

### Mục tiêu

Kiểm tra người dùng tạo hồ sơ và mở màn hình thiết kế hồ sơ.

### Preconditions

```text
User đã đăng nhập
User đã chọn phòng ban
User có quyền tạo hồ sơ
```

### Các bước test

```text
1. Mở màn hình Thiết kế hồ sơ
2. Nhấn Thiết kế nhanh
3. Hệ thống tạo hồ sơ mới
4. Hệ thống chuyển sang canvas
5. Đổi tên hồ sơ
6. Thêm tag cho hồ sơ
7. Lưu thiết kế
```

### Expected result

```text
Hồ sơ được tạo ở trạng thái Nháp
Canvas mở thành công
Tên và tag hồ sơ được lưu
```

### API/Action cần test bằng k6

```text
GET /profiles
POST /profiles
GET /profiles/{id}
PUT /profiles/{id}
GET /profiles/{id}/canvas
PUT /profiles/{id}/canvas
```

---

## 9. Luồng test chính số 6: Thiết kế hồ sơ trên canvas

### Mục tiêu

Kiểm tra người dùng kéo biểu mẫu, kéo quy tắc và nối quan hệ trên canvas.

### Preconditions

```text
Đã có hồ sơ
Đã có biểu mẫu được duyệt hoặc biểu mẫu của user
Đã có quy tắc được duyệt hoặc quy tắc của user
```

### Các bước test

```text
1. Mở canvas hồ sơ
2. Mở thư viện biểu mẫu/quy tắc
3. Kéo biểu mẫu vào canvas
4. Kéo quy tắc vào canvas
5. Nối quy tắc với biểu mẫu
6. Kiểm tra bảng chi tiết bên phải
7. Lưu thiết kế
```

### Expected result

```text
Canvas lưu được danh sách node
Canvas lưu được vị trí node
Canvas lưu được edge giữa quy tắc và biểu mẫu
Mở lại hồ sơ vẫn thấy thiết kế đã lưu
```

### API/Action cần test bằng k6

```text
GET /profiles/{id}/canvas
PUT /profiles/{id}/canvas
GET /forms?status=approved
GET /rules?status=approved
```

---

## 10. Luồng test chính số 7: Upload tài liệu vào kho dữ liệu

### Mục tiêu

Kiểm tra người dùng tải tài liệu vào kho dữ liệu của hồ sơ.

### Preconditions

```text
Đã có hồ sơ
User có quyền chỉnh sửa hồ sơ
File test tồn tại trên máy
```

### Các bước test

```text
1. Mở canvas hồ sơ
2. Kéo file vào Kho dữ liệu
3. Chờ hệ thống upload
4. Chờ hệ thống xử lý/chuyển đổi file
5. Kiểm tra trạng thái file
6. Xem trước file
```

### Expected result

```text
File upload thành công
File hiển thị trong kho dữ liệu
File chuyển sang trạng thái Sẵn sàng dùng
Người dùng xem trước được file
```

### API/Action cần test bằng k6

```text
POST /profiles/{id}/files
GET /profiles/{id}/files
GET /profiles/{id}/files/{fileId}
DELETE /profiles/{id}/files/{fileId}
POST /profiles/{id}/files/{fileId}/convert
```

### Biến thể cần test

```text
Upload 1 file
Upload nhiều file
Upload file lớn
Upload file sai định dạng
Upload file scan chất lượng thấp
Xóa file
Chuyển đổi lại file
```

---

## 11. Luồng test chính số 8: Gán file cho biểu mẫu

### Mục tiêu

Kiểm tra người dùng gán file nguồn cho node biểu mẫu.

### Preconditions

```text
Canvas đã có biểu mẫu
Kho dữ liệu đã có file sẵn sàng
```

### Các bước test

```text
1. Mở canvas hồ sơ
2. Chọn file trong kho dữ liệu
3. Kéo file thả vào node biểu mẫu
4. Hoặc mở chi tiết biểu mẫu và chọn file
5. Lưu gán file
6. Kiểm tra số file đã gán trên node
```

### Expected result

```text
File được gán thành công cho biểu mẫu
Node biểu mẫu hiển thị số file đã gán
Mở lại canvas vẫn giữ thông tin gán file
```

### API/Action cần test bằng k6

```text
POST /profiles/{id}/forms/{formNodeId}/files
GET /profiles/{id}/forms/{formNodeId}/files
DELETE /profiles/{id}/forms/{formNodeId}/files/{fileId}
```

---

## 12. Luồng test chính số 9: Trích xuất dữ liệu

### Mục tiêu

Kiểm tra hệ thống trích xuất dữ liệu từ tài liệu theo biểu mẫu.

### Preconditions

```text
Canvas đã có biểu mẫu
Biểu mẫu đã được gán file
File đã sẵn sàng dùng
```

### Các bước test trích xuất một biểu mẫu

```text
1. Mở canvas hồ sơ
2. Chọn node biểu mẫu
3. Nhấn Trích xuất
4. Chờ hệ thống xử lý
5. Mở kết quả trích xuất
```

### Các bước test trích xuất tổng thể

```text
1. Kiểm tra các biểu mẫu đã nằm trên canvas
2. Kiểm tra file trong kho dữ liệu đã sẵn sàng
3. Nhấn Trích xuất tổng thể
4. Chờ hệ thống xử lý
5. Mở từng biểu mẫu để xem dữ liệu
```

### Expected result

```text
Hệ thống tạo kết quả trích xuất
Các trường có dữ liệu tương ứng
Trạng thái biểu mẫu chuyển sang Đã trích xuất
Có thông báo xử lý thành công hoặc thất bại rõ ràng
```

### API/Action cần test bằng k6

```text
POST /profiles/{id}/forms/{formNodeId}/extract
POST /profiles/{id}/extract-all
GET /profiles/{id}/extractions
GET /profiles/{id}/forms/{formNodeId}/extraction
```

### Biến thể cần test

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

---

## 13. Luồng test chính số 10: Kiểm tra và xác minh dữ liệu

### Mục tiêu

Kiểm tra người dùng xem lại, sửa và lưu dữ liệu đã trích xuất.

### Preconditions

```text
Đã có dữ liệu trích xuất
User có quyền chỉnh sửa hồ sơ
```

### Các bước test

```text
1. Mở node biểu mẫu
2. Xem dữ liệu đã trích xuất
3. Mở file nguồn để đối chiếu
4. Sửa trường dữ liệu bị sai
5. Nhấn Lưu thay đổi
6. Mở lại biểu mẫu để kiểm tra dữ liệu đã lưu
```

### Expected result

```text
Dữ liệu sửa được lưu thành công
Dữ liệu sau khi sửa không bị mất khi reload
Hồ sơ có thể chuyển sang trạng thái Đã xác minh hoặc Sẵn sàng
```

### API/Action cần test bằng k6

```text
GET /profiles/{id}/forms/{formNodeId}/extraction
PUT /profiles/{id}/forms/{formNodeId}/extraction
POST /profiles/{id}/forms/{formNodeId}/verify
```

---

## 14. Luồng test chính số 11: Thẩm định hồ sơ

### Mục tiêu

Kiểm tra hệ thống dùng quy tắc để kiểm tra dữ liệu đã trích xuất.

### Preconditions

```text
Canvas đã có quy tắc
Quy tắc đã nối đúng với biểu mẫu nếu cần
Biểu mẫu đã có dữ liệu trích xuất
Dữ liệu đã được người dùng kiểm tra
```

### Các bước test

```text
1. Mở canvas hồ sơ
2. Kiểm tra biểu mẫu đã có dữ liệu
3. Kiểm tra quy tắc đã được đặt trên canvas
4. Nhấn Thẩm định
5. Chờ hệ thống xử lý
6. Mở màn hình kết quả
```

### Expected result

```text
Hệ thống tạo phiên thẩm định mới
Kết quả từng quy tắc hiển thị rõ ràng
Mỗi quy tắc có trạng thái Đạt, Không đạt hoặc Lỗi
Có giải thích chi tiết cho từng kết quả
```

### API/Action cần test bằng k6

```text
POST /profiles/{id}/validate
GET /profiles/{id}/validation-results
GET /profiles/{id}/validation-results/{runId}
```

### Biến thể cần test

```text
Tất cả quy tắc đạt
Một số quy tắc không đạt
Quy tắc bị lỗi
Không có dữ liệu trích xuất
Quy tắc chưa nối biểu mẫu
Nhiều quy tắc kiểm tra cùng một biểu mẫu
Một quy tắc kiểm tra nhiều biểu mẫu
```

---

## 15. Luồng test chính số 12: Chạy toàn luồng

### Mục tiêu

Kiểm tra chức năng xử lý hồ sơ từ đầu đến cuối bằng một thao tác.

### Preconditions

```text
Canvas đã có biểu mẫu và quy tắc
Kho dữ liệu đã có đủ file
File đã sẵn sàng
Nếu hồ sơ nhiều file, đã cấu hình Hồ Sơ Nền / Hướng dẫn phân loại / Agent nếu cần
```

### Các bước test

```text
1. Mở canvas hồ sơ
2. Kiểm tra canvas đã đủ biểu mẫu và quy tắc
3. Kiểm tra kho dữ liệu đã đủ file
4. Bật Agent nếu cần
5. Nhấn Chạy toàn luồng
6. Chờ hệ thống hoàn tất
7. Xem kết quả sau khi chạy xong
```

### Expected result

```text
Hệ thống tự chờ file sẵn sàng
Hệ thống tự trích xuất dữ liệu
Hệ thống tự thẩm định theo quy tắc
Kết quả được hiển thị sau khi hoàn tất
Hồ sơ có trạng thái xử lý phù hợp
```

### API/Action cần test bằng k6

```text
POST /profiles/{id}/run
GET /profiles/{id}/run-status
GET /profiles/{id}/validation-results/latest
```

### Đây là luồng quan trọng nhất cho E2E/performance test

Luồng này phản ánh đúng giá trị chính của hệ thống, nên được ưu tiên hơn các CRUD rời rạc.

---

## 16. Luồng test chính số 13: Xem kết quả và xuất biên bản

### Mục tiêu

Kiểm tra người dùng xem kết quả thẩm định và xuất biên bản PDF.

### Preconditions

```text
Hồ sơ đã có ít nhất một phiên thẩm định
Kết quả thẩm định hợp lệ
```

### Các bước test

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

### Expected result

```text
Kết quả hiển thị đúng
Bộ lọc hoạt động đúng
Lịch sử thẩm định hiển thị các phiên đã chạy
File PDF biên bản được tạo thành công
```

### API/Action cần test bằng k6

```text
GET /profiles/{id}/validation-results
GET /profiles/{id}/validation-history
POST /profiles/{id}/validation-results/{runId}/export
GET /profiles/{id}/reports/{reportId}
```

---

## 17. Kịch bản k6 đề xuất

## 17.1. Smoke test

### Mục tiêu

Kiểm tra script và môi trường hoạt động đúng.

```text
1-2 virtual users
1-2 phút
```

### Flow nên chạy

```text
Login
-> GET /me
-> GET danh sách hồ sơ
-> GET chi tiết một hồ sơ
```

---

## 17.2. Load test

### Mục tiêu

Kiểm tra hệ thống ở tải bình thường.

```text
20-50 virtual users
15-30 phút
```

### Flow nên chạy

```text
Login
-> Chọn phòng ban
-> Xem danh sách hồ sơ
-> Mở canvas hồ sơ
-> Xem danh sách file
-> Xem kết quả thẩm định
```

Đây là luồng đọc nhiều, phù hợp với tải thực tế.

---

## 17.3. Workflow test: xử lý hồ sơ đầy đủ

### Mục tiêu

Kiểm tra luồng nghiệp vụ chính end-to-end.

```text
Login
-> Chọn phòng ban
-> Tạo hồ sơ
-> Thêm biểu mẫu vào canvas
-> Thêm quy tắc vào canvas
-> Upload file
-> Gán file cho biểu mẫu
-> Chạy trích xuất
-> Sửa dữ liệu nếu cần
-> Chạy thẩm định
-> Xem kết quả
```

Nên chạy với tải thấp đến vừa vì đây là luồng ghi dữ liệu và xử lý nặng.

```text
5-20 virtual users
10-30 phút
```

---

## 17.4. Stress test

### Mục tiêu

Tìm ngưỡng hệ thống bắt đầu chậm hoặc lỗi.

```text
10 VUs -> 50 VUs -> 100 VUs -> 200 VUs
```

### Flow nên chạy

```text
Login
-> Xem danh sách hồ sơ
-> Mở chi tiết hồ sơ
-> Xem canvas
-> Xem kết quả thẩm định
```

Không nên bắt đầu stress test bằng upload/extract vì có thể làm nhiễu kết quả do tác vụ AI/file processing quá nặng.

---

## 17.5. Spike test

### Mục tiêu

Kiểm tra hệ thống khi traffic tăng đột ngột.

```text
5 VUs -> 100 VUs trong 30 giây -> về 5 VUs
```

### Flow nên chạy

```text
Login
-> Search hồ sơ
-> Mở chi tiết hồ sơ
-> Xem kết quả
```

---

## 17.6. Soak test

### Mục tiêu

Kiểm tra hệ thống chạy lâu có memory leak, connection leak hoặc queue backlog không.

```text
20-50 VUs
2-4 giờ
```

### Flow nên chạy

```text
Login
-> Browse hồ sơ
-> Mở canvas
-> Xem file
-> Xem lịch sử thẩm định
-> Xem kết quả
```

---

## 18. Tỷ lệ traffic gợi ý

Không nên chia đều cho tất cả API. Nên mô phỏng gần với hành vi thật.

```text
Auth / session: 10%
Xem danh sách và chi tiết hồ sơ: 30%
Xem canvas / tài nguyên hồ sơ: 20%
Xem biểu mẫu và quy tắc: 15%
Upload / extract / validate: 15%
Quản trị / phê duyệt: 5%
Lỗi quyền / negative case: 5%
```

Nếu chỉ test luồng xử lý hồ sơ:

```text
Login: 5%
Tạo hồ sơ / thiết kế canvas: 15%
Upload file: 20%
Trích xuất: 25%
Xác minh dữ liệu: 10%
Thẩm định: 20%
Xuất biên bản: 5%
```

---

## 19. Metrics cần theo dõi trong k6

### Metrics mặc định

```text
http_req_duration
http_req_failed
http_reqs
vus
iterations
data_received
data_sent
```

### Threshold gợi ý

```javascript
thresholds: {
  http_req_failed: ['rate<0.01'],
  http_req_duration: ['p(95)<1000'],
}
```

### Threshold nên tách riêng theo nhóm API

```text
Login p95 < 800ms
GET list hồ sơ p95 < 1000ms
GET canvas p95 < 1200ms
Upload file p95 < 3000ms
Extract p95 < 10000ms hoặc đo async job duration riêng
Validate p95 < 10000ms hoặc đo async job duration riêng
Export PDF p95 < 5000ms
```

Lưu ý: Với các tác vụ extract, validate, export PDF, nếu backend xử lý async thì không nên chỉ đo response của API trigger. Cần đo thêm thời gian từ lúc bắt đầu job đến khi job hoàn tất.

---

## 20. Các nhóm test case nên ưu tiên

## Ưu tiên cao

```text
Login
Chọn phòng ban
Tạo hồ sơ
Mở canvas
Upload file
Gán file cho biểu mẫu
Trích xuất tổng thể
Kiểm tra/sửa dữ liệu trích xuất
Thẩm định
Xem kết quả
Chạy toàn luồng
```

## Ưu tiên trung bình

```text
Tạo biểu mẫu
Tạo quy tắc
Duyệt biểu mẫu
Duyệt quy tắc
Export biên bản
Import/export hồ sơ JSON
```

## Ưu tiên thấp hơn cho performance

```text
CRUD user
CRUD phòng ban
Import user CSV
Import thành viên CSV
Monitor
API Keys
Chat AI
```

Các chức năng này vẫn cần functional test, nhưng không nên là trọng tâm đầu tiên của k6 performance test.

---

## 21. Checklist trước khi chạy k6

```text
[ ] Có URL môi trường test
[ ] Có danh sách test account
[ ] Có dữ liệu phòng ban
[ ] Có biểu mẫu mẫu
[ ] Có quy tắc mẫu
[ ] Có hồ sơ mẫu
[ ] Có file PDF test
[ ] Có API document hoặc HAR file từ browser
[ ] Có cơ chế lấy token sau login
[ ] Có script setup data hoặc data seed
[ ] Có rule dọn dữ liệu sau test
[ ] Có Prometheus/Grafana hoặc log để đối chiếu
[ ] Có threshold rõ ràng
[ ] Có báo cáo kết quả sau test
```

---

## 22. Kết luận

Luồng cần ưu tiên để setup kịch bản test là:

```text
Login
-> Department context
-> Profile
-> Canvas
-> File upload
-> File assignment
-> Extraction
-> Verification
-> Validation
-> Result
```

Đây là luồng phản ánh đúng giá trị chính của DocFlow.

Các CRUD như user, phòng ban, biểu mẫu, quy tắc vẫn cần test, nhưng không nên là trọng tâm đầu tiên khi thiết kế kịch bản k6. Với performance test, nên tập trung vào các luồng đọc hồ sơ, mở canvas, upload file, trích xuất, thẩm định và xem kết quả.
