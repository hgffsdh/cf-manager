using System.Data;
using Microsoft.EntityFrameworkCore;
using MocCafe.Api.Contracts;
using MocCafe.Api.Data;
using MocCafe.Api.Domain;
using MocCafe.Api.Services;

namespace MocCafe.Api.Endpoints;
public static class PaymentEndpoints
{
    public static void MapPayments(this WebApplication app)
    {
        var staff = app.MapGroup("/api/v1/staff/payments").WithTags("Payments").RequireAuthorization("Cashier");
        staff.MapPost("/{orderId:guid}/cash", async (Guid orderId, CashPaymentDto input, CafeDbContext db, HttpContext ctx) =>
        {
            await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
            var order = await db.Orders.FirstOrDefaultAsync(x => x.Id == orderId);
            if (order == null) return Results.NotFound();
            if (order.AcceptanceStatus == "Rejected" || order.PaymentStatus == "Paid" || order.PaymentMethod != "Cash") return Results.Conflict(new { message = "Đơn không cần hoặc không thể thu tiền mặt" });
            if (input.TenderedAmount < order.TotalAmount) return Results.BadRequest(new { message = "Tiền khách đưa chưa đủ" });
            var payment = new Payment { BranchId = order.BranchId, Method = "Cash", ReferenceCode = "CASH-" + Guid.NewGuid().ToString("N"), Amount = order.TotalAmount,
                TenderedAmount = input.TenderedAmount, ChangeAmount = CafeRules.ChangeDue(order.TotalAmount, input.TenderedAmount), IsDemo = order.IsDemo,
                CollectedByUserId = CafeSecurity.ActorId(ctx.User), Allocations = new List<PaymentAllocation> { new() { OrderId = order.Id, Amount = order.TotalAmount } } };
            db.Payments.Add(payment);
            order.PaymentStatus = "Paid";
            db.AuditLogs.Add(new AuditLog { ActorId = CafeSecurity.ActorId(ctx.User), Action = "CashCollected", EntityType = "Order", EntityId = order.Id, Details = $"Payment={payment.Id};amount={payment.Amount}" });
            Events.AddBoth(db, order.VisitSessionId, "PaymentStatusChanged", new { order.Id, order.PaymentStatus, payment.ChangeAmount });
            try { await db.SaveChangesAsync(); await tx.CommitAsync(); }
            catch (DbUpdateConcurrencyException) { return Results.Conflict(new { message = "Đơn đã thay đổi. Tải lại trước khi thu." }); }
            return Results.Ok(new { payment.Id, payment.Amount, payment.ChangeAmount });
        });
        staff.MapPost("/{orderId:guid}/bank-confirm", async (Guid orderId, ConfirmBankTransferDto input, CafeDbContext db, HttpContext ctx) =>
        {
            // Cashier must independently verify credited amount, beneficiary and reference in bank statement.
            if (string.IsNullOrWhiteSpace(input.BankTransactionId) || input.BankTransactionId.Trim().Length is < 6 or > 100)
                return Results.BadRequest(new { message = "Nhập mã giao dịch thật trên sao kê (6–100 ký tự)." });
            await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
            var order = await db.Orders.FirstOrDefaultAsync(o => o.Id == orderId && !o.IsDemo);
            if (order == null) return Results.NotFound();
            if (order.PaymentMethod != "BankTransfer" || order.AcceptanceStatus == "Rejected" || order.PaymentStatus == "Paid")
                return Results.Conflict(new { message = "Đơn không thể xác nhận chuyển khoản lần nữa." });
            var attempt = await db.PaymentAttempts.Where(a => a.OrderId == order.Id && !a.IsDemo && a.Status == "Created")
                .OrderByDescending(a => a.CreatedAt).FirstOrDefaultAsync();
            if (attempt == null || !string.Equals(input.ConfirmedReferenceCode?.Trim(), attempt.ReferenceCode, StringComparison.Ordinal))
                return Results.Conflict(new { message = "Nội dung chuyển khoản không khớp mã tham chiếu của đơn." });
            if (attempt.RequestedAmount != order.TotalAmount)
                return Results.Conflict(new { message = "Số tiền đơn đã thay đổi; không thể xác nhận." });
            var transactionId = input.BankTransactionId.Trim().ToUpperInvariant();
            var paymentReference = "BANK-" + CafeSecurity.Hash(transactionId)[..40];
            if (await db.Payments.AnyAsync(p => p.ReferenceCode == paymentReference))
                return Results.Conflict(new { message = "Mã giao dịch ngân hàng đã được sử dụng, không ghi nhận trùng." });
            var payment = new Payment { BranchId = order.BranchId, PaymentAttemptId = attempt.Id,
                Method = "BankTransfer", ReferenceCode = paymentReference, Amount = order.TotalAmount,
                IsDemo = false, CollectedByUserId = CafeSecurity.ActorId(ctx.User),
                Allocations = new List<PaymentAllocation> { new() { OrderId = order.Id, Amount = order.TotalAmount } } };
            db.Payments.Add(payment);
            attempt.Status = "Succeeded"; attempt.CompletedAt = DateTime.UtcNow;
            order.PaymentStatus = "Paid";
            db.AuditLogs.Add(new AuditLog { ActorId = CafeSecurity.ActorId(ctx.User), Action = "BankTransferVerifiedManually",
                EntityType = "Order", EntityId = order.Id, Details = $"Payment={payment.Id};reference={attempt.ReferenceCode};amount={payment.Amount}" });
            Events.AddBoth(db, order.VisitSessionId, "PaymentStatusChanged", new { order.Id, order.PaymentStatus, method = "BankTransfer" });
            try { await db.SaveChangesAsync(); await tx.CommitAsync(); }
            catch (DbUpdateConcurrencyException) { return Results.Conflict(new { message = "Thanh toán đã thay đổi, hãy tải lại." }); }
            catch (DbUpdateException) { return Results.Conflict(new { message = "Có giao dịch bị trùng. Không ghi nhận tiền hai lần." }); }
            return Results.Ok(new { payment.Id, payment.Amount, order.PaymentStatus, verifiedBy = "Cashier" });
        });

        // Historical simulation endpoints are off by default in real operating mode.
        if (!app.Configuration.GetValue<bool>("CafeMode:AllowDemoPayments")) return;
        var demo = app.MapGroup("/api/v1/demo-pay").WithTags("Demo payment").RequireRateLimiting("guest");
        demo.MapGet("/{token}", async (string token, CafeDbContext db) =>
        {
            if (token.Length > 256) return Results.NotFound();
            var hash = CafeSecurity.Hash(token);
            var a = await db.PaymentAttempts.AsNoTracking().Include(x => x.Order).FirstOrDefaultAsync(x => x.DemoTokenHash == hash && x.IsDemo);
            if (a == null) return Results.NotFound();
            return Results.Ok(new { a.ReferenceCode, a.RequestedAmount, a.Status, a.ExpiresAt, a.Order.OrderNumber });
        });
        demo.MapPost("/{token}", async (string token, DemoPaymentDto input, CafeDbContext db) =>
        {
            if (token.Length > 256) return Results.NotFound();
            await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
            var hash = CafeSecurity.Hash(token);
            var a = await db.PaymentAttempts.Include(x => x.Order).FirstOrDefaultAsync(x => x.DemoTokenHash == hash && x.IsDemo);
            if (a == null) return Results.NotFound();
            if (a.Status == "Cancelled" || a.Status == "Expired") return Results.Conflict(new { message = "Mã thanh toán này đã bị thu hồi hoặc hết hạn" });
            if (a.Status == "Succeeded") return Results.Ok(new { status = a.Status, message = "Giao dịch demo đã thành công trước đó" });
            if (a.ExpiresAt <= DateTime.UtcNow) { a.Status = "Expired"; await db.SaveChangesAsync(); await tx.CommitAsync(); return Results.Conflict(new { message = "QR demo đã hết hạn" }); }
            if (a.Order.AcceptanceStatus == "Rejected") return Results.Conflict(new { message = "Đơn bị từ chối" });
            if (a.Order.PaymentStatus == "Paid") return Results.Conflict(new { message = "Đơn đã được thanh toán" });
            if (!input.Succeed)
            {
                a.Status = "Failed";
                await db.SaveChangesAsync(); await tx.CommitAsync();
                return Results.Ok(new { status = "Failed", message = "Đây là thanh toán thất bại được mô phỏng" });
            }
            a.Status = "Succeeded"; a.CompletedAt = DateTime.UtcNow;
            a.Order.PaymentStatus = "Paid";
            db.Payments.Add(new Payment { BranchId = a.Order.BranchId, PaymentAttemptId = a.Id, Method = "BankDemo", ReferenceCode = "DEMO-PAID-" + Guid.NewGuid().ToString("N"),
                Amount = a.Order.TotalAmount, IsDemo = true, Allocations = new List<PaymentAllocation> { new() { OrderId = a.OrderId, Amount = a.Order.TotalAmount } } });
            Events.AddBoth(db, a.Order.VisitSessionId, "PaymentStatusChanged", new { a.OrderId, a.Order.PaymentStatus, isDemo = true });
            try { await db.SaveChangesAsync(); await tx.CommitAsync(); }
            catch (DbUpdateConcurrencyException) { return Results.Conflict(new { message = "Trạng thái thanh toán đã thay đổi" }); }
            return Results.Ok(new { status = a.Status, message = "Đã mô phỏng thanh toán thành công (KHÔNG chuyển tiền thật)" });
        });
    }
}
