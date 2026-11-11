# API v1 (đã triển khai trong mã nguồn)

Base `/api/v1`. JWT bằng header `Authorization: Bearer <token>`. Guest token bằng `X-Guest-Token: <token>`. Mọi amount dùng VND `decimal` tính tại backend, không tin giá ở frontend.

| Method | Path | Scope | Nội dung |
|---|---|---|---|
| POST | `/auth/login` | Public | Email/password → JWT |
| POST | `/guest/join` | QR | `{qrToken}` → guest token |
| GET | `/guest/me` | Guest | Kiểm tra guest session đang mở |
| POST | `/guest/orders/{id}/demo-link` | Guest | Cấp lại QR DEMO cho đơn chưa trả |
| GET | `/guest/menu` | Public | Categories, products, variants & toppings |
| POST | `/guest/quote` | Guest | Báo giá server `{items:[{variantId,modifierOptionIds,quantity,note}]}` |
| POST | `/guest/orders` | Guest | Tạo đơn `{items,paymentMethod,idempotencyKey}` |
| GET | `/guest/orders` | Guest | Danh sách chỉ các order từ guest session |
| POST | `/guest/support` | Guest | Gọi nhân viên, nước, thanh toán |
| GET | `/staff/tables` | Floor | Danh sách bàn + phiên đang mở |
| POST | `/staff/tables/{id}/open` | Floor | `{guestCount,isDemo}` mở phiên |
| POST | `/staff/tables/{id}/qr` | Owner/Manager | Đổi QR, trả `url` (QR cũ vô hiệu hóa) |
| POST | `/staff/visits/{id}/close` | Floor | Đóng khi toàn bộ đơn hoàn thành, đã thu |
| GET | `/staff/orders?status=Pending` | OrdersView | Danh sách trang 30 dòng |
| POST | `/staff/orders/{id}/accept` | Owner/Manager | Tiếp nhận, tạo task pha chế |
| POST | `/staff/orders/{id}/reject` | Owner/Manager | `{reason}` chỉ chưa thu |
| GET | `/staff/kitchen` | Kitchen | Tasks theo từng món |
| POST | `/staff/kitchen/{id}/start` | Kitchen | Chuyển Queued → Preparing |
| POST | `/staff/kitchen/{id}/ready` | Kitchen | `{quantity:1}` chuẩn bị xong từng phần |
| POST | `/staff/items/{id}/serve` | Floor | `{quantity:1}` phục vụ |
| GET | `/staff/support` | Floor | Yêu cầu chưa xử lý |
| POST | `/staff/support/{id}/resolve` | Floor | Hoàn thành yêu cầu |
| POST | `/staff/payments/{orderId}/cash` | Cashier | `{tenderedAmount}` thu tiền |
| GET | `/demo-pay/{token}` | Demo | Xem thông tin thanh toán demo |
| POST | `/demo-pay/{token}` | Demo | `{succeed:true/false}` mô phỏng |
| GET | `/staff/dashboard?demo=true` | Owner/Manager | Dashboard theo mode |
| GET | `/staff/reports/top-products?demo=true` | Owner/Manager | Top món |
| GET | `/staff/ingredients` | Inventory | Tồn kho |
| POST | `/staff/ingredients/{id}/adjust` | Inventory | `{delta,reason}` |
| GET | `/staff/reservations` | Floor | Lịch đặt |
| POST | `/staff/reservations` | Floor | Đặt lịch mới |

SignalR `/hubs/cafe`. Staff tự tham gia nhóm `staff` khi kết nối bằng JWT. Khách gọi `JoinVisit(guestToken)` để gia nhập nhóm phiên hợp lệ. Server gửi: `OrderRequested`, `OrderAccepted`, `OrderRejected`, `OrderItemReady`, `OrderReady`, `PreparationStarted`, `OrderItemServed`, `OrderServed`, `PaymentStatusChanged`, `ServiceRequestCreated`, `ServiceRequestResolved`, `TableOccupancyChanged`, `InventoryLow`.

**Giới hạn:** API hiện mới là MVP, chưa có đầy đủ permission granularity, audit và exception mapping theo error code của đặc tả 30 chương.
