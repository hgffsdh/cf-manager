using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using MocCafe.Api.Contracts;
using MocCafe.Api.Data;
using MocCafe.Api.Domain;
using MocCafe.Api.Services;

namespace MocCafe.Api.Endpoints;
public static class GuestEndpoints
{
    public static void MapGuest(this WebApplication app)
    {
        var api = app.MapGroup("/api/v1/guest").WithTags("Guest").RequireRateLimiting("guest");
        api.MapPost("/join", async (JoinGuestDto input, CafeDbContext db) =>
        {
            if (string.IsNullOrWhiteSpace(input.QrToken) || input.QrToken.Length > 256) return Results.BadRequest(new { message = "QR không hợp lệ" });
            var hash = CafeSecurity.Hash(input.QrToken);
            var qr = await db.TableQrTokens.FirstOrDefaultAsync(x => x.TokenHash == hash && x.RevokedAt == null);
            if (qr == null) return Results.NotFound(new { message = "QR không hợp lệ hoặc đã đổi" });
            var visit = await db.VisitSessions.Include(x => x.Table).FirstOrDefaultAsync(x => x.TableId == qr.TableId && x.Status == "Open");
            if (visit == null || visit.Table.OperationalStatus != "Active") return Results.Conflict(new { message = "Bàn chưa mở phiên phục vụ" });
            var secret = CafeSecurity.Token();
            db.GuestSessions.Add(new GuestSession { VisitSessionId = visit.Id, AccessTokenHash = CafeSecurity.Hash(secret) });
            await db.SaveChangesAsync();
            return Results.Ok(new { guestToken = secret, visitId = visit.Id, tableName = visit.Table.Name, isDemo = visit.IsDemo });
        });
        api.MapGet("/me", async (CafeDbContext db, HttpContext ctx) =>
        {
            var guest = await CafeSecurity.Guest(ctx, db);
            if (guest == null) return Results.Unauthorized();
            return Results.Ok(new { guest.VisitSessionId, guest.VisitSession.IsDemo });
        });
        api.MapGet("/menu", async (CafeDbContext db) =>
        {
            var categories = await db.Categories.AsNoTracking().Where(c => c.IsActive).OrderBy(c => c.SortOrder).ToListAsync();
            var products = await db.Products.AsNoTracking().Where(p => p.IsActive)
                .Include(p => p.Variants)
                .Include(p => p.ModifierGroups).ThenInclude(pg => pg.ModifierGroup).ThenInclude(mg => mg.Options)
                .AsSplitQuery().ToListAsync();
            return Results.Ok(categories.Select(c => new { c.Id, c.Name,
                Products = products.Where(p => p.CategoryId == c.Id).Select(p => new { p.Id, p.Name, p.Description, p.ImageUrl, p.IsSoldOut, p.IsFeatured,
                    Variants = p.Variants.Where(v => v.IsActive).Select(v => new { v.Id, v.Name, v.Price }),
                    ModifierGroups = p.ModifierGroups.Select(m => new { m.ModifierGroup.Id, m.ModifierGroup.Name, m.ModifierGroup.MinSelections, m.ModifierGroup.MaxSelections,
                        Options = m.ModifierGroup.Options.Where(o => o.IsActive).Select(o => new { o.Id, o.Name, o.Price }) }) }) }));
        });
        api.MapPost("/quote", async (QuoteDto input, CafeDbContext db, HttpContext ctx) =>
        {
            if (await CafeSecurity.Guest(ctx, db) == null) return Results.Unauthorized();
            var (lines, error) = await Pricing.Calculate(db, input.Items);
            if (error != null) return Results.BadRequest(new { message = error });
            return Results.Ok(new { items = lines.Select(x => new { x.Product.Name, x.Variant.Id, x.Quantity, x.UnitTotal, total = x.UnitTotal * x.Quantity }),
                total = lines.Sum(x => x.UnitTotal * x.Quantity), validUntil = DateTime.UtcNow.AddMinutes(3) });
        });
        api.MapPost("/orders", async (CreateOrderDto input, CafeDbContext db, HttpContext ctx, IConfiguration cfg) =>
        {
            var guest = await CafeSecurity.Guest(ctx, db);
            if (guest == null) return Results.Unauthorized();
            if (guest.VisitSession.IsDemo) return Results.Conflict(new { message = "Phiên cũ là phiên thử nghiệm. Vui lòng nhờ nhân viên kết thúc phiên cũ và mở phiên thật." });
            if (input.PaymentMethod is not ("Cash" or "BankTransfer")) return Results.BadRequest(new { message = "Chỉ nhận tiền mặt hoặc chuyển khoản ngân hàng thật." });
            if (input.PaymentMethod == "BankTransfer" && !BankTransferSettings.TryGet(cfg, out _, out _, out _))
                return Results.Conflict(new { message = "Quán chưa cấu hình tài khoản nhận tiền thật. Vui lòng chọn tiền mặt." });
            if (string.IsNullOrWhiteSpace(input.IdempotencyKey) || input.IdempotencyKey.Length > 100) return Results.BadRequest(new { message = "Thiếu mã chống gửi trùng" });
            var canonical = JsonSerializer.Serialize(new { input.Items, input.PaymentMethod, input.Note });
            var hash = CafeSecurity.Hash(canonical);
            var previous = await db.Orders.FirstOrDefaultAsync(o => o.GuestSessionId == guest.Id && o.IdempotencyKey == input.IdempotencyKey);
            if (previous != null)
            {
                if (previous.RequestHash != hash) return Results.Conflict(new { message = "Idempotency key đã dùng cho nội dung khác" });
                return Results.Ok(new { orderId = previous.Id, orderNumber = previous.OrderNumber, total = previous.TotalAmount, isRetry = true });
            }
            var (lines, error) = await Pricing.Calculate(db, input.Items);
            if (error != null) return Results.BadRequest(new { message = error });
            if (lines.Any(l => l.Product.Category.BranchId != guest.VisitSession.BranchId)) return Results.BadRequest(new { message = "Món không thuộc chi nhánh" });
            if (input.PaymentMethod == "BankTransfer" && (lines.Sum(x => x.UnitTotal * x.Quantity) <= 0m || lines.Sum(x => x.UnitTotal * x.Quantity) != decimal.Truncate(lines.Sum(x => x.UnitTotal * x.Quantity))))
                return Results.BadRequest(new { message = "Thanh toán ngân hàng yêu cầu số tiền VND nguyên dương." });
            await using var tx = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable);
            var visit = await db.VisitSessions.FirstAsync(x => x.Id == guest.VisitSessionId);
            if (visit.Status != "Open") return Results.Conflict(new { message = "Phiên đã đóng" });
            var order = new CafeOrder { VisitSessionId = guest.VisitSessionId, GuestSessionId = guest.Id, BranchId = visit.BranchId, IsDemo = visit.IsDemo,
                OrderNumber = $"MC-{DateTime.UtcNow:yyMMdd}-{Guid.NewGuid().ToString("N")[..8]}".ToUpperInvariant(), PaymentMethod = input.PaymentMethod, IdempotencyKey = input.IdempotencyKey, RequestHash = hash,
                Note = input.Note ?? "", Subtotal = lines.Sum(x => x.UnitTotal * x.Quantity), TotalAmount = lines.Sum(x => x.UnitTotal * x.Quantity), PaymentStatus = input.PaymentMethod == "BankTransfer" ? "Pending" : "Unpaid" };
            foreach (var line in lines)
                order.Items.Add(new OrderItem { ProductVariantId = line.Variant.Id, StationId = line.Product.StationId, ProductName = line.Product.Name, VariantName = line.Variant.Name, UnitPrice = line.UnitTotal,
                    Quantity = line.Quantity, LineTotal = line.UnitTotal * line.Quantity, Note = line.Note, Modifiers = line.Options.Select(x => new OrderItemModifier { Name = x.Name, UnitPrice = x.Price }).ToList() });
            db.Orders.Add(order);
            string? bankReference = null;
            if (input.PaymentMethod == "BankTransfer")
            {
                bankReference = "MC" + DateTime.UtcNow.ToString("yyMMdd") + Guid.NewGuid().ToString("N")[..10].ToUpperInvariant();
                db.PaymentAttempts.Add(new PaymentAttempt {
                    OrderId = order.Id, ReferenceCode = bankReference, RequestedAmount = order.TotalAmount,
                    IsDemo = false, Status = "Created", DemoTokenHash = CafeSecurity.Hash(CafeSecurity.Token())
                });
            }
            Events.AddBoth(db, visit.Id, "OrderRequested", new { order.Id, order.OrderNumber, table = visit.TableId, order.TotalAmount });
            await db.SaveChangesAsync();
            await tx.CommitAsync();
            return Results.Created($"/api/v1/guest/orders/{order.Id}", new { orderId = order.Id, orderNumber = order.OrderNumber,
                total = order.TotalAmount, order.PaymentStatus, bankReference });
        });
        api.MapGet("/payment-options", async (CafeDbContext db, HttpContext ctx, IConfiguration cfg) =>
        {
            var guest = await CafeSecurity.Guest(ctx, db);
            if (guest == null) return Results.Unauthorized();
            return Results.Ok(new { cash = true,
                bankTransfer = !guest.VisitSession.IsDemo && BankTransferSettings.TryGet(cfg, out _, out _, out _) });
        });
        api.MapGet("/orders/{orderId:guid}/bank-details", async (Guid orderId, CafeDbContext db, HttpContext ctx, IConfiguration cfg) =>
        {
            var guest = await CafeSecurity.Guest(ctx, db);
            if (guest == null) return Results.Unauthorized();
            var order = await db.Orders.AsNoTracking().FirstOrDefaultAsync(o =>
                o.Id == orderId && o.GuestSessionId == guest.Id && !o.IsDemo && o.PaymentMethod == "BankTransfer");
            if (order == null) return Results.NotFound();
            var attempt = await db.PaymentAttempts.AsNoTracking().Where(a => a.OrderId == order.Id && !a.IsDemo)
                .OrderByDescending(a => a.CreatedAt).FirstOrDefaultAsync();
            if (attempt == null) return Results.NotFound();
            if (!BankTransferSettings.TryGet(cfg, out _, out _, out _))
                return Results.Conflict(new { message = "Cấu hình tài khoản nhận tiền hiện không khả dụng, vui lòng liên hệ nhân viên." });
            return Results.Ok(new { order.OrderNumber, order.PaymentStatus, bank = BankTransferSettings.Info(cfg, attempt.ReferenceCode, order.TotalAmount) });
        });
        api.MapPost("/orders/{orderId:guid}/notify-transfer", async (Guid orderId, CafeDbContext db, HttpContext ctx) =>
        {
            var guest = await CafeSecurity.Guest(ctx, db);
            if (guest == null) return Results.Unauthorized();
            var order = await db.Orders.AsNoTracking().FirstOrDefaultAsync(o =>
                o.Id == orderId && o.GuestSessionId == guest.Id && !o.IsDemo && o.PaymentMethod == "BankTransfer");
            if (order == null) return Results.NotFound();
            if (order.PaymentStatus == "Paid") return Results.Ok(new { message = "Đơn đã được quán xác nhận thanh toán." });
            if (order.AcceptanceStatus == "Rejected") return Results.Conflict(new { message = "Đơn đã bị từ chối." });
            var open = await db.ServiceRequests.AnyAsync(r => r.GuestSessionId == guest.Id && r.Type == "Payment"
                && r.Status == "New" && r.Note == order.OrderNumber);
            if (!open)
            {
                db.ServiceRequests.Add(new ServiceRequest { VisitSessionId = guest.VisitSessionId,
                    GuestSessionId = guest.Id, Type = "Payment", Note = order.OrderNumber });
                Events.AddBoth(db, order.VisitSessionId, "ServiceRequestCreated", new { order.Id, order.OrderNumber, type = "Payment" });
                await db.SaveChangesAsync();
            }
            return Results.Ok(new { message = "Đã báo thu ngân kiểm tra sao kê. Đơn vẫn chờ thanh toán cho tới khi quán đối chiếu được giao dịch thật." });
        });
        api.MapGet("/orders", async (CafeDbContext db, HttpContext ctx) =>
        {
            var guest = await CafeSecurity.Guest(ctx, db);
            if (guest == null) return Results.Unauthorized();
            var orders = await db.Orders.AsNoTracking().Where(x => x.GuestSessionId == guest.Id).OrderByDescending(x => x.CreatedAt)
                .Select(x => new { x.Id, x.OrderNumber, x.AcceptanceStatus, x.FulfillmentStatus, x.PaymentStatus, x.PaymentMethod, x.TotalAmount, x.CreatedAt,
                    Items = x.Items.Select(i => new { i.Id, i.ProductName, i.VariantName, i.Quantity, i.ReadyQuantity, i.ServedQuantity, i.LineTotal }) }).ToListAsync();
            return Results.Ok(orders);
        });
        api.MapPost("/support", async (SupportDto input, CafeDbContext db, HttpContext ctx) =>
        {
            var guest = await CafeSecurity.Guest(ctx, db);
            if (guest == null) return Results.Unauthorized();
            if (input.Type is not ("CallStaff" or "Water" or "Payment" or "Other")) return Results.BadRequest(new { message = "Loại yêu cầu không hợp lệ" });
            var open = await db.ServiceRequests.CountAsync(x => x.GuestSessionId == guest.Id && x.Status == "New");
            if (open >= 2) return Results.Conflict(new { message = "Vui lòng đợi nhân viên xử lý yêu cầu cũ" });
            var request = new ServiceRequest { VisitSessionId = guest.VisitSessionId, GuestSessionId = guest.Id, Type = input.Type, Note = (input.Note ?? "")[..Math.Min((input.Note ?? "").Length, 300)] };
            db.ServiceRequests.Add(request);
            Events.Add(db, "ServiceRequestCreated", "staff", new { request.Id, request.Type, request.VisitSessionId });
            await db.SaveChangesAsync();
            return Results.Ok(new { request.Id, request.Status });
        });
    }
}
