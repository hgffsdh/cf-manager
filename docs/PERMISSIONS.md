# Permission matrix hiện tại (role-based API policy)

| Nhóm chức năng | Owner | Manager | Cashier | Barista | Waiter | InventoryStaff |
|---|---|---|---|---|---|---|
| Dashboard & báo cáo | ✓ | ✓ | | | | |
| Xem đơn | ✓ | ✓ | ✓ | ✓ | ✓ | |
| Nhận/từ chối đơn | ✓ | ✓ | | | | |
| Pha chế | ✓ | ✓ | | ✓ | | |
| Phục vụ/mở & đóng phiên | ✓ | ✓ | | | ✓ | |
| Đổi QR bàn | ✓ | ✓ | | | | |
| Thu tiền mặt | ✓ | ✓ | ✓ | | | |
| Kho nguyên liệu | ✓ | ✓ | | | | ✓ |
| Đặt chòi | ✓ | ✓ | | | ✓ | |

Các chính sách nằm trong `Program.cs`. Đây là **phân quyền theo role ban đầu**, không phải hệ thống permission-based chi tiết như `Payments.Refund`, `Users.Manage` đã mô tả trong yêu cầu đầy đủ. Chưa có trang quản lý người dùng. Không tạo public signup cho staff.
