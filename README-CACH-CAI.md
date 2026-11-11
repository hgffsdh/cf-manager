# MỘC CAFÉ OS — CHỈ ĐƯỜNG ĐẾN CHÒI CHO KHÁCH

> Bản cập nhật dành cho source Mộc Café OS có `MapX`, `MapY`, trang Quản lý bàn/chòi và bản quản lý món thật SQL. Thêm tính năng mới vào dự án đang chạy, **KHÔNG xóa `MocCafeDB`**, không đổi chức năng thu tiền.

## Tính năng

**Dành cho khách (không cần tài khoản):**
- Vào `http://localhost:5173/chon-choi` để xem sơ đồ quán, tìm kiếm chòi, chọn chòi và xem đường đi từ cổng.
- Trong trang QR `/g/:qr`, bấm **Chỉ đường đến chòi** để mở sơ đồ và tự chọn đúng chòi đã gán QR.
- Dữ liệu vị trí bàn/chòi lấy từ SQL Server: `CafeTables.MapX` / `MapY`.
- Đường đi màu xanh **chỉ xuất hiện sau khi quản lý vẽ và lưu mạng lưới lối đi đúng thực tế**. Không vẽ đường xuyên hồ/tường do suy đoán. Chỉ đường từ cổng (điểm vào) chứ không xác định vị trí GPS của điện thoại.
- Bấm chọn một chòi không cấp quyền đặt món, **vẫn phải quét QR hợp lệ tại bàn**.

**Dành cho quản lý (Owner/Manager):**
- Mở `http://localhost:5173/admin/navigation`.
- Bấm **Thêm điểm**, bấm lên mặt bằng để đặt các nút ở các khúc rẽ/lối đi.
- Bấm **Nối lối đi**, lần lượt bấm hai điểm có lối đi thông nhau; làm lần lượt tới chòi.
- Bấm **Đặt cổng**, chọn điểm ngay cổng vào thực tế.
- Chọn chòi ở ô **Chòi cần gán lối vào**, bấm **Gán chòi**, rồi bấm nút lối đi gần cửa chòi đó.
- Nhấn **Lưu vào SQL Server**. Mỗi chòi cần được gán một điểm tiếp cận thuộc mạng lưới đường thông từ cổng.
- Nếu muốn sửa vị trí chòi, quay lại **Sơ đồ bàn & chòi → Chỉnh vị trí** (không phải trang lối đi).

Lược đồ lưu cấu hình: `CafeNavigationLayouts(BranchId UNIQUE, LayoutJson, UpdatedAt)`. Đây là JSON chứa các điểm lối đi, các đoạn nối và quan hệ điểm tiếp cận chòi. **Tọa độ chòi vẫn ở bảng CafeTables.**

## Cài đặt chi tiết trên Windows

### 1. Backup

- Dừng backend đang chạy bằng `Ctrl+C`.
- Sao lưu toàn bộ `A:\MocCafeOS` và sao lưu riêng database `MocCafeDB` trong SQL Server Management Studio (Tasks → Back Up).
- Không xóa EF migrations cũ; không copy đè file cấu hình/secret từ nơi khác.

### 2. Giải nén patch

Giải nén ZIP; chép **nội dung bên trong** thư mục `frontend`, `backend`, `scripts` vào đúng các thư mục cùng tên bên trong `A:\MocCafeOS`. Patch này chỉ có **các file mới** trong ba thư mục, không chép đè `Guest.tsx`, `Program.cs` hoặc `App.tsx` cũ ở bước này.

Sau khi chép, cần có:

```
A:\MocCafeOS\frontend\src\pages\ChooseHut.tsx
A:\MocCafeOS\frontend\src\pages\ChooseHut.css
A:\MocCafeOS\frontend\src\pages\NavigationEditor.tsx
A:\MocCafeOS\frontend\src\pages\NavigationEditor.css
A:\MocCafeOS\frontend\src\lib\cafeRoute.ts
A:\MocCafeOS\backend\MocCafe.Api\Endpoints\NavigationEndpoints.cs
A:\MocCafeOS\backend\MocCafe.Api\Domain\CafeNavigationLayout.cs
A:\MocCafeOS\scripts\install-guest-navigation.py
A:\MocCafeOS\scripts\install-guest-navigation.ps1
A:\MocCafeOS\scripts\enable-guest-navigation.ps1
```

### 3. Ghép chức năng vào source cũ mà không làm mất các bản cập nhật đã có

Mở CMD:

```cmd
cd /d A:\MocCafeOS
powershell -ExecutionPolicy Bypass -File ".\scripts\install-guest-navigation.ps1"
```

Nếu muốn chạy trực tiếp bằng Python:

```cmd
py -3 scripts\install-guest-navigation.py
```

