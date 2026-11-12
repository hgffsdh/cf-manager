using Microsoft.EntityFrameworkCore;
using MocCafe.Api.Data;

namespace MocCafe.Api.Endpoints;

/// <summary>
/// Lich su va chi tiet don: chi doc, khong thay doi trang thai don hay thanh toan.
/// </summary>
public static class HistoryEndpoints
{
    public static void MapHistory(this WebApplication app)
    {
        var api = app.MapGroup("/api/v1/staff").RequireAuthorization().WithTags("History");

        // days = 0 means full history. Times are stored as UTC; reporting day follows Viet Nam (UTC+7).
        api.MapGet("/order-history", async (CafeDbContext db, string status = "all", string source = "real", int days = 0,
            string? search = null, int page = 1) =>
        {
            var allowed = new[] { "all", "completed", "ready", "served", "paid", "unpaid", "pending", "rejected" };
            if (!allowed.Contains(status) || source is not ("all" or "real" or "demo") || days is not (0 or 1 or 7 or 30 or 90))
                return Results.BadRequest(new { message = "Bộ lọc lịch sử đơn hàng không hợp lệ." });
            if (search?.Length > 80) return Results.BadRequest(new { message = "Từ khóa tối đa 80 ký tự." });
            page = Math.Clamp(page, 1, 10000);

            var q = db.Orders.AsNoTracking().AsQueryable();
            if (source == "real") q = q.Where(o => !o.IsDemo);
            if (source == "demo") q = q.Where(o => o.IsDemo);
            if (days > 0)
            {
                var vietnamToday = DateTime.UtcNow.AddHours(7).Date;
                var startUtc = vietnamToday.AddDays(1 - days).AddHours(-7);
                var endUtc = vietnamToday.AddDays(1).AddHours(-7);
                q = q.Where(o => o.CreatedAt >= startUtc && o.CreatedAt < endUtc);
            }
            if (!string.IsNullOrWhiteSpace(search))
            {
                var term = search.Trim();
                q = q.Where(o => o.OrderNumber.Contains(term) || o.VisitSession.Table.Name.Contains(term));
            }
            q = status switch
            {
                "completed" => q.Where(o => o.FulfillmentStatus == "Ready" || o.FulfillmentStatus == "PartiallyServed" || o.FulfillmentStatus == "Served"),
                "ready" => q.Where(o => o.FulfillmentStatus == "Ready"),
                "served" => q.Where(o => o.FulfillmentStatus == "Served"),
                "paid" => q.Where(o => o.PaymentStatus == "Paid"),
                "unpaid" => q.Where(o => o.PaymentStatus != "Paid" && o.AcceptanceStatus != "Rejected"),
                "pending" => q.Where(o => o.AcceptanceStatus == "Pending"),
                "rejected" => q.Where(o => o.AcceptanceStatus == "Rejected"),
                _ => q
            };
            var totalCount = await q.CountAsync();
            var items = await q.OrderByDescending(o => o.CreatedAt).ThenByDescending(o => o.Id)
                .Skip((page - 1) * 20).Take(20)
                .Select(o => new
                {
                    o.Id, o.OrderNumber, o.CreatedAt, o.TotalAmount, o.IsDemo,
                    o.AcceptanceStatus, o.FulfillmentStatus, o.PaymentStatus, o.PaymentMethod,
                    table = o.VisitSession.Table.Name,
                    itemCount = o.Items.Sum(i => i.Quantity)
                }).ToListAsync();
            return Results.Ok(new { items, totalCount, page, pageSize = 20 });
        }).RequireAuthorization("OrdersView");

        // The kitchen may open order details by its human-readable unique code.
        api.MapGet("/order-history/detail/{orderNumber}", async (string orderNumber, CafeDbContext db) =>
        {
            if (orderNumber.Length is < 1 or > 100) return Results.NotFound();
            var order = await db.Orders.AsNoTracking()
                .Where(o => o.OrderNumber == orderNumber)
                .Select(o => new
                {
                    o.Id, o.OrderNumber, o.CreatedAt, o.AcceptedAt,
                    o.AcceptanceStatus, o.FulfillmentStatus, o.PaymentStatus, o.PaymentMethod,
                    o.Source, o.Note, o.IsDemo, o.Subtotal, o.TotalAmount,
                    table = o.VisitSession.Table.Name,
                    area = o.VisitSession.Table.Hut != null ? o.VisitSession.Table.Hut.Area.Name : "Khu chung",
                    items = o.Items.OrderBy(i => i.ProductName).Select(i => new
                    {
                        i.Id, i.ProductName, i.VariantName, i.UnitPrice, i.LineTotal,
                        i.Quantity, i.ReadyQuantity, i.ServedQuantity, i.Note,
                        modifiers = i.Modifiers.Select(m => new { m.Name, m.UnitPrice })
                    })
                }).FirstOrDefaultAsync();
            if (order == null) return Results.NotFound();

            var payments = await db.PaymentAllocations.AsNoTracking().Where(a => a.OrderId == order.Id)
                .Join(db.Payments.AsNoTracking(), a => a.PaymentId, p => p.Id,
                    (a, p) => new { a.Amount, p.Method, p.ReferenceCode, p.CollectedAt, p.IsDemo })
                .OrderBy(x => x.CollectedAt).ToListAsync();
            return Results.Ok(new { order, payments });
        }).RequireAuthorization("OrdersView");

        // MOC_DAILY_SERVED_HISTORY_V1: each fully served order belongs to the VN day it was served.
        // Pre-upgrade served orders without ServedAt are grouped by CreatedAt, flagged as estimated.
        api.MapGet("/order-history/served-days", async (CafeDbContext db) =>
        {
            var served = db.Orders.AsNoTracking().Where(o => !o.IsDemo && o.FulfillmentStatus == "Served");
            var groups = await served
                .GroupBy(o => (o.ServedAt ?? o.CreatedAt).AddHours(7).Date)
                .Select(g => new
                {
                    Date = g.Key,
                    OrderCount = g.Count(),
                    TotalAmount = g.Sum(o => o.TotalAmount),
                    EstimatedCount = g.Count(o => o.ServedAt == null)
                })
                .OrderByDescending(x => x.Date)
                .ToListAsync();
            var portions = await db.OrderItems.AsNoTracking()
                .Where(i => !i.Order.IsDemo && i.Order.FulfillmentStatus == "Served")
                .GroupBy(i => (i.Order.ServedAt ?? i.Order.CreatedAt).AddHours(7).Date)
                .Select(g => new { Date = g.Key, Portions = g.Sum(i => i.Quantity) })
                .ToListAsync();
            var portionMap = portions.ToDictionary(x => x.Date, x => x.Portions);
            return Results.Ok(groups.Select(g => new
            {
                date = g.Date.ToString("yyyy-MM-dd"),
                g.OrderCount,
                portions = portionMap.TryGetValue(g.Date, out var count) ? count : 0,
                g.TotalAmount,
                g.EstimatedCount
            }));
        }).RequireAuthorization("OrdersView");

        api.MapGet("/order-history/served-day", async (CafeDbContext db, string date, int page = 1) =>
        {
            if (!System.DateOnly.TryParseExact(date, "yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture,
                    System.Globalization.DateTimeStyles.None, out var vietnamDay))
                return Results.BadRequest(new { message = "Ngày phải theo định dạng YYYY-MM-DD." });
            page = Math.Clamp(page, 1, 10000);
            var startUtc = vietnamDay.ToDateTime(TimeOnly.MinValue).AddHours(-7);
            var endUtc = startUtc.AddDays(1);
            var q = db.Orders.AsNoTracking().Where(o => !o.IsDemo && o.FulfillmentStatus == "Served")
                .Where(o => (o.ServedAt ?? o.CreatedAt) >= startUtc && (o.ServedAt ?? o.CreatedAt) < endUtc);
            var totalCount = await q.CountAsync();
            var items = await q.OrderByDescending(o => o.ServedAt ?? o.CreatedAt)
                .ThenByDescending(o => o.Id)
                .Skip((page - 1) * 20).Take(20)
                .Select(o => new
                {
                    o.Id, o.OrderNumber, o.CreatedAt, o.ServedAt, o.TotalAmount, o.IsDemo,
                    o.AcceptanceStatus, o.FulfillmentStatus, o.PaymentStatus, o.PaymentMethod,
                    table = o.VisitSession.Table.Name,
                    itemCount = o.Items.Sum(i => i.Quantity),
                    isEstimated = o.ServedAt == null
                })
                .ToListAsync();
            return Results.Ok(new { items, totalCount, page, pageSize = 20 });
        }).RequireAuthorization("OrdersView");
        // Payment allocations, not payment totals: one payment can cover multiple orders.
        api.MapGet("/payment-history", async (CafeDbContext db, int days = 7, int page = 1) =>
        {
            if (days is not (0 or 1 or 7 or 30 or 90))
                return Results.BadRequest(new { message = "Khoảng thời gian không hợp lệ." });
            page = Math.Clamp(page, 1, 10000);
            var q = db.PaymentAllocations.AsNoTracking()
                .Where(a => !a.Order.IsDemo)
                .Join(db.Payments.AsNoTracking().Where(p => !p.IsDemo),
                    a => a.PaymentId, p => p.Id,
                    (a, p) => new
                    {
                        a.Id, a.Amount, p.ReferenceCode, p.Method, p.CollectedAt,
                        a.Order.OrderNumber, table = a.Order.VisitSession.Table.Name
                    });
            if (days > 0)
            {
                var vietnamToday = DateTime.UtcNow.AddHours(7).Date;
                var startUtc = vietnamToday.AddDays(1 - days).AddHours(-7);
                var endUtc = vietnamToday.AddDays(1).AddHours(-7);
                q = q.Where(x => x.CollectedAt >= startUtc && x.CollectedAt < endUtc);
            }
            var totalCount = await q.CountAsync();
            var totalCollected = await q.SumAsync(x => (decimal?)x.Amount) ?? 0m;
            var items = await q.OrderByDescending(x => x.CollectedAt).ThenByDescending(x => x.Id)
                .Skip((page - 1) * 20).Take(20).ToListAsync();
            return Results.Ok(new { items, totalCount, totalCollected, page, pageSize = 20 });
        }).RequireAuthorization("Reports");
    }
}
