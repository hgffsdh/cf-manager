using System.Data;
using System.Security.Claims;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using MocCafe.Api.Data;
using MocCafe.Api.Domain;
using MocCafe.Api.Services;

namespace MocCafe.Api.Endpoints;

public static class TeamManagementEndpoints
{
    public sealed record CreateEmployeeRequest(string FullName, string Email, string Password, string Role);
    public sealed record UpdateEmployeeRequest(string Role, bool IsActive);
    public sealed record CreateShiftRequest(string Name, DateTimeOffset StartAt, DateTimeOffset EndAt, string? Note);
    public sealed record AssignShiftRequest(Guid UserId, string Duty, Guid? StationId);
    private static readonly string[] EmployeeRoles = ["Manager", "Cashier", "Barista", "Waiter", "InventoryStaff"];

    public static void MapTeamManagement(this WebApplication app)
    {
        var api = app.MapGroup("/api/v1/staff/team").RequireAuthorization("OwnerOnly").WithTags("Team management");

        api.MapGet("/employees", async (CafeDbContext db) =>
        {
            var roleRows = await (from ur in db.UserRoles.AsNoTracking()
                join role in db.Roles.AsNoTracking() on ur.RoleId equals role.Id
                select new { ur.UserId, role.Name }).ToListAsync();
            var employees = await db.Users.AsNoTracking().OrderBy(x => x.FullName)
                .Select(x => new { x.Id, x.FullName, x.Email, x.IsActive }).ToListAsync();
            return Results.Ok(employees.Select(e => new { e.Id, e.FullName, e.Email, e.IsActive,
                roles = roleRows.Where(r => r.UserId == e.Id).Select(r => r.Name).ToArray() }));
        });

        api.MapPost("/employees", async (CreateEmployeeRequest input, UserManager<CafeUser> users, RoleManager<IdentityRole<Guid>> roles, CafeDbContext db, HttpContext ctx) =>
        {
            var name = input.FullName?.Trim() ?? "";
            var email = input.Email?.Trim() ?? "";
            var role = input.Role?.Trim() ?? "";
            if (name.Length is < 2 or > 120 || email.Length is < 5 or > 160 || !email.Contains('@') ||
                !EmployeeRoles.Contains(role) || (role == "Manager" && !ctx.User.IsInRole("Owner")))
                return Results.BadRequest(new { message = "Thông tin nhân viên hoặc quyền không hợp lệ." });
            if (!await roles.RoleExistsAsync(role)) return Results.BadRequest(new { message = "Chưa khởi tạo vai trò " + role + "." });
            if (await users.FindByEmailAsync(email) != null) return Results.Conflict(new { message = "Email đã được sử dụng." });
            var employee = new CafeUser { FullName = name, Email = email, UserName = email, EmailConfirmed = true, IsActive = true };
            var result = await users.CreateAsync(employee, input.Password ?? "");
            if (!result.Succeeded) return Results.BadRequest(new { message = string.Join("; ", result.Errors.Select(e => e.Description)) });
            var roleResult = await users.AddToRoleAsync(employee, role);
            if (!roleResult.Succeeded)
            {
                await users.DeleteAsync(employee);
                return Results.BadRequest(new { message = "Không gán được quyền: " + string.Join("; ", roleResult.Errors.Select(e => e.Description)) });
            }
            db.AuditLogs.Add(new AuditLog { ActorId = CafeSecurity.ActorId(ctx.User), Action = "EmployeeCreated", EntityType = "CafeUser", EntityId = employee.Id, Details = $"role={role};email={email}" });
            await db.SaveChangesAsync();
            return Results.Created($"/api/v1/staff/team/employees/{employee.Id}", new { employee.Id, employee.FullName, employee.Email, employee.IsActive, roles = new[] { role } });
        });

        api.MapPut("/employees/{id:guid}", async (Guid id, UpdateEmployeeRequest input, UserManager<CafeUser> users, HttpContext ctx) =>
        {
            var target = await users.FindByIdAsync(id.ToString());
            if (target == null) return Results.NotFound();
            var existing = await users.GetRolesAsync(target);
            if (existing.Contains("Owner")) return Results.Forbid(); // Owner can never be changed here.
            if (existing.Contains("Manager") && !ctx.User.IsInRole("Owner")) return Results.Forbid();
            if (!EmployeeRoles.Contains(input.Role) || (input.Role == "Manager" && !ctx.User.IsInRole("Owner")))
                return Results.BadRequest(new { message = "Bạn không có quyền gán vai trò này." });
            if (id == CafeSecurity.ActorId(ctx.User) && !input.IsActive)
                return Results.BadRequest(new { message = "Bạn không thể tự khóa tài khoản đang sử dụng." });
            if (!existing.SequenceEqual(new[] { input.Role }))
            {
                var remove = await users.RemoveFromRolesAsync(target, existing);
                if (!remove.Succeeded) return Results.BadRequest(new { message = "Không thể xóa quyền cũ." });
                var add = await users.AddToRoleAsync(target, input.Role);
                if (!add.Succeeded) return Results.BadRequest(new { message = "Không thể gán quyền mới; hãy kiểm tra và thử lại." });
            }
            target.IsActive = input.IsActive;
            var update = await users.UpdateAsync(target);
            if (!update.Succeeded) return Results.BadRequest(new { message = string.Join("; ", update.Errors.Select(e => e.Description)) });
            return Results.Ok(new { target.Id, target.IsActive, role = input.Role });
        });

        api.MapGet("/stations", async (CafeDbContext db) => Results.Ok(await db.PreparationStations.AsNoTracking()
            .Where(x => x.IsActive).OrderBy(x => x.Name)
            .Select(x => new { x.Id, x.Name }).ToListAsync()));

        api.MapGet("/shifts", async (CafeDbContext db, DateTimeOffset? from, DateTimeOffset? to) =>
        {
            var begin = from?.UtcDateTime ?? DateTime.UtcNow.AddDays(-7);
            var end = to?.UtcDateTime ?? DateTime.UtcNow.AddDays(30);
            if (begin >= end || end - begin > TimeSpan.FromDays(400)) return Results.BadRequest(new { message = "Khoảng ngày không hợp lệ." });
            var shifts = await db.StaffShifts.AsNoTracking().Where(x => x.StartAt < end && x.EndAt > begin)
                .OrderBy(x => x.StartAt).Take(500)
                .Select(x => new { x.Id, x.Name, x.StartAt, x.EndAt, x.Note,
                    Assignments = x.Assignments.Select(a => new { a.Id, a.UserId, a.Duty, a.StationId }) }).ToListAsync();
            var users = await db.Users.AsNoTracking().Select(x => new { x.Id, x.FullName }).ToListAsync();
            var names = users.ToDictionary(x => x.Id, x => x.FullName);
            return Results.Ok(shifts.Select(s => new { s.Id, s.Name, s.StartAt, s.EndAt, s.Note,
                assignments = s.Assignments.Select(a => new { a.Id, a.UserId, a.Duty, a.StationId,
                    employeeName = names.GetValueOrDefault(a.UserId, "Tài khoản không còn tồn tại") }).ToArray() }));
        });

        api.MapPost("/shifts", async (CreateShiftRequest input, CafeDbContext db, HttpContext ctx) =>
        {
            var name = input.Name?.Trim() ?? "";
            var start = input.StartAt.UtcDateTime;
            var end = input.EndAt.UtcDateTime;
            if (name.Length is < 2 or > 80 || end <= start || end - start > TimeSpan.FromHours(16) ||
                start < DateTime.UtcNow.AddDays(-366) || start > DateTime.UtcNow.AddDays(800) || (input.Note?.Length ?? 0) > 500)
                return Results.BadRequest(new { message = "Tên hoặc thời gian ca không hợp lệ (tối đa 16 giờ)." });
            var branchId = await db.Branches.AsNoTracking().Where(x => x.IsActive).Select(x => (Guid?)x.Id).FirstOrDefaultAsync();
            if (branchId == null) return Results.BadRequest(new { message = "Chưa có chi nhánh." });
            var shift = new StaffShift { Name = name, StartAt = start, EndAt = end, BranchId = branchId.Value,
                Note = input.Note?.Trim() ?? "", CreatedByUserId = CafeSecurity.ActorId(ctx.User) };
            db.StaffShifts.Add(shift);
            db.AuditLogs.Add(new AuditLog { ActorId = shift.CreatedByUserId, Action = "ShiftCreated", EntityType = "StaffShift", EntityId = shift.Id, Details = $"name={name};start={start:o};end={end:o}" });
            await db.SaveChangesAsync();
            return Results.Created($"/api/v1/staff/team/shifts/{shift.Id}", new { shift.Id });
        });

        api.MapPost("/shifts/{id:guid}/assign", async (Guid id, AssignShiftRequest input, CafeDbContext db, HttpContext ctx) =>
        {
            var duty = input.Duty?.Trim() ?? "";
            if (duty.Length is < 2 or > 100) return Results.BadRequest(new { message = "Nhập công việc trong ca (2–100 ký tự)." });
            await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
            var shift = await db.StaffShifts.FirstOrDefaultAsync(x => x.Id == id);
            if (shift == null) return Results.NotFound();
            if (!await db.Users.AnyAsync(x => x.Id == input.UserId && x.IsActive))
                return Results.BadRequest(new { message = "Nhân viên không tồn tại hoặc đã ngừng hoạt động." });
            if (input.StationId.HasValue && !await db.PreparationStations.AnyAsync(x => x.Id == input.StationId && x.BranchId == shift.BranchId && x.IsActive))
                return Results.BadRequest(new { message = "Quầy làm việc không hợp lệ." });
            if (await db.StaffShiftAssignments.AnyAsync(a => a.UserId == input.UserId && a.ShiftId == id))
                return Results.Conflict(new { message = "Nhân viên đã được xếp vào ca này." });
            if (await db.StaffShiftAssignments.AnyAsync(a => a.UserId == input.UserId && a.Shift.StartAt < shift.EndAt && shift.StartAt < a.Shift.EndAt))
                return Results.Conflict(new { message = "Nhân viên đã có ca trùng giờ." });
            var assignment = new StaffShiftAssignment { ShiftId = id, UserId = input.UserId, Duty = duty,
                StationId = input.StationId, AssignedByUserId = CafeSecurity.ActorId(ctx.User) };
            db.StaffShiftAssignments.Add(assignment);
            db.AuditLogs.Add(new AuditLog { ActorId = assignment.AssignedByUserId, Action = "ShiftAssigned", EntityType = "StaffShiftAssignment", EntityId = assignment.Id, Details = $"shift={id};employee={assignment.UserId};duty={duty}" });
            try { await db.SaveChangesAsync(); await tx.CommitAsync(); }
            catch (DbUpdateException) { return Results.Conflict(new { message = "Phân ca trùng, vui lòng tải lại." }); }
            return Results.Created($"/api/v1/staff/team/shifts/{id}", new { assignment.Id });
        });

        api.MapDelete("/shifts/{id:guid}/assign/{assignmentId:guid}", async (Guid id, Guid assignmentId, CafeDbContext db, HttpContext ctx) =>
        {
            var assignment = await db.StaffShiftAssignments.FirstOrDefaultAsync(x => x.Id == assignmentId && x.ShiftId == id);
            if (assignment == null) return Results.NotFound();
            db.AuditLogs.Add(new AuditLog { ActorId = CafeSecurity.ActorId(ctx.User), Action = "ShiftAssignmentRemoved",
                EntityType = "StaffShiftAssignment", EntityId = assignment.Id, Details = $"shift={id};employee={assignment.UserId};duty={assignment.Duty}" });
            db.StaffShiftAssignments.Remove(assignment);
            await db.SaveChangesAsync();
            return Results.NoContent();
        });

        api.MapGet("/work-log", async (CafeDbContext db, int days = 7, int page = 1) =>
        {
            days = Math.Clamp(days, 1, 90);
            page = Math.Clamp(page, 1, 10000);
            var start = DateTime.UtcNow.AddDays(-days);
            var q = db.PreparationWorkEvents.AsNoTracking()
                .Where(x => x.CreatedAt >= start && !x.PreparationTask.OrderItem.Order.IsDemo);
            var totalCount = await q.CountAsync();
            var events = await q.OrderByDescending(x => x.CreatedAt).Skip((page - 1) * 50).Take(50)
                .Select(x => new {
                    x.Id, x.Action, x.Quantity, x.CreatedAt, x.ActorId,
                    x.PreparationTaskId, productName = x.PreparationTask.OrderItem.ProductName,
                    orderNumber = x.PreparationTask.OrderItem.Order.OrderNumber,
                    tableName = x.PreparationTask.OrderItem.Order.VisitSession.Table.Name
                }).ToListAsync();
            var actors = events.Select(e => e.ActorId).Distinct().ToArray();
            var staff = await db.Users.AsNoTracking().Where(x => actors.Contains(x.Id))
                .Select(x => new { x.Id, x.FullName }).ToDictionaryAsync(x => x.Id, x => x.FullName);
            var first = events.Count > 0 ? events.Min(x => x.CreatedAt) : DateTime.UtcNow;
            var last = events.Count > 0 ? events.Max(x => x.CreatedAt) : DateTime.UtcNow;
            var assignments = await db.StaffShiftAssignments.AsNoTracking()
                .Where(a => actors.Contains(a.UserId) && a.Shift.StartAt <= last && a.Shift.EndAt >= first)
                .Select(a => new { a.UserId, a.Shift.Name, a.Shift.StartAt, a.Shift.EndAt }).ToListAsync();
            return Results.Ok(new { page, totalCount, items = events.Select(x => new { x.Id, x.Action, x.Quantity, x.CreatedAt,
                x.PreparationTaskId, x.productName, x.orderNumber, x.tableName, x.ActorId,
                actorName = staff.GetValueOrDefault(x.ActorId, "Không rõ"),
                shiftName = assignments.Where(a => a.UserId == x.ActorId && a.StartAt <= x.CreatedAt && a.EndAt >= x.CreatedAt)
                    .Select(a => a.Name).FirstOrDefault() ?? "Ngoài lịch" }) });
        });
    }
}