Script kiểm tra tất cả điểm ghép **trước khi sửa**, sao lưu file cũ vào `.wayfinding-backups\<thời-gian>` và chỉ thêm import, route, DTO và gọi API cần thiết. Nếu có thông báo **DỪNG ĐỂ BẢO VỆ SOURCE**, đừng chạy migration; gửi nội dung lỗi và file tương ứng để ghép tay. Không chỉnh sửa lại bằng file full source cũ.

### 4. Build backend và tạo migration bổ sung

```cmd
cd /d A:\MocCafeOS
powershell -ExecutionPolicy Bypass -File ".\scripts\enable-guest-navigation.ps1"
```

Nhấn Enter để chọn `localhost\SQLEXPRESS`; nhập password `sa` như các bản cập nhật trước đó.

Script sẽ:
1. `dotnet build` trước.
2. Tạo migration `AddCafeNavigationLayout` nếu chưa có.
3. **Đọc riêng `Up()`** và chỉ chấp nhận `CreateTable`/`CreateIndex` của `CafeNavigationLayouts`. Nếu có lệnh `DropTable`, `DropColumn`, `AlterColumn` hoặc thay bảng khác, **DỪNG** — gửi file migration để kiểm tra.
4. Chạy `database update` để tạo bảng mới, không xóa đơn hàng hoặc ảnh đã tải.

Lưu ý EF có thể cảnh báo thiếu `Jwt:Key` khi chạy migration design-time rồi vẫn thực hiện migration qua `DesignTimeCafeDbContextFactory`; đây không nhất thiết là lỗi. Nếu có exception khi chạy ứng dụng, hãy kiểm tra JWT configuration bằng script backend đã dùng trước đó.

### 5. Chạy lại website

CMD 1 — backend:

```cmd
cd /d A:\MocCafeOS
powershell -ExecutionPolicy Bypass -File ".\scripts\run-real-backend.ps1"
```

CMD 2 — frontend:

```cmd
cd /d A:\MocCafeOS
powershell -ExecutionPolicy Bypass -File ".\scripts\run-frontend.ps1"
```

- Owner/Manager: `http://localhost:5173/admin/navigation`
- Khách: `http://localhost:5173/chon-choi`
- API công khai: `http://localhost:5088/api/v1/guest/hut-map`
- Trang khách có QR: `http://localhost:5173/g/MÃ-QR-HỢP-LỆ`

### 6. Kiểm tra SQL Server

```sql
USE MocCafeDB;
SELECT TOP (10) Id, BranchId, UpdatedAt, LEN(LayoutJson) AS JsonLength
FROM dbo.CafeNavigationLayouts;

SELECT Code, Name, MapX, MapY
FROM dbo.CafeTables ORDER BY Code;
```

Nếu đã lưu một sơ đồ lối đi ở trang quản lý, bảng `CafeNavigationLayouts` sẽ có một bản ghi. Nếu chưa từng lưu, bảng rỗng là bình thường.

## Kiểm tra luồng hoạt động

1. Đăng nhập Owner, vào `/admin/tables`, chỉnh đúng vị trí ít nhất một chòi (`MapX`, `MapY`).
2. Vào `/admin/navigation`, tạo cổng, các điểm rẽ, nối đường và gán điểm tiếp cận cho chòi đó.
3. Nhấn Lưu. Mở `/chon-choi`, chọn chòi — sẽ thấy đường màu xanh từ cổng đến điểm tiếp cận.
4. Thử một chòi chưa gán, trang phải ghi **chưa có lối đi hợp lệ** thay vì chỉ sai.
5. Đăng nhập Owner, mở VisitSession theo nghiệp vụ hiện có và tạo QR. Khách quét QR, nhấn **Chỉ đường đến chòi**, xem sơ đồ đã chọn sẵn đúng chòi.
6. Thử tạo đơn cho chòi khác chỉ bằng cách chọn trên map: không được cấp guest token hoặc tự mở phiên. QR vẫn cần được xác thực ở backend.

## Giới hạn quan trọng

- Đây là **bản đồ đi bộ trong khuôn viên quán**, không dùng Google Maps GPS vì độ chính xác GPS không đủ để chỉ ra từng chòi trong khuôn viên nhỏ.
- Tuyến vẽ trên bản đồ là tuyến ngắn nhất trên **các đoạn lối đi do quản lý vẽ**, không phải định vị người đi theo thời gian thực. Không có ước tính mét/phút nếu chưa đo kích thước thật.
- Ảnh mặt bằng hiện là nền trung tính (không giả vẽ hồ, tường hay khu vực chưa biết); nếu quán cung cấp sơ đồ/bản vẽ thực tế, có thể bổ sung ảnh nền và hiệu chỉnh đường đi.
- Bản này dùng **chi nhánh đang hoạt động đầu tiên**, phù hợp bản Mộc Café một chi nhánh hiện tại; nhiều chi nhánh cần thêm tham số branch có kiểm soát.
- Cần thử build và migration trên Windows thật: môi trường tạo bản patch không có .NET SDK/SQL Server Windows.
