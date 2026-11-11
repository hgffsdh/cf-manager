# Mộc Café OS — React + ASP.NET Core 8 + SQL Server

**Trạng thái: bản MVP có mã nguồn thực tế, chưa được build/kiểm thử runtime trong môi trường tạo file.** Đây không phải sản phẩm production-ready hay bản hoàn thiện toàn bộ 30 chương của đề bài. Backend dùng SQL Server và Entity Framework Core thực, không thay bằng mảng JSON giả.

## 1. Đã có trong source

- Nhân viên đăng nhập JWT (ASP.NET Core Identity, 6 vai trò mẫu; chỉ Owner được seed nếu cung cấp mật khẩu).
- 3 khu vực, 12 bàn/chòi, 20 món, size M/L, topping; seed idempotent với dữ liệu demo thật trong DB.
- Mở/đóng phiên khách, cấp lại QR có token ngẫu nhiên hash bằng SHA-256; khách quét QR tạo GuestSession có giới hạn.
- Thực đơn từ SQL, giỏ hàng lưu trình duyệt, báo giá server-side, tạo order với idempotency key, snapshot giá/tên món.
- Manager nhận/từ chối đơn; tạo PreparationTasks; Barista bắt đầu pha, hoàn thành lần lượt từng phần, Waiter xác nhận mang món ra.
- Realtime SignalR + Outbox cơ bản phát sau commit, client refetch khi reconnect; trên thiết bị hỗ trợ dùng Vibration API ba nhịp và sự kiện duy nhất.
- Tiền mặt: cashier nhập số tiền khách đưa, backend tính tiền thừa, ghi Payment và PaymentAllocation.
- Chuyển khoản **DEMO**: URL thanh toán mô phỏng của đúng order, thử thành công/thất bại; không giao tiếp ngân hàng.
- Yêu cầu gọi nhân viên/xin thêm nước/thanh toán; màn hình Waiter xử lý.
- Kho cơ bản: xem nguyên liệu, điều chỉnh tồn với reason và movement + audit; chống âm kho bằng transaction.
- Đặt bàn đơn giản có kiểm tra sức chứa, khoảng thời gian bị trùng.
- Dashboard doanh thu tiền đã thu theo ngày nghiệp vụ Việt Nam (UTC+7); top món; tách IsDemo thực/demo.
- CSS giao diện admin/khách responsive, QR SVG, Nginx và Docker demo.

## 2. Yêu cầu máy Windows

1. SQL Server Express (instance `SQLEXPRESS`) đang chạy và `sa` được bật, SQL Server Authentication được cho phép.
2. **.NET 8 SDK**, Node.js 20+, npm, Internet ở lần `dotnet restore`/`npm install` đầu.
3. Bản SQL Server Express trong SSMS ở ảnh của bạn dùng `sa`. Mật khẩu này chỉ nhập khi script hỏi; KHÔNG lưu vào repository.
4. SQL Server có thể tạo DB mới `MocCafeDB`. Không chạy trên DB khác đang có dữ liệu mà không backup.

## 3. Chạy với SQL Server Express trên Windows (khuyến nghị)

Trong thư mục gốc `MocCafeOS`, mở **PowerShell 1**:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup-windows.ps1
```

Script hỏi:

- Server: **nhấn Enter** để nhận mặc định `localhost\SQLEXPRESS` (KHÔNG nhập `MocCafeDB` vào trường Server).
- Mật khẩu `sa`: nhập mật khẩu trên máy của bạn.
- Chọn mật khẩu đăng nhập Owner mới, riêng với mật khẩu SQL Server (ít nhất 8 ký tự, có chữ hoa, chữ thường, số, ký tự đặc biệt).
- Public frontend URL: `http://localhost:5173` khi thử cùng máy. **Khi QR dùng trên điện thoại**, nhập `http://192.168.x.x:5173` với IP LAN thực của PC; điện thoại và PC cùng Wi-Fi, firewall cho phép cổng 5173/5088.

Script sẽ `dotnet restore`, cài `dotnet-ef`, tạo migration `InitialCreate` nếu chưa có, `dotnet ef database update` trên DB mới, rồi chạy API tại `http://localhost:5088` (Swagger: `/swagger`). **Không xóa DB hay drop bảng.** Nếu DB cũ có schema không trùng với model, migration có thể thất bại; cần xem và chỉnh migration, không cưỡng ép xóa bảng.

Mở **PowerShell 2**:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\run-frontend.ps1
```

Truy cập `http://localhost:5173/login`:

- Owner email: `owner@moccafe.local`
- Mật khẩu: giá trị bạn đặt ở PowerShell 1 (không phải mật khẩu SQL Server).

