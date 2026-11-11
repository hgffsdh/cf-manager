# Kế hoạch kiểm thử / tình trạng hiện tại

## Đã thực hiện khi tạo source

- Kiểm tra các file tồn tại và gói source ZIP.
- Kiểm tra cú pháp TS/TSX qua TypeScript `transpileModule` của môi trường công cụ (không phải full typecheck).
- Kiểm tra cấu trúc JSON và YAML; cấu hình không chứa mật khẩu SQL do người dùng cung cấp.

## CHƯA THỂ chạy tại môi trường tạo source

- `dotnet restore`, `dotnet build`, `dotnet ef database update` — không có .NET SDK / SQL Server.
- `npm install`, `npm run build` — môi trường không có kết nối npm registry.
- SignalR & SQL integration load/concurrency tests.
- Test E2E Chrome và rung điện thoại thật.

## Kiểm chứng trên máy Windows sau khi setup

Tại backend:

```powershell
dotnet build .\backend\MocCafe.Api\MocCafe.Api.csproj
```

Tại frontend:

```powershell
cd frontend
npm run typecheck
npm run build
```

Bài test cần bổ sung trước đưa vào vận hành: duplicate idempotency concurrent POST; 2 nhân viên accept cùng lúc; đồng thời thu tiền 2 thiết bị; demo thanh toán double submit; QR đã revoke; closed visit; giá/topping server; kho âm; SQL transaction reservation overlap; guest session không được đọc đơn của nhau; performance 100+ đồng thời; XSS; reconnect SignalR; rung 3 nhịp trên Chrome Android và fallback iPhone.

**Không có kết quả test runtime nên không khẳng định sản phẩm đã chạy xuyên suốt.**
