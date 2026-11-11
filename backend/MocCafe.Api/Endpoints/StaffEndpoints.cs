using Microsoft.EntityFrameworkCore;
using MocCafe.Api.Contracts;
using MocCafe.Api.Data;
using MocCafe.Api.Domain;
using MocCafe.Api.Services;

namespace MocCafe.Api.Endpoints;
public static class StaffEndpoints
{
    public static void MapStaff(this WebApplication app)
    {
        var api = app.MapGroup("/api/v1/staff").RequireAuthorization().WithTags("Staff");
        api.MapGet("/tables", async (CafeDbContext db) =>
        {
            var tables = await db.CafeTables.AsNoTracking().Select(t => new { t.Id, t.Code, t.Name, t.Capacity, t.HutId, Area = t.Hut != null ? t.Hut.Area.Name : "Khu chung", t.OperationalStatus, t.MapX, t.MapY }).OrderBy(t => t.Code).ToListAsync();
            var open = await db.VisitSessions.AsNoTracking().Where(x => x.Status == "Open").Select(x => new { x.Id, x.TableId, x.IsDemo, x.OpenedAt }).ToListAsync();
            return Results.Ok(tables.Select(t => new { t.Id, t.Code, t.Name, t.Capacity, t.HutId, t.Area, t.OperationalStatus, t.MapX, t.MapY, Visit = open.FirstOrDefault(v => v.TableId == t.Id) }));
        }).RequireAuthorization("Floor");
        // Normalized 0-100 map coordinates; ownership and concurrency are enforced server-side.
        api.MapPut("/tables/{tableId:guid}/position", async (Guid tableId, CafeTablePositionDto input, CafeDbContext db) =>
        {
            if (input.X is < 8 or > 92 || input.Y is < 12 or > 88)
                return Results.BadRequest(new { message = "Vị trí chòi phải nằm trong khu vực sơ đồ." });
            var table = await db.CafeTables.FirstOrDefaultAsync(t => t.Id == tableId);
            if (table == null) return Results.NotFound();
            table.MapX = input.X;
            table.MapY = input.Y;
            try
            {
                await db.SaveChangesAsync();
                return Results.Ok(new { table.Id, table.MapX, table.MapY });
            }
            catch (DbUpdateConcurrencyException)
            {
                return Results.Conflict(new { message = "Vị trí đã được người khác cập nhật, hãy tải lại trang." });
            }
        }).RequireAuthorization("ManagerOnly");
        api.MapPost("/tables/{tableId:guid}/open", async (Guid tableId, OpenVisitDto input, CafeDbContext db) =>
        {
            if (input.GuestCount is < 1 or > 25) return Results.BadRequest(new { message = "Số khách không hợp lệ" });
            if (input.IsDemo) return Results.BadRequest(new { message = "Hệ thống đang vận hành thực tế; không thể mở phiên DEMO mới." });
            await using var tx = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable);
            var table = await db.CafeTables.FirstOrDefaultAsync(t => t.Id == tableId && t.OperationalStatus == "Active");
            if (table is null) return Results.NotFound();
            if (await db.VisitSessions.AnyAsync(v => v.TableId == tableId && v.Status == "Open")) return Results.Conflict(new { message = "Bàn đang có khách" });
            var visit = new VisitSession { TableId = tableId, BranchId = table.BranchId, GuestCount = input.GuestCount, IsDemo = false };
            db.VisitSessions.Add(visit);
            Events.Add(db, "TableOccupancyChanged", "staff", new { tableId, visit.Id, status = "Open" });
            await db.SaveChangesAsync(); await tx.CommitAsync();
            return Results.Ok(new { visit.Id, visit.IsDemo });
        }).RequireAuthorization("Floor");
        // Legacy demo sessions may still be open from the old version. Archive them explicitly;
        // never turn old demo orders into real income or mark unpaid orders as paid.
        api.MapPost("/visits/{visitId:guid}/archive-demo", async (Guid visitId, ArchiveDemoVisitDto input,
            CafeDbContext db, HttpContext ctx) =>
        {
            if (string.IsNullOrWhiteSpace(input.Reason) || input.Reason.Trim().Length < 5)
                return Results.BadRequest(new { message = "Cần nhập lý do lưu trữ phiên thử nghiệm." });
            await using var tx = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable);
            var visit = await db.VisitSessions.FirstOrDefaultAsync(v => v.Id == visitId && v.Status == "Open" && v.IsDemo);
            if (visit == null) return Results.NotFound();
            visit.Status = "Closed"; visit.ClosedAt = DateTime.UtcNow;
            var guests = await db.GuestSessions.Where(g => g.VisitSessionId == visitId && g.RevokedAt == null).ToListAsync();
            foreach (var guest in guests) guest.RevokedAt = DateTime.UtcNow;
            var tokens = await db.TableQrTokens.Where(t => t.TableId == visit.TableId && t.RevokedAt == null).ToListAsync();
            foreach (var token in tokens) token.RevokedAt = DateTime.UtcNow;
            db.AuditLogs.Add(new AuditLog { ActorId = CafeSecurity.ActorId(ctx.User),
                Action = "LegacyDemoVisitArchived", EntityType = "VisitSession", EntityId = visit.Id,
                Details = "Legacy demo session archived; reason=" + input.Reason.Trim()[..Math.Min(input.Reason.Trim().Length, 180)] });
            Events.AddBoth(db, visit.Id, "TableOccupancyChanged", new { visit.TableId, visitId, status = "Closed" });
            await db.SaveChangesAsync(); await tx.CommitAsync();
            return Results.Ok(new { visit.Id, visit.Status, visit.IsDemo });
        }).RequireAuthorization("ManagerOnly");
        api.MapPost("/tables/{tableId:guid}/qr", async (Guid tableId, CafeDbContext db, IConfiguration cfg) =>
        {
            if (!await db.CafeTables.AnyAsync(x => x.Id == tableId)) return Results.NotFound();
            await using var tx = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable);
            var previous = await db.TableQrTokens.Where(x => x.TableId == tableId && x.RevokedAt == null).ToListAsync();
            foreach (var x in previous) x.RevokedAt = DateTime.UtcNow;
            var version = (await db.TableQrTokens.Where(x => x.TableId == tableId).MaxAsync(x => (int?)x.Version) ?? 0) + 1;
            var token = CafeSecurity.Token();
            db.TableQrTokens.Add(new TableQrToken { TableId = tableId, TokenHash = CafeSecurity.Hash(token), Version = version });
            await db.SaveChangesAsync(); await tx.CommitAsync();
            var url = (cfg["PublicFrontendUrl"] ?? "http://localhost:5173").TrimEnd('/') + "/g/" + token;
            return Results.Ok(new { url, message = "QR cũ đã bị thu hồi. Hãy lưu hoặc in mã mới." });
        }).RequireAuthorization("ManagerOnly");
        api.MapPost("/visits/{visitId:guid}/close", async (Guid visitId, CafeDbContext db) =>
        {
            await using var tx = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable);
            var visit = await db.VisitSessions.FirstOrDefaultAsync(x => x.Id == visitId && x.Status == "Open");
            if (visit == null) return Results.NotFound();
            var orders = await db.Orders.Where(x => x.VisitSessionId == visitId).ToListAsync();
            if (!CafeRules.CanCloseVisit(orders))
                return Results.Conflict(new { message = "Vẫn còn đơn chưa hoàn thành hoặc chưa thu tiền" });
            visit.Status = "Closed"; visit.ClosedAt = DateTime.UtcNow;
            Events.AddBoth(db, visitId, "TableOccupancyChanged", new { visit.TableId, visitId, status = "Closed" });
            await db.SaveChangesAsync(); await tx.CommitAsync();
            return Results.Ok(new { visit.Status });
        }).RequireAuthorization("Floor");
        api.MapGet("/orders", async (CafeDbContext db, string? status, int page = 1) =>
        {
            page = Math.Clamp(page, 1, 10000);
            var q = db.Orders.AsNoTracking().Where(x => !x.IsDemo);
            if (!string.IsNullOrWhiteSpace(status)) q = q.Where(x => x.AcceptanceStatus == status || x.FulfillmentStatus == status);
            var totalCount = await q.CountAsync();
            var orders = await q.OrderByDescending(x => x.CreatedAt).Skip((page - 1) * 30).Take(30)
                .Select(x => new { x.Id, x.OrderNumber, x.CreatedAt, x.AcceptanceStatus, x.FulfillmentStatus, x.PaymentStatus, x.PaymentMethod, x.TotalAmount, x.IsDemo,
                    BankReference = db.PaymentAttempts.Where(a => a.OrderId == x.Id && !a.IsDemo && a.Status == "Created")
                        .OrderByDescending(a => a.CreatedAt).Select(a => a.ReferenceCode).FirstOrDefault(),
                    Table = x.VisitSession.Table.Name, x.VisitSessionId,
                    Items = x.Items.Select(i => new { i.Id, i.ProductName, i.VariantName, i.Quantity, i.ReadyQuantity, i.ServedQuantity, i.LineTotal, i.Note }) }).ToListAsync();
            return Results.Ok(new { items = orders, page, pageSize = 30, totalCount });
        }).RequireAuthorization("OrdersView");
        api.MapPost("/orders/{id:guid}/accept", async (Guid id, CafeDbContext db, HttpContext ctx) =>
        {
            var order = await db.Orders.Include(x => x.Items).FirstOrDefaultAsync(x => x.Id == id);
            if (order == null) return Results.NotFound();
            if (order.AcceptanceStatus != "Pending") return Results.Conflict(new { message = "Đơn đã được xử lý" });
            order.AcceptanceStatus = "Accepted"; order.AcceptedAt = DateTime.UtcNow; order.AcceptedByUserId = CafeSecurity.ActorId(ctx.User);
            order.FulfillmentStatus = "Queued";
            foreach (var item in order.Items) db.PreparationTasks.Add(new PreparationTask { OrderItemId = item.Id, StationId = item.StationId });
            Events.AddBoth(db, order.VisitSessionId, "OrderAccepted", new { order.Id, order.OrderNumber });
            try { await db.SaveChangesAsync(); } catch (DbUpdateConcurrencyException) { return Results.Conflict(new { message = "Người khác đã nhận đơn" }); }
            return Results.Ok(new { order.AcceptanceStatus });
        }).RequireAuthorization("AcceptOrders");
        api.MapPost("/orders/{id:guid}/reject", async (Guid id, OrderDecisionDto input, CafeDbContext db) =>
        {
            var order = await db.Orders.FirstOrDefaultAsync(x => x.Id == id);
            if (order == null) return Results.NotFound();
            if (order.AcceptanceStatus != "Pending" || order.PaymentStatus == "Paid") return Results.Conflict(new { message = "Không thể từ chối đơn này; yêu cầu xử lý hoàn tiền nếu đã thu" });
            if (string.IsNullOrWhiteSpace(input.Reason)) return Results.BadRequest(new { message = "Cần lý do từ chối" });
            order.AcceptanceStatus = "Rejected"; order.FulfillmentStatus = "Cancelled"; order.RejectionReason = input.Reason;
            foreach (var a in await db.PaymentAttempts.Where(x => x.OrderId == order.Id && x.Status != "Succeeded").ToListAsync()) a.Status = "Cancelled";
            Events.AddBoth(db, order.VisitSessionId, "OrderRejected", new { order.Id, input.Reason });
            try { await db.SaveChangesAsync(); } catch (DbUpdateConcurrencyException) { return Results.Conflict(new { message = "Đơn đã thay đổi" }); }
            return Results.Ok(new { order.AcceptanceStatus });
        }).RequireAuthorization("AcceptOrders");
        api.MapGet("/kitchen", async (CafeDbContext db, string? station) =>
        {
            var q = db.PreparationTasks.AsNoTracking().Where(t => !t.OrderItem.Order.IsDemo).Where(t => t.Status != "Served");
            if (!string.IsNullOrEmpty(station))
            {
                var stationId = await db.PreparationStations.Where(s => s.Code == station).Select(s => (Guid?)s.Id).FirstOrDefaultAsync();
                if (stationId == null) return Results.Ok(Array.Empty<object>());
                q = q.Where(t => t.StationId == stationId.Value);
            }
            return Results.Ok(await q.OrderBy(t => t.QueuedAt).Take(100).Select(t => new { t.Id, t.Status, t.QueuedAt, t.StartedAt, t.ReadyAt,
                Station = db.PreparationStations.Where(s => s.Id == t.StationId).Select(s => s.Name).FirstOrDefault(),
                t.OrderItemId, t.OrderItem.ProductName, t.OrderItem.VariantName, t.OrderItem.Quantity, t.OrderItem.ReadyQuantity, t.OrderItem.ServedQuantity, t.OrderItem.Note,
                OrderNumber = t.OrderItem.Order.OrderNumber, Table = t.OrderItem.Order.VisitSession.Table.Name }).ToListAsync());
        }).RequireAuthorization("Kitchen");
        api.MapPost("/kitchen/{taskId:guid}/start", async (Guid taskId, CafeDbContext db, HttpContext ctx) =>
        {
            var task = await db.PreparationTasks.Include(t => t.OrderItem).ThenInclude(x => x.Order).FirstOrDefaultAsync(t => t.Id == taskId);
            if (task == null) return Results.NotFound();
            if (task.Status != "Queued") return Results.Conflict(new { message = "Món đã được tiếp nhận" });
            task.Status = "Preparing"; task.StartedAt = DateTime.UtcNow; task.OrderItem.Order.FulfillmentStatus = "Preparing";

            db.PreparationWorkEvents.Add(new PreparationWorkEvent { PreparationTaskId = task.Id,
                ActorId = CafeSecurity.ActorId(ctx.User),
                Action = "Started", Quantity = 0 });

            Events.AddBoth(db, task.OrderItem.Order.VisitSessionId, "PreparationStarted", new { task.Id, task.OrderItemId });
            try { await db.SaveChangesAsync(); } catch (DbUpdateConcurrencyException) { return Results.Conflict(); }
            return Results.Ok(new { task.Status });
        }).RequireAuthorization("Kitchen");
        api.MapPost("/kitchen/{taskId:guid}/ready", async (Guid taskId, QuantityDto input, CafeDbContext db, HttpContext ctx) =>
        {
            var task = await db.PreparationTasks.Include(t => t.OrderItem).ThenInclude(i => i.Order).ThenInclude(o => o.Items).FirstOrDefaultAsync(t => t.Id == taskId);
            if (task == null) return Results.NotFound();
            if (task.Status is not ("Preparing" or "PartiallyReady") || input.Quantity < 1 || !CafeRules.CanReady(task.OrderItem.Quantity, task.OrderItem.ReadyQuantity, input.Quantity))
                return Results.Conflict(new { message = "Số món hoàn thành không hợp lệ" });
            var order = task.OrderItem.Order;
            task.OrderItem.ReadyQuantity += input.Quantity;

            db.PreparationWorkEvents.Add(new PreparationWorkEvent { PreparationTaskId = task.Id,
                ActorId = CafeSecurity.ActorId(ctx.User), Action = "Ready", Quantity = input.Quantity });

            task.Status = task.OrderItem.ReadyQuantity == task.OrderItem.Quantity ? "Ready" : "PartiallyReady";
            if (task.Status == "Ready") task.ReadyAt = DateTime.UtcNow;
            var allReady = order.Items.All(i => i.ReadyQuantity == i.Quantity);
            order.FulfillmentStatus = allReady ? "Ready" : "PartiallyReady";
            Events.AddBoth(db, order.VisitSessionId, allReady ? "OrderReady" : "OrderItemReady", new { order.Id, task.OrderItemId, quantity = input.Quantity, allReady });
            try { await db.SaveChangesAsync(); } catch (DbUpdateConcurrencyException) { return Results.Conflict(new { message = "Món đã được cập nhật từ màn hình khác" }); }
            return Results.Ok(new { task.Status, task.OrderItem.ReadyQuantity, order.FulfillmentStatus });
        }).RequireAuthorization("Kitchen");
        api.MapPost("/items/{itemId:guid}/serve", async (Guid itemId, QuantityDto input, CafeDbContext db) =>
        {
            var item = await db.OrderItems.Include(x => x.Order).ThenInclude(o => o.Items).FirstOrDefaultAsync(x => x.Id == itemId);
            if (item == null) return Results.NotFound();
            if (!CafeRules.CanServe(item.ReadyQuantity, item.ServedQuantity, input.Quantity)) return Results.Conflict(new { message = "Không thể mang ra nhiều hơn số món đã làm" });
            item.ServedQuantity += input.Quantity;
            var allServed = item.Order.Items.All(x => x.ServedQuantity == x.Quantity);
            item.Order.FulfillmentStatus = allServed ? "Served" : "PartiallyServed";
            Events.AddBoth(db, item.Order.VisitSessionId, allServed ? "OrderServed" : "OrderItemServed", new { item.OrderId, item.Id, quantity = input.Quantity });
            try { await db.SaveChangesAsync(); } catch (DbUpdateConcurrencyException) { return Results.Conflict(); }
            return Results.Ok(new { item.ServedQuantity, item.Order.FulfillmentStatus });
        }).RequireAuthorization("Floor");
        api.MapGet("/support", async (CafeDbContext db) => Results.Ok(await db.ServiceRequests.AsNoTracking()
            .Where(x => x.Status == "New" && !x.VisitSession.IsDemo).OrderBy(x => x.CreatedAt).Select(x => new { x.Id, x.Type, x.Note, x.CreatedAt, x.VisitSessionId,
                Table = db.VisitSessions.Where(v => v.Id == x.VisitSessionId).Select(v => v.Table.Name).FirstOrDefault() }).ToListAsync())).RequireAuthorization("Floor");
        api.MapPost("/support/{id:guid}/resolve", async (Guid id, CafeDbContext db) =>
        {
            var request = await db.ServiceRequests.FirstOrDefaultAsync(x => x.Id == id && x.Status == "New");
            if (request == null) return Results.NotFound();
            request.Status = "Resolved"; request.ResolvedAt = DateTime.UtcNow;
            Events.AddBoth(db, request.VisitSessionId, "ServiceRequestResolved", new { request.Id });
            await db.SaveChangesAsync();
            return Results.Ok(new { request.Status });
        }).RequireAuthorization("Floor");
    }
}
