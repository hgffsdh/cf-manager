# MỘC CAFÉ OS — BẢN VẬN HÀNH THỰC (REAL-ONLY PATCH)

**Phạm vi:** cập nhật đồng bộ React + ASP.NET Core cho phiên mới, đơn hàng, thu tiền mặt, hướng dẫn VietQR thật có cấu hình, đối soát thủ công, Dashboard, pha chế/đơn đang xử lý và lịch sử/báo cáo. **Dữ liệu demo cũ không bị biến thành tiền thật.** Dự án chưa phải hệ thống tài chính đã kiểm toán hoặc cổng thanh toán ngân hàng tự động.

## I. Sao lưu trước khi cài

1. Dừng backend bằng `Ctrl+C` trong cửa sổ CMD đang chạy port 5088.
2. Giữ bản sao source `A:\MocCafeOS - Copy` hoặc sao chép lại source hiện tại (đặc biệt các file từng sửa trong các bản cập nhật trước).
3. Sao lưu database `MocCafeDB` **riêng** bằng SSMS: nhấp database > **Tasks > Back Up...**. Sao lưu source KHÔNG sao lưu SQL Server.
4. Giải nén PATCH này và sao chép **nội dung** các thư mục `backend`, `frontend`, `scripts` vào `A:\MocCafeOS`, chỉ ghi đè **các file nằm trong PATCH**. Không ghi đè `appsettings.Development.json`, migrations trên máy hoặc `.local`.

## II. Build & chạy trên Windows

Trong CMD tại thư mục project:

```cmd
cd /d A:\MocCafeOS
powershell -ExecutionPolicy Bypass -File ".\scripts\enable-history-api.ps1"
dotnet build ".\backend\MocCafe.Api\MocCafe.Api.csproj"
```

**Không chạy** `setup-windows-fixed-v4.ps1`, `dotnet ef migrations add`, `dotnet ef database update` hay script xóa database chỉ để cập nhật REAL-only: patch này không thêm cột hay bảng mới.

Khởi chạy backend, trong CMD thứ nhất:

```cmd
cd /d A:\MocCafeOS
powershell -ExecutionPolicy Bypass -File ".\scripts\run-real-backend.ps1"
```

- Câu hỏi **Mã ngân hàng/BIN VietQR**: để trống = **chỉ tiền mặt THẬT**. Đây là cách chạy an toàn ngay cả khi chưa có tài khoản nhận tiền được cấu hình.
- Muốn cho khách chuyển khoản THẬT: nhập **mã BIN/ngân hàng**, **số tài khoản THẬT nhận tiền**, **tên chủ tài khoản viết không dấu**. KHÔNG nhập thông tin giả.
- Sau đó script cũ hỏi `SQL Server INSTANCE` (Enter = `localhost\SQLEXPRESS`) và mật khẩu `sa`. Giữ backend chạy.
- Script chỉ đưa thông tin tài khoản ngân hàng vào biến môi trường phiên chạy, **không lưu mật khẩu SQL hoặc số tài khoản vào ZIP**. Nhập lại thông tin ngân hàng ở lần khởi động sau. Không cần thay JWT key hoặc Owner password.

Trong CMD thứ hai:

```cmd
cd /d A:\MocCafeOS
powershell -ExecutionPolicy Bypass -File ".\scripts\run-frontend.ps1"
```

Vào **http://localhost:5173/login** rồi đăng nhập Owner hiện tại. Ở máy khác/điện thoại cần cấu hình `PublicFrontendUrl` theo địa chỉ IP LAN và firewall, không được dùng `localhost` trong QR dùng trên điện thoại.

## III. Luồng thực tế mới

1. `Sơ đồ chòi` → nếu bàn đang có phiên demo cũ, Owner/Manager chọn **Lưu trữ phiên cũ**. Tính năng này **giữ nguyên lịch sử thử nghiệm**, không nhận tiền và không làm giả báo cáo.
2. Chọn **Mở phiên** → backend bắt buộc `IsDemo = false` (kể cả client gửi `true` sẽ từ chối).
3. Tạo QR của bàn → khách quét, đặt món → đơn mới lưu SQL Server với `IsDemo = false` và giá server tính lại.
4. **Tiền mặt:** khách chọn tiền mặt; thu ngân nhận đủ tiền tại quầy, nhấn **Xác nhận thu** → `Payments`, `PaymentAllocations` và `PaymentStatus` được ghi thật.
5. **Chuyển khoản:** chỉ xuất hiện nếu đã cấu hình tài khoản thật. Backend tạo `PaymentAttempt(IsDemo=false, Status=Created)` và mã tham chiếu riêng. Trang khách hiển thị VietQR thực theo tài khoản đã nhập, số tiền server, mã tham chiếu. Nhấn **Tôi đã chuyển** chỉ báo nhân viên kiểm tra — **không** tự chuyển trạng thái sang `Paid`.
6. Thu ngân/Owner/Manager **tự mở ứng dụng ngân hàng hoặc sao kê** kiểm tra **đúng tài khoản, đủ tiền và đúng mã nội dung**. Sau đó nhập mã giao dịch **THỰC** và xác nhận tại trang **Đơn hàng**. Server chống dùng lại mã giao dịch và ghi AuditLog trước khi chuyển sang `Paid`.
7. Pha chế, phục vụ, đơn hàng hiện tại và lịch sử/báo cáo đều lấy dữ liệu **THỰC** từ database. Kho/nguyên liệu nếu trước đây seed dữ liệu mẫu vẫn cần kiểm kê để số tồn là thật.

