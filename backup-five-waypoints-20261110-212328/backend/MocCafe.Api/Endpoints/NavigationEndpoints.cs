using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using MocCafe.Api.Data;
using MocCafe.Api.Domain;

namespace MocCafe.Api.Endpoints;

public sealed record NavigationNodeDto(string Id, double X, double Y, bool IsEntrance);
public sealed record NavigationEdgeDto(string From, string To);
public sealed record NavigationAccessDto(Guid TableId, string NodeId);
public sealed record NavigationLayoutDto(
    List<NavigationNodeDto> Nodes,
    List<NavigationEdgeDto> Edges,
    List<NavigationAccessDto> Accesses);

public static class NavigationEndpoints
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private static readonly NavigationLayoutDto Empty = new([], [], []);

    public static void MapNavigation(this WebApplication app)
    {
        // Public: location info only. Does NOT return QR tokens, guest sessions,
        // occupancy details, historical orders, phone numbers, etc.
        var guests = app.MapGroup("/api/v1/guest").WithTags("Guest Navigation").RequireRateLimiting("guest");
        guests.MapGet("/hut-map", async (CafeDbContext db) =>
        {
            var branch = await db.Branches.AsNoTracking()
                .Where(b => b.IsActive).OrderBy(b => b.Code)
                .Select(b => new { b.Id, b.Name }).FirstOrDefaultAsync();
            if (branch is null) return Results.NotFound(new { message = "Quán chưa có chi nhánh hoạt động" });
            var tables = await db.CafeTables.AsNoTracking()
                .Where(t => t.BranchId == branch.Id && t.OperationalStatus == "Active")
                .OrderBy(t => t.Code)
                .Select(t => new {
                    t.Id, t.Code, t.Name, t.Capacity, t.MapX, t.MapY,
                    Area = t.Hut != null ? t.Hut.Area.Name : "Khu chung"
                }).ToListAsync();
            var json = await db.Set<CafeNavigationLayout>().AsNoTracking()
                .Where(x => x.BranchId == branch.Id).Select(x => x.LayoutJson).FirstOrDefaultAsync();
            var layout = json is null ? Empty : JsonSerializer.Deserialize<NavigationLayoutDto>(json, JsonOptions) ?? Empty;
            return Results.Ok(new { branchName = branch.Name, tables, layout });
        });

        var managers = app.MapGroup("/api/v1/staff").WithTags("Navigation Management").RequireAuthorization("ManagerOnly");
        managers.MapPut("/navigation", async (NavigationLayoutDto input, CafeDbContext db) =>
        {
            var branchId = await db.Branches.AsNoTracking()
                .Where(b => b.IsActive).OrderBy(b => b.Code)
                .Select(b => (Guid?)b.Id).FirstOrDefaultAsync();
            if (branchId is null) return Results.NotFound(new { message = "Không có chi nhánh hoạt động" });
            if (input.Nodes is null || input.Edges is null || input.Accesses is null)
                return Results.BadRequest(new { message = "Thiếu dữ liệu lối đi" });
            if (input.Nodes.Count > 120 || input.Edges.Count > 240 || input.Accesses.Count > 150)
                return Results.BadRequest(new { message = "Sơ đồ có quá nhiều điểm hoặc đoạn đường" });
            if (input.Nodes.Count > 0 && input.Nodes.Count(n => n.IsEntrance) != 1)
                return Results.BadRequest(new { message = "Cần đặt đúng một điểm làm cổng vào" });
            if (input.Nodes.Count == 0 && (input.Edges.Count > 0 || input.Accesses.Count > 0))
                return Results.BadRequest(new { message = "Chưa có điểm đi bộ để tạo đường hoặc gán chòi" });
            if (input.Nodes.Any(n => string.IsNullOrWhiteSpace(n.Id) ||
                    !Regex.IsMatch(n.Id, "^[a-zA-Z0-9_-]{1,40}$") ||
                    !double.IsFinite(n.X) || !double.IsFinite(n.Y) ||
                    n.X < 0 || n.X > 100 || n.Y < 0 || n.Y > 100))
                return Results.BadRequest(new { message = "ID hoặc tọa độ điểm không hợp lệ" });
            var nodes = input.Nodes.Select(n => n.Id).ToHashSet(StringComparer.Ordinal);
            if (nodes.Count != input.Nodes.Count)
                return Results.BadRequest(new { message = "Có ID điểm đi bộ bị trùng" });
            if (input.Edges.Any(e => !nodes.Contains(e.From) || !nodes.Contains(e.To) || e.From == e.To))
                return Results.BadRequest(new { message = "Đoạn nối tham chiếu điểm không tồn tại hoặc tự nối chính nó" });
            var edges = new HashSet<string>(StringComparer.Ordinal);
            foreach (var e in input.Edges)
            {
                var key = string.CompareOrdinal(e.From, e.To) < 0 ? $"{e.From}|{e.To}" : $"{e.To}|{e.From}";
                if (!edges.Add(key)) return Results.BadRequest(new { message = "Đoạn đường bị trùng" });
            }
            if (input.Accesses.Any(a => !nodes.Contains(a.NodeId)) ||
                input.Accesses.Select(a => a.TableId).Distinct().Count() != input.Accesses.Count)
                return Results.BadRequest(new { message = "Chòi đang gán tới điểm không tồn tại hoặc bị gán trùng" });
            var tableIds = await db.CafeTables.AsNoTracking()
                .Where(t => t.BranchId == branchId.Value && t.OperationalStatus == "Active")
                .Select(t => t.Id).ToListAsync();
            var validTables = tableIds.ToHashSet();
            if (input.Accesses.Any(a => !validTables.Contains(a.TableId)))
                return Results.BadRequest(new { message = "Không thể gán lối vào cho chòi thuộc chi nhánh khác hoặc đã ngừng hoạt động" });

            var json = JsonSerializer.Serialize(input, JsonOptions);
            if (json.Length > 30000) return Results.BadRequest(new { message = "Sơ đồ vượt giới hạn lưu trữ" });
            var entity = await db.Set<CafeNavigationLayout>().SingleOrDefaultAsync(x => x.BranchId == branchId.Value);
            if (entity is null)
            {
                entity = new CafeNavigationLayout { BranchId = branchId.Value };
                db.Add(entity);
            }
            entity.LayoutJson = json;
            entity.UpdatedAt = DateTime.UtcNow;
            await db.SaveChangesAsync();
            return Results.Ok(new { message = "Đã lưu lối đi của quán", entity.UpdatedAt });
        });
    }
}
