using System.Data;
using Microsoft.EntityFrameworkCore;
using MocCafe.Api.Data;
using MocCafe.Api.Domain;
using MocCafe.Api.Services;

namespace MocCafe.Api.Endpoints;

public static class InventoryManagementEndpoints
{
    public sealed record CreateIngredientRequest(string Code, string Name, string Unit, decimal MinimumStock);
    public sealed record ReceiveStockRequest(Guid IngredientId, decimal Quantity, decimal UnitCost, string? SupplierName, string? DocumentNumber, string? Note);
    public sealed record AdjustStockRequest(Guid IngredientId, decimal Delta, string Reason);

    public static void MapInventoryManagement(this WebApplication app)
    {
        var api = app.MapGroup("/api/v1/staff").RequireAuthorization("Inventory").WithTags("Inventory - real costs and ledger");

        api.MapPost("/ingredients", async (CreateIngredientRequest input, CafeDbContext db, HttpContext ctx) =>
        {
            var code = input.Code?.Trim().ToUpperInvariant() ?? "";
            var name = input.Name?.Trim() ?? "";
            var unit = input.Unit?.Trim() ?? "";
            if (code.Length is < 2 or > 25 || name.Length is < 2 or > 120 || unit.Length is < 1 or > 16 || input.MinimumStock < 0)
                return Results.BadRequest(new { message = "Mã, tên, đơn vị hoặc ngưỡng tồn không hợp lệ." });
            var branchId = await db.Branches.AsNoTracking().Where(b => b.IsActive).Select(b => (Guid?)b.Id).FirstOrDefaultAsync();
            if (branchId == null) return Results.BadRequest(new { message = "Chưa có chi nhánh đang hoạt động." });
            if (await db.Ingredients.AnyAsync(x => x.BranchId == branchId && x.Code == code))
                return Results.Conflict(new { message = "Mã nguyên liệu đã tồn tại." });
            var item = new Ingredient { BranchId = branchId.Value, Code = code, Name = name, Unit = unit, MinimumStock = input.MinimumStock, OnHand = 0m };
            db.Ingredients.Add(item);
            db.AuditLogs.Add(new AuditLog { ActorId = CafeSecurity.ActorId(ctx.User), Action = "IngredientCreated", EntityType = "Ingredient", EntityId = item.Id, Details = $"code={code};name={name};unit={unit}" });
            try { await db.SaveChangesAsync(); }
            catch (DbUpdateException) { return Results.Conflict(new { message = "Không thể tạo nguyên liệu (có thể mã đã bị trùng)." }); }
            return Results.Created($"/api/v1/staff/ingredients/{item.Id}", new { item.Id, item.Code, item.Name, item.Unit, item.MinimumStock, item.OnHand });
        });

        api.MapPost("/inventory/receipts", async (ReceiveStockRequest input, CafeDbContext db, HttpContext ctx) =>
        {
            if (input.Quantity <= 0 || input.Quantity > 10000000m || decimal.Round(input.Quantity, 3) != input.Quantity ||
                input.UnitCost < 0 || input.UnitCost > 1000000000m || decimal.Round(input.UnitCost, 4) != input.UnitCost ||
                (input.SupplierName?.Length ?? 0) > 160 || (input.DocumentNumber?.Length ?? 0) > 80 || (input.Note?.Length ?? 0) > 500)
                return Results.BadRequest(new { message = "Số lượng/đơn giá không hợp lệ hoặc thông tin quá dài." });
            var totalCost = decimal.Round(input.Quantity * input.UnitCost, 2, MidpointRounding.AwayFromZero);
            if (totalCost > 9999999999999999.99m) return Results.BadRequest(new { message = "Tổng tiền vượt giới hạn." });
            await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
            var ingredient = await db.Ingredients.FirstOrDefaultAsync(x => x.Id == input.IngredientId);
            if (ingredient == null) return Results.NotFound(new { message = "Không tìm thấy nguyên liệu." });
            ingredient.OnHand += input.Quantity;
            var movement = new InventoryMovement
            {
                IngredientId = ingredient.Id, QuantityDelta = input.Quantity, ActorId = CafeSecurity.ActorId(ctx.User),
                Reason = (input.Note ?? "Nhập hàng").Trim(), MovementType = "Receipt", UnitCost = input.UnitCost,
                TotalCost = totalCost, SupplierName = input.SupplierName?.Trim() ?? "", DocumentNumber = input.DocumentNumber?.Trim() ?? "",
                StockAfter = ingredient.OnHand
            };
            db.InventoryMovements.Add(movement);
            db.AuditLogs.Add(new AuditLog { ActorId = movement.ActorId, Action = "InventoryReceived", EntityType = "InventoryMovement", EntityId = movement.Id, Details = $"ingredient={ingredient.Code};quantity={input.Quantity};unitCost={input.UnitCost};total={totalCost}" });
            try { await db.SaveChangesAsync(); await tx.CommitAsync(); }
            catch (DbUpdateConcurrencyException) { return Results.Conflict(new { message = "Tồn kho vừa thay đổi, hãy tải lại và thử lại." }); }
            return Results.Ok(new { movement.Id, ingredientId = ingredient.Id, ingredient.Name, ingredient.Unit, movement.QuantityDelta, movement.UnitCost, movement.TotalCost, ingredient.OnHand });
        });

        api.MapPost("/inventory/adjust", async (AdjustStockRequest input, CafeDbContext db, HttpContext ctx) =>
        {
            if (input.Delta == 0 || decimal.Round(input.Delta, 3) != input.Delta || input.Delta is < -10000000m or > 10000000m ||
                string.IsNullOrWhiteSpace(input.Reason) || input.Reason.Length > 500)
                return Results.BadRequest(new { message = "Điều chỉnh cần số lượng và lý do hợp lệ." });
            await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
            var item = await db.Ingredients.FirstOrDefaultAsync(x => x.Id == input.IngredientId);
            if (item == null) return Results.NotFound();
            if (item.OnHand + input.Delta < 0) return Results.Conflict(new { message = "Không thể xuất vượt số lượng tồn kho." });
            item.OnHand += input.Delta;
            var movement = new InventoryMovement { IngredientId = item.Id, QuantityDelta = input.Delta,
                Reason = input.Reason.Trim(), ActorId = CafeSecurity.ActorId(ctx.User), MovementType = "Adjustment", StockAfter = item.OnHand };
            db.InventoryMovements.Add(movement);
            db.AuditLogs.Add(new AuditLog { ActorId = movement.ActorId, Action = "InventoryAdjusted", EntityType = "InventoryMovement", EntityId = movement.Id, Details = $"ingredient={item.Code};delta={input.Delta};reason={input.Reason.Trim()}" });
            if (item.OnHand <= item.MinimumStock) Events.Add(db, "InventoryLow", "staff", new { item.Id, item.Name, item.OnHand });
            try { await db.SaveChangesAsync(); await tx.CommitAsync(); }
            catch (DbUpdateConcurrencyException) { return Results.Conflict(new { message = "Kho đã được cập nhật bởi người khác." }); }
            return Results.Ok(new { item.Id, item.OnHand, movementId = movement.Id });
        });

        api.MapGet("/inventory/movements", async (CafeDbContext db, Guid? ingredientId, string? type, DateTime? from, DateTime? to, int page = 1) =>
        {
            page = Math.Clamp(page, 1, 100000);
            if (from.HasValue && to.HasValue && from > to) return Results.BadRequest(new { message = "Ngày bắt đầu phải trước ngày kết thúc." });
            var q = db.InventoryMovements.AsNoTracking().AsQueryable();
            if (ingredientId.HasValue) q = q.Where(x => x.IngredientId == ingredientId.Value);
            if (type is "Receipt" or "Adjustment") q = q.Where(x => x.MovementType == type);
            if (from.HasValue) q = q.Where(x => x.CreatedAt >= from.Value);
            if (to.HasValue) q = q.Where(x => x.CreatedAt < to.Value);
            var totalCount = await q.CountAsync();
            var receiptCost = await q.Where(x => x.MovementType == "Receipt").SumAsync(x => (decimal?)x.TotalCost) ?? 0m;
            var data = await q.OrderByDescending(x => x.CreatedAt).ThenByDescending(x => x.Id).Skip((page - 1) * 30).Take(30)
                .Select(x => new {
                    x.Id, x.CreatedAt, x.IngredientId, ingredientName = x.Ingredient.Name, x.Ingredient.Unit,
                    x.QuantityDelta, x.MovementType, x.UnitCost, x.TotalCost, x.StockAfter,
                    x.SupplierName, x.DocumentNumber, x.Reason, x.ActorId,
                    actorName = db.Users.Where(u => u.Id == x.ActorId).Select(u => u.FullName).FirstOrDefault()
                }).ToListAsync();
            return Results.Ok(new { items = data, page, pageSize = 30, totalCount, receiptCost });
        });
    }
}