## IV. Endpoint đã điều chỉnh/thêm

| API | Mục đích |
|---|---|
| `POST /api/v1/staff/tables/{id}/open` | Chỉ mở phiên thật, chặn `isDemo=true` |
| `POST /api/v1/staff/visits/{id}/archive-demo` | Owner/Manager lưu trữ phiên demo cũ có lý do, giữ lịch sử |
| `GET /api/v1/guest/payment-options` | Trả phương thức ngân hàng chỉ khi cấu hình hợp lệ |
| `POST /api/v1/guest/orders` | `Cash` hoặc `BankTransfer`, tạo đơn thật |
| `GET /api/v1/guest/orders/{id}/bank-details` | Chỉ khách có guest token của đơn xem thông tin chuyển khoản |
| `POST /api/v1/guest/orders/{id}/notify-transfer` | Báo quán đối soát, **không** đánh dấu Paid |
| `POST /api/v1/staff/payments/{id}/bank-confirm` | Chỉ Owner/Manager/Cashier, ghi nhận sau khi tự xác minh giao dịch ngân hàng |
| `GET /api/v1/staff/dashboard?demo=false` | Dashboard số thật |
| `GET /api/v1/staff/reports/actual?days=7` | Báo cáo từ PaymentAllocations thật |
| `GET /api/v1/staff/order-history?source=real` | Lịch sử đơn thật |

API mô phỏng `/api/v1/demo-pay` bị tắt theo mặc định bởi `CafeMode:AllowDemoPayments=false` (khi không thiết lập cũng mặc định false).

## V. Kiểm tra sau khi cài

```cmd
curl.exe -i http://localhost:5088/health
curl.exe -i http://localhost:5088/api/v1/guest/payment-options
```

`/health` cần HTTP 200. `payment-options` không kèm guest token dự kiến sẽ trả 401; đó là đúng vì khách phải ở trong phiên QR.

Dùng SSMS kiểm tra chỉ những đơn THẬT (không UPDATE dữ liệu cũ):

```sql
USE MocCafeDB;
SELECT TOP (20) OrderNumber, IsDemo, PaymentMethod, PaymentStatus, TotalAmount, CreatedAt
FROM dbo.Orders ORDER BY CreatedAt DESC;
SELECT TOP (20) Method, Amount, IsDemo, CollectedAt FROM dbo.Payments ORDER BY CollectedAt DESC;
```

Nếu các bảng trên có tên khác theo migration tùy chỉnh của bạn, đối chiếu với SSMS trước khi chạy. Không chạy `UPDATE IsDemo = 0` cho dữ liệu cũ.

**Các test thực tế tối thiểu trước vận hành:** mở bàn mới, đặt đơn tiền mặt, thu tiền, nhận đơn, đánh dấu món xong, phục vụ, đóng phiên, mở lịch sử và báo cáo; sau đó kiểm tra chuyển khoản có QR đúng tài khoản, báo đã chuyển vẫn Pending, xác nhận ngân hàng lần đầu Paid, thử lại cùng mã giao dịch không tăng doanh thu.

## VI. Giới hạn chưa thể gọi là sản phẩm production hoàn thiện

- **KHÔNG** tích hợp webhook ngân hàng/PSP. Xác nhận chuyển khoản hiện là **đối soát thủ công có quyền Cashier**. Nhân viên phải thực sự nhìn thấy tiền; ứng dụng không thể tự kiểm tra số dư tài khoản ngân hàng.
- Chưa thực hiện đầy đủ refund/đổi trả/phí/thuế/in hóa đơn thuế; bảng báo cáo tiền đã thu **không phải lợi nhuận thuần**.
- Tồn kho có dữ liệu seed ban đầu, cần kiểm kê và nhập tồn thực tế; chưa bảo đảm tự trừ theo công thức cho mọi món.
- Chưa thực hiện integration test với SQL Server Windows thực tế trong môi trường này, nên không coi các luồng là đã chứng minh đủ điều kiện sử dụng thương mại. Trước khi vận hành thật, cần build, test, backup, HTTPS, giới hạn quyền và xác nhận số tài khoản.
- Mã QR VietQR dùng liên kết tải ảnh từ VietQR bên ngoài; không phải xác nhận thanh toán. Nội dung chuyển khoản được gửi qua URL dịch vụ cung cấp ảnh QR.
- Thông tin chủ tài khoản/QR lấy từ cấu hình lúc hiển thị; không đổi tài khoản nhận tiền trong khi còn các giao dịch đang chờ. Một hệ thống production nên lưu snapshot tài khoản trên mỗi PaymentAttempt qua migration bổ sung.

Tham khảo cú pháp VietQR Quick Link: https://www.vietqr.io/qr-dong
