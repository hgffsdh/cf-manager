using System.Data;
using Microsoft.EntityFrameworkCore;
using MocCafe.Api.Contracts;
using MocCafe.Api.Data;
using MocCafe.Api.Domain;
using MocCafe.Api.Services;

namespace MocCafe.Api.Endpoints;
public static class OperationsEndpoints
{
    public static void MapOperations(this WebApplication app)
    {
        var api = app.MapGroup("/api/v1/staff").RequireAuthorization().WithTags("Operations");
        api.MapGet("/dashboard", async (CafeDbContext db, bool demo = false) =>
        {
            var today = DateTime.UtcNow.AddHours(7).Date.AddHours(-7); // Việt Nam UTC+07:00 business midnight
            var q = db.Orders.AsNoTracking().Where(x => x.IsDemo == demo && x.CreatedAt >= today);
            var orders = await q.CountAsync();
            var pending = await q.CountAsync(x => x.AcceptanceStatus == "Pending");
            // Dashboard and reports must use the same allocated-collection definition.
            var revenue = await db.PaymentAllocations.AsNoTracking().Where(a => a.Order.IsDemo == demo)
                .Join(db.Payments.AsNoTracking().Where(pay => pay.IsDemo == demo && pay.CollectedAt >= today),
                    a => a.PaymentId, pay => pay.Id, (a, pay) => a.Amount)
                .SumAsync(x => (decimal?)x) ?? 0m;
            var occupied = await db.VisitSessions.CountAsync(x => x.Status == "Open" && x.IsDemo == demo);
            var openService = await db.ServiceRequests.CountAsync(x => x.Status == "New" && !x.VisitSession.IsDemo);
            return Results.Ok(new { orders, pending, revenue, occupied, openService, isDemo = demo });
        }).RequireAuthorization("Reports");
        api.MapGet("/reports/top-products", async (CafeDbContext db, bool demo = false) =>
        {
            return Results.Ok(await db.OrderItems.AsNoTracking().Where(x => x.Order.IsDemo == demo && x.Order.AcceptanceStatus == "Accepted")
                .GroupBy(x => x.ProductName).Select(g => new { product = g.Key, quantity = g.Sum(x => x.Quantity), revenue = g.Sum(x => x.LineTotal) })
                .OrderByDescending(x => x.quantity).Take(10).ToListAsync());
        }).RequireAuthorization("Reports");
        // Báo cáo vận hành THỰC: chỉ các phiên/đơn không phải DEMO.
        // Tiền thực thu dựa trên PaymentAllocations để tránh cộng trùng khi phân bổ nhiều đơn.
        api.MapGet("/reports/actual", async (CafeDbContext db, int days = 7) =>
        {
            if (days is not (1 or 7 or 30))
                return Results.BadRequest(new { message = "Chỉ hỗ trợ các kỳ 1, 7 hoặc 30 ngày." });

            // Ngày nghiệp vụ tại Việt Nam; lưu và lọc DateTime bằng UTC.
            var vietnamToday = DateTime.UtcNow.AddHours(7).Date;
            var startUtc = vietnamToday.AddDays(1 - days).AddHours(-7);
            var endUtc = vietnamToday.AddDays(1).AddHours(-7);

            var orders = db.Orders.AsNoTracking()
                .Where(x => !x.IsDemo && x.CreatedAt >= startUtc && x.CreatedAt < endUtc);
            var orderCount = await orders.CountAsync();
            var paidOrderCount = await orders.CountAsync(x => x.PaymentStatus == "Paid");
            var unpaidOrderCount = await orders.CountAsync(x => x.PaymentStatus != "Paid" && x.AcceptanceStatus != "Rejected");

            // Chỉ cộng các allocations từ Payment THỰC đến Order THỰC.
            var realCollections = db.PaymentAllocations.AsNoTracking()
                .Where(a => !a.Order.IsDemo)
                .Join(db.Payments.AsNoTracking().Where(p => !p.IsDemo && p.CollectedAt >= startUtc && p.CollectedAt < endUtc),
                    a => a.PaymentId, p => p.Id,
                    (a, p) => new { a.Amount, p.Id, p.Method, p.CollectedAt });

            var collectedTotal = await realCollections.SumAsync(x => (decimal?)x.Amount) ?? 0m;
            var cashCollected = await realCollections.Where(x => x.Method == "Cash").SumAsync(x => (decimal?)x.Amount) ?? 0m;
            var otherCollected = collectedTotal - cashCollected;
            var paymentCount = await realCollections.Select(x => x.Id).Distinct().CountAsync();

            // EF Core dịch DATEADD(+7h) và GROUP BY xuống SQL Server.
            var dayTotals = await realCollections
                .GroupBy(x => x.CollectedAt.AddHours(7).Date)
                .Select(g => new { Date = g.Key, Amount = g.Sum(x => x.Amount) })
                .ToListAsync();
            var dayLookup = dayTotals.ToDictionary(x => x.Date.Date, x => x.Amount);
            var dailyCollected = Enumerable.Range(0, days).Select(i =>
            {
                var date = vietnamToday.AddDays(1 - days + i);
                return new { date = date.ToString("yyyy-MM-dd"), amount = dayLookup.GetValueOrDefault(date, 0m) };
            }).ToList();

            // Giá trị món: theo ngày TẠO ĐƠN đã thanh toán, không đồng nhất với tiền thực thu.
            var topProducts = await db.OrderItems.AsNoTracking()
                .Where(x => !x.Order.IsDemo && x.Order.AcceptanceStatus == "Accepted"
                    && x.Order.PaymentStatus == "Paid" && x.Order.CreatedAt >= startUtc && x.Order.CreatedAt < endUtc)
                .GroupBy(x => x.ProductName)
                .Select(g => new { product = g.Key, quantity = g.Sum(x => x.Quantity), orderValue = g.Sum(x => x.LineTotal) })
                .OrderByDescending(x => x.quantity).Take(10).ToListAsync();

            return Results.Ok(new
            {
                fromDate = vietnamToday.AddDays(1 - days).ToString("yyyy-MM-dd"),
                toDate = vietnamToday.ToString("yyyy-MM-dd"),
                orderCount, paidOrderCount, unpaidOrderCount, paymentCount,
                collectedTotal, cashCollected, otherCollected, dailyCollected, topProducts
            });
        }).RequireAuthorization("Reports");

        api.MapGet("/ingredients", async (CafeDbContext db) => Results.Ok(await db.Ingredients.AsNoTracking().OrderBy(x => x.Name)
            .Select(x => new { x.Id, x.Code, x.Name, x.Unit, x.OnHand, x.MinimumStock, low = x.OnHand <= x.MinimumStock }).ToListAsync())).RequireAuthorization("Inventory");
        api.MapPost("/ingredients/{id:guid}/adjust", async (Guid id, InventoryAdjustDto input, CafeDbContext db, HttpContext ctx) =>
        {
            if (string.IsNullOrWhiteSpace(input.Reason) || input.Delta == 0) return Results.BadRequest(new { message = "Cần số lượng và lý do" });
            await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
            var item = await db.Ingredients.FirstOrDefaultAsync(x => x.Id == id);
            if (item == null) return Results.NotFound();
            if (item.OnHand + input.Delta < 0) return Results.Conflict(new { message = "Không được xuất vượt tồn" });
            item.OnHand += input.Delta;
            db.InventoryMovements.Add(new InventoryMovement { IngredientId = id, QuantityDelta = input.Delta, Reason = input.Reason, ActorId = CafeSecurity.ActorId(ctx.User) });
            db.AuditLogs.Add(new AuditLog { ActorId = CafeSecurity.ActorId(ctx.User), Action = "InventoryAdjusted", EntityType = "Ingredient", EntityId = id, Details = $"delta={input.Delta};reason={input.Reason}" });
            if (item.OnHand <= item.MinimumStock) Events.Add(db, "InventoryLow", "staff", new { item.Id, item.Name, item.OnHand });
            try { await db.SaveChangesAsync(); await tx.CommitAsync(); } catch (DbUpdateConcurrencyException) { return Results.Conflict(new { message = "Tồn kho vừa thay đổi, hãy tải lại" }); }
            return Results.Ok(new { item.OnHand });
        }).RequireAuthorization("Inventory");
        api.MapGet("/reservations", async (CafeDbContext db) => Results.Ok(await db.Reservations.AsNoTracking()
            .OrderByDescending(x => x.StartAt).Take(100).Select(x => new { x.Id, x.TableId, x.CustomerName, x.Phone, x.GuestCount, x.StartAt, x.EndAt, x.Status }).ToListAsync())).RequireAuthorization("Floor");
        api.MapPost("/reservations", async (ReservationDto input, CafeDbContext db) =>
        {
            if (input.StartAt >= input.EndAt || input.GuestCount < 1 || input.GuestCount > 25 || string.IsNullOrWhiteSpace(input.CustomerName))
                return Results.BadRequest(new { message = "Thông tin đặt chòi không hợp lệ" });
            await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
            var table = await db.CafeTables.FirstOrDefaultAsync(x => x.Id == input.TableId);
            if (table == null) return Results.NotFound();
            if (table.Capacity < input.GuestCount) return Results.Conflict(new { message = "Bàn không đủ chỗ" });
            if (await db.Reservations.AnyAsync(x => x.TableId == input.TableId && x.Status == "Confirmed" && x.StartAt < input.EndAt && input.StartAt < x.EndAt))
                return Results.Conflict(new { message = "Bàn đã có người đặt trong khoảng thời gian này" });
            var reservation = new Reservation { TableId = input.TableId, CustomerName = input.CustomerName, Phone = input.Phone,
                GuestCount = input.GuestCount, StartAt = input.StartAt.ToUniversalTime(), EndAt = input.EndAt.ToUniversalTime() };
            db.Reservations.Add(reservation);
            await db.SaveChangesAsync(); await tx.CommitAsync();
            return Results.Created($"/api/v1/staff/reservations/{reservation.Id}", reservation);
        }).RequireAuthorization("Floor");
    }
}