**Lưu ý:** Script giữ secret trong môi trường tiến trình PowerShell. Mỗi lần khởi chạy script sẽ tạo JWT key mới; token đăng nhập cũ sẽ hết hiệu lực. Không dùng cơ chế này ở production. Thay bằng key lâu dài trong secret store.

## 4. Demo một vòng gọi món

1. Đăng nhập Owner; trang **Sơ đồ chòi** → **Mở phiên** ở Bàn 01 (giữ `DEMO`).
2. Chọn biểu tượng QR tại Bàn 01 → nhận link/QR **mới**. Trên điện thoại quét QR (public URL phải là IP LAN).
3. Khách xem menu, thêm size/topping, giỏ hàng → chọn **Chuyển khoản DEMO** → gửi đơn.
4. Khách bấm mở đường dẫn mô phỏng → thử **thất bại** và **thành công**.
5. Manager vào **Đơn hàng** → tiếp nhận. Tại **Pha chế**, nhấn bắt đầu và hoàn thành từng món. Trang khách nhận event `OrderReady` và gọi rung 3 nhịp trên trình duyệt hỗ trợ.
6. Waiter vào **Phục vụ**, xác nhận món đã mang ra. Khách có thể gọi thêm món bằng giỏ hàng và chọn tiền mặt.
7. Trong trang đơn, nhập số tiền khách đưa → **Xác nhận thu**. Cuối cùng đóng phiên ở trang chòi nếu mọi đơn đã được xử lý.
8. Trang **Báo cáo** có chế độ DEMO/THỰC, không cộng tiền khách đưa làm doanh thu.

## 5. Docker — chỉ cho database DEMO mới

Tạo `.env` từ `.env.example`, nhập secret thật mạnh. Cần máy hỗ trợ Docker/SQL Server Linux và đủ RAM. Sau đó:

```bash
docker compose up --build
```

Frontend: `http://localhost:8082`; backend: `http://localhost:5088`; SQL Server host: `localhost,14333`.

**Cảnh báo:** Docker demo dùng `Database.EnsureCreated()` khi Development và `Bootstrap__EnsureCreated=true` để tạo bảng trên **database mới**. Nó **không tạo lịch sử EF migrations**, không được trộn với luồng `dotnet ef database update` trên cùng DB đó. Để phát triển lâu dài, ưu tiên Windows migration ở mục 3. `SQL_SA_PASSWORD` dùng biến môi trường, tuyệt đối không commit `.env`.

## 6. Danh sách API / bảo mật

Xem [docs/API.md](docs/API.md), [docs/ERD.md](docs/ERD.md), [docs/TESTING.md](docs/TESTING.md).

Các API staff yêu cầu JWT với role tương ứng. Guest API yêu cầu `X-Guest-Token` ngoại trừ `/join`, `/menu`; `JoinVisit` trong Hub dùng token xác thực trong DB, không tin visitId từ browser. Lưu ý guest/session tokens lưu trên client; cần HTTPS trước khi mở Internet. JWT hiện chỉ có **access token** (chưa refresh token). Cần kiểm tra phát hiện XSS, CSRF nếu chuyển sang cookie và rate limits trước deploy thực.

## 7. Chưa triển khai (không có nút giả)

Phần mềm **chưa** có: refresh token rotation, self-service quản lý nhân viên/permissions chi tiết, POS tại quầy, tự trừ kho theo công thức, quản lý nhà cung cấp/nhập hàng/kiểm kê nâng cao, phiên bản công thức, khuyến mãi, tích điểm/CRM, cọc/đổi bàn/đổi lịch/huỷ đặt, thanh toán VietQR ngân hàng thật & webhook, đối soát tự động, split bill, refund, ca thu ngân, PDF hóa đơn, đánh giá, phân tích giá vốn/lợi nhuận, biểu đồ nhiều kỳ, dữ liệu lịch sử 6 tháng, audit đầy đủ, PWA/WebPush, test tích hợp SQL Server và test E2E. Nếu đang dùng hiện trường, phải hoàn thiện trước khi thanh toán thật.

## 8. Trạng thái kiểm chứng

Tệp nguồn được kiểm tra cấu trúc và TypeScript/TSX bằng trình phân tích cú pháp (xem `docs/TESTING.md`). Môi trường tạo source **không có `dotnet`, SQL Server, Docker hoặc quyền truy cập máy Windows của bạn**, không có mạng để cài NPM/NuGet. Vì vậy **chưa chạy** `dotnet build`, `dotnet ef database update`, `npm run build`, integration tests và thử QR/rung trên điện thoại thật. Có thể cần sửa lỗi build/integration cụ thể sau lần chạy đầu tiên. Không coi đây là hệ thống đã kiểm thử production.

Bộ test invariant tối thiểu được viết trong `backend/MocCafe.UnitTests/` (chưa chạy). Khi có SDK: `dotnet test .\backend\MocCafe.sln`.
