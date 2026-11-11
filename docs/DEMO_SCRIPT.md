# Kịch bản demo bảo vệ đồ án (MVP, khoảng 10 phút)

**Chuẩn bị:** SQL Server Express hoạt động; backend có migration và seed; Owner đăng nhập; máy dùng điện thoại trên cùng Wi-Fi; mở trang chòi + pha chế/đơn hàng tại các tab riêng. Trước buổi trình diễn tạo QR bàn mới và kiểm tra URL LAN.

0:00–1:00 — Giới thiệu kiến trúc: React TypeScript frontend, ASP.NET Core 8 + EF Core/Identity API, SQL Server, SignalR, Outbox. Hiện dashboard, giải thích DEMO/THỰC.

1:00–2:00 — Quản lý chòi: chọn Bàn 01, mở phiên demo, cấp QR. Cho người xem quét QR.

2:00–3:00 — Khách gọi món: chọn cà phê size L + topping, chọn trà, số lượng, xác nhận giỏ, chọn chuyển khoản DEMO, gửi đơn (server lưu snapshot và chống double submit).

3:00–4:00 — QR mô phỏng: mở link demo đúng đơn, nhấn thất bại, nhấn thành công. Giải thích chỉ là mô phỏng; không có kết nối ngân hàng, không có tiền thật.

4:00–5:30 — Manager nhận đơn: trang staff cập nhật, nhận đơn; các món tạo PreparationTask. Tại màn hình Kitchen nhấn bắt đầu rồi hoàn thành lần lượt một phần.

5:30–6:30 — Trên điện thoại khách: nhận thông báo món/đơn sẵn sàng; Chrome Android có thể rung 3 nhịp nếu browser hỗ trợ, không cam kết iOS rung. Nếu không hỗ trợ rung, hiển thị banner.

6:30–7:30 — Phục vụ tại chòi: waiter xác nhận số lượng mang ra; khách gọi nhân viên/xin thêm nước, waiter xử lý.

7:30–8:30 — Khách gọi thêm đợt hai, chọn tiền mặt; Cashier nhập số tiền đưa và hệ thống tính tiền thừa, lưu PaymentAllocation.

8:30–9:20 — Đóng phiên sau khi đơn đều Served/Paid. Vào báo cáo top món, bật chế độ demo/thực. Nêu rõ số liệu bán và tiền đã thu là hai thước đo khác nhau.

9:20–10:00 — Giới thiệu hạn chế minh bạch: chưa có hoàn tiền, ngân hàng thật, kho theo công thức tự trừ, phân tích lợi nhuận, v.v. Demo tình huống lỗi: bấm thu tiền lần 2 bị chặn hoặc xuất kho vượt tồn.

**Nếu phần nào chưa chạy được sau triển khai trên máy thật, hãy bỏ phần đó khỏi demo thay vì mô tả như đã thử nghiệm.**
