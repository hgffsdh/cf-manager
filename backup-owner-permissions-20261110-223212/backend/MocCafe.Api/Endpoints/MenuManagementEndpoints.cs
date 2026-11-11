using Microsoft.AspNetCore.Http.Features;
using Microsoft.EntityFrameworkCore;
using MocCafe.Api.Data;
using MocCafe.Api.Domain;
using MocCafe.Api.Services;

namespace MocCafe.Api.Endpoints;

public sealed record MenuVariantInput(Guid? Id, string Name, decimal Price, bool IsActive = true);
public sealed record MenuProductInput(string Code, string Name, string Description,
    Guid CategoryId, Guid StationId, bool IsActive, bool IsSoldOut, bool IsFeatured,
    List<MenuVariantInput> Variants);
public sealed record MenuCategoryInput(string Name, int SortOrder);

public static class MenuManagementEndpoints
{
    private const long MaxPhotoBytes = 3L * 1024 * 1024;

    public static void MapMenuManagement(this WebApplication app)
    {
        // Images are served publicly because the guest QR menu must work without employee JWT.
        // Only Owner / Manager can create, change or upload product data.
        app.MapGet("/api/v1/guest/menu/images/{productId:guid}", async (Guid productId, CafeDbContext db, HttpContext ctx) =>
        {
            var published = await db.Products.AsNoTracking().AnyAsync(p => p.Id == productId && p.IsActive);
            if (!published) return Results.NotFound();
            var img = await db.ProductImages.AsNoTracking().FirstOrDefaultAsync(i => i.ProductId == productId);
            if (img is null) return Results.NotFound();
            ctx.Response.Headers["Cache-Control"] = "no-store";
            ctx.Response.Headers["X-Content-Type-Options"] = "nosniff";
            return Results.File(img.Bytes, img.ContentType);
        }).WithTags("Menu images");

        var api = app.MapGroup("/api/v1/staff/menu").RequireAuthorization("ManagerOnly").WithTags("Menu management");

        api.MapGet("/lookups", async (CafeDbContext db) =>
        {
            var categories = await db.Categories.AsNoTracking().OrderBy(c => c.SortOrder)
                .Select(c => new { c.Id, c.Name, c.SortOrder, c.BranchId, c.IsActive }).ToListAsync();
            var stations = await db.PreparationStations.AsNoTracking().Where(s => s.IsActive)
                .OrderBy(s => s.Name).Select(s => new { s.Id, s.Name, s.BranchId }).ToListAsync();
            return Results.Ok(new { categories, stations });
        });

        api.MapGet("/products", async (CafeDbContext db) =>
        {
            var products = await db.Products.AsNoTracking().OrderBy(p => p.Name).Select(p => new
            {
                p.Id, p.Code, p.Name, p.Description, p.ImageUrl, p.CategoryId,
                CategoryName = p.Category.Name, p.StationId, StationName = p.Station.Name,
                p.IsActive, p.IsSoldOut, p.IsFeatured,
                Variants = p.Variants.OrderBy(v => v.Name)
                    .Select(v => new { v.Id, v.Name, v.Price, v.IsActive }).ToList()
            }).ToListAsync();
            return Results.Ok(products);
        });

        api.MapPost("/categories", async (MenuCategoryInput body, CafeDbContext db) =>
        {
            var name = body.Name?.Trim() ?? "";
            if (name.Length is < 2 or > 80) return Results.BadRequest(new { message = "Tên danh mục phải từ 2 đến 80 ký tự." });
            var branch = await db.Branches.AsNoTracking().OrderBy(b => b.Code).FirstOrDefaultAsync(b => b.IsActive);
            if (branch == null) return Results.Conflict(new { message = "Chưa có chi nhánh đang hoạt động." });
            if (await db.Categories.AnyAsync(c => c.BranchId == branch.Id && c.Name == name))
                return Results.Conflict(new { message = "Tên danh mục đã tồn tại." });
            var category = new Category { BranchId = branch.Id, Name = name, SortOrder = body.SortOrder };
            db.Categories.Add(category);
            await db.SaveChangesAsync();
            return Results.Created($"/api/v1/staff/menu/categories/{category.Id}", new { category.Id, category.Name });
        });

        api.MapPost("/products", async (MenuProductInput body, CafeDbContext db, HttpContext ctx) =>
        {
            var validation = Check(body);
            if (validation != null) return Results.BadRequest(new { message = validation });
            if (!await Compatible(db, body.CategoryId, body.StationId))
                return Results.BadRequest(new { message = "Danh mục và quầy pha chế không cùng một chi nhánh đang hoạt động." });
            var code = body.Code.Trim().ToUpperInvariant();
            if (await db.Products.AnyAsync(p => p.Code == code))
                return Results.Conflict(new { message = "Mã món đã được sử dụng." });

            var product = new Product {
                Code = code, Name = body.Name.Trim(), Description = body.Description?.Trim() ?? "",
                CategoryId = body.CategoryId, StationId = body.StationId,
                IsActive = body.IsActive, IsSoldOut = body.IsSoldOut, IsFeatured = body.IsFeatured,
                Variants = body.Variants.Select(v => new ProductVariant {
                    Name = v.Name.Trim(), Price = v.Price, IsActive = v.IsActive
                }).ToList()
            };
            db.Products.Add(product);
            db.AuditLogs.Add(new AuditLog { ActorId = CafeSecurity.ActorId(ctx.User),
                Action = "MenuProductCreated", EntityType = "Product", EntityId = product.Id,
                Details = $"Code={code}; Name={product.Name}" });
            try { await db.SaveChangesAsync(); }
            catch (DbUpdateException) { return Results.Conflict(new { message = "Không thể lưu món. Hãy kiểm tra mã món và dữ liệu liên quan." }); }
            return Results.Created($"/api/v1/staff/menu/products/{product.Id}", new { product.Id, product.Code });
        });

        api.MapPut("/products/{productId:guid}", async (Guid productId, MenuProductInput body, CafeDbContext db, HttpContext ctx) =>
        {
            var validation = Check(body);
            if (validation != null) return Results.BadRequest(new { message = validation });
            if (!await Compatible(db, body.CategoryId, body.StationId))
                return Results.BadRequest(new { message = "Danh mục và quầy pha chế không cùng một chi nhánh đang hoạt động." });
            var product = await db.Products.Include(p => p.Variants).FirstOrDefaultAsync(p => p.Id == productId);
            if (product == null) return Results.NotFound();
            var code = body.Code.Trim().ToUpperInvariant();
            if (await db.Products.AnyAsync(p => p.Id != productId && p.Code == code))
                return Results.Conflict(new { message = "Mã món đã tồn tại." });
            var oldIds = product.Variants.Select(v => v.Id).ToHashSet();
            if (body.Variants.Any(v => v.Id.HasValue && !oldIds.Contains(v.Id.Value)))
                return Results.BadRequest(new { message = "Size không thuộc món đang chỉnh sửa." });
            if (body.Variants.Where(v => v.Id.HasValue).Select(v => v.Id).Distinct().Count() != body.Variants.Count(v => v.Id.HasValue))
                return Results.BadRequest(new { message = "Size bị lặp." });

            product.Code = code; product.Name = body.Name.Trim(); product.Description = body.Description?.Trim() ?? "";
            product.CategoryId = body.CategoryId; product.StationId = body.StationId;
            product.IsActive = body.IsActive; product.IsSoldOut = body.IsSoldOut; product.IsFeatured = body.IsFeatured;
            var keepIds = body.Variants.Where(v => v.Id.HasValue).Select(v => v.Id!.Value).ToHashSet();
            foreach (var existing in product.Variants)
                if (!keepIds.Contains(existing.Id)) existing.IsActive = false; // Preserve FK/history, do not delete sold variants.
            foreach (var input in body.Variants)
            {
                if (input.Id.HasValue)
                {
                    var variant = product.Variants.Single(v => v.Id == input.Id.Value);
                    variant.Name = input.Name.Trim(); variant.Price = input.Price; variant.IsActive = input.IsActive;
                }
                else product.Variants.Add(new ProductVariant { Name = input.Name.Trim(), Price = input.Price, IsActive = input.IsActive });
            }
            db.AuditLogs.Add(new AuditLog { ActorId = CafeSecurity.ActorId(ctx.User),
                Action = "MenuProductUpdated", EntityType = "Product", EntityId = product.Id,
                Details = $"Code={code}; Active={product.IsActive}; SoldOut={product.IsSoldOut}" });
            try { await db.SaveChangesAsync(); }
            catch (DbUpdateException) { return Results.Conflict(new { message = "Không thể cập nhật món. Hãy kiểm tra dữ liệu hoặc thử lại." }); }
            return Results.Ok(new { product.Id, product.Code, product.Name });
        });

        api.MapPost("/products/{productId:guid}/image", async (Guid productId, HttpRequest request, CafeDbContext db, HttpContext ctx) =>
        {
            if (!request.HasFormContentType) return Results.BadRequest(new { message = "Ảnh phải được gửi dưới dạng multipart/form-data." });
            if (request.ContentLength > MaxPhotoBytes + 512 * 1024)
                return Results.BadRequest(new { message = "Ảnh vượt quá 3 MB." });
            var limit = ctx.Features.Get<IHttpMaxRequestBodySizeFeature>();
            if (limit is { IsReadOnly: false }) limit.MaxRequestBodySize = MaxPhotoBytes + 512 * 1024;
            var form = await request.ReadFormAsync();
            var file = form.Files.GetFile("file");
            if (file == null || file.Length == 0 || file.Length > MaxPhotoBytes)
                return Results.BadRequest(new { message = "Vui lòng chọn ảnh không quá 3 MB." });
            var product = await db.Products.FirstOrDefaultAsync(p => p.Id == productId);
            if (product == null) return Results.NotFound();
            await using var ms = new MemoryStream();
            await file.CopyToAsync(ms);
            var bytes = ms.ToArray();
            var contentType = DetectImage(bytes);
            if (contentType == null) return Results.BadRequest(new { message = "Chỉ hỗ trợ ảnh JPEG, PNG và WebP hợp lệ." });

            var image = await db.ProductImages.FirstOrDefaultAsync(i => i.ProductId == productId);
            if (image == null) db.ProductImages.Add(new ProductImage { ProductId = productId,
                Bytes = bytes, ContentType = contentType });
            else { image.Bytes = bytes; image.ContentType = contentType; image.UpdatedAt = DateTime.UtcNow; }
            product.ImageUrl = $"/api/v1/guest/menu/images/{product.Id}";
            db.AuditLogs.Add(new AuditLog { ActorId = CafeSecurity.ActorId(ctx.User),
                Action = "MenuImageUploaded", EntityType = "Product", EntityId = product.Id,
                Details = $"Type={contentType}; Bytes={bytes.Length}" });
            await db.SaveChangesAsync();
            return Results.Ok(new { product.Id, product.ImageUrl });
        });

        api.MapDelete("/products/{productId:guid}/image", async (Guid productId, CafeDbContext db, HttpContext ctx) =>
        {
            var product = await db.Products.FirstOrDefaultAsync(p => p.Id == productId);
            if (product == null) return Results.NotFound();
            var image = await db.ProductImages.FirstOrDefaultAsync(i => i.ProductId == productId);
            if (image != null) db.ProductImages.Remove(image);
            product.ImageUrl = "";
            db.AuditLogs.Add(new AuditLog { ActorId = CafeSecurity.ActorId(ctx.User), Action = "MenuImageDeleted",
                EntityType = "Product", EntityId = product.Id, Details = "Photo removed" });
            await db.SaveChangesAsync();
            return Results.NoContent();
        });
    }

    private static async Task<bool> Compatible(CafeDbContext db, Guid categoryId, Guid stationId)
    {
        var category = await db.Categories.AsNoTracking().Where(c => c.Id == categoryId && c.IsActive)
            .Select(c => new { c.BranchId }).FirstOrDefaultAsync();
        return category != null && await db.PreparationStations.AsNoTracking()
            .AnyAsync(s => s.Id == stationId && s.IsActive && s.BranchId == category.BranchId);
    }

    private static string? Check(MenuProductInput p)
    {
        if (p.Code == null || p.Code.Trim().Length is < 2 or > 30 || !p.Code.Trim().All(c => char.IsLetterOrDigit(c) || c is '-' or '_'))
            return "Mã món phải có 2-30 ký tự chữ/số, dấu - hoặc _.";
        if (p.Name == null || p.Name.Trim().Length is < 2 or > 120) return "Tên món phải từ 2 đến 120 ký tự.";
        if ((p.Description ?? "").Length > 800) return "Mô tả tối đa 800 ký tự.";
        if (p.Variants == null || p.Variants.Count is < 1 or > 12) return "Cần từ 1 đến 12 size/giá.";
        if (!p.Variants.Any(v => v.IsActive)) return "Món cần ít nhất một size đang hoạt động.";
        if (p.Variants.Any(v => v.Name == null || v.Name.Trim().Length is < 1 or > 50 ||
            v.Price is < 1000 or > 10000000 || v.Price != decimal.Truncate(v.Price)))
            return "Tên size không hợp lệ hoặc giá phải là số nguyên VND từ 1.000 đến 10.000.000.";
        if (p.Variants.GroupBy(v => v.Name.Trim(), StringComparer.OrdinalIgnoreCase).Any(g => g.Count() > 1))
            return "Tên size không được trùng trong cùng một món.";
        return null;
    }

    private static string? DetectImage(byte[] data)
    {
        if (data.Length >= 3 && data[0] == 0xFF && data[1] == 0xD8 && data[2] == 0xFF) return "image/jpeg";
        if (data.Length >= 8 && data.AsSpan(0, 8).SequenceEqual(new byte[] {137,80,78,71,13,10,26,10})) return "image/png";
        if (data.Length >= 12 && data.AsSpan(0, 4).SequenceEqual("RIFF"u8) && data.AsSpan(8, 4).SequenceEqual("WEBP"u8)) return "image/webp";
        return null;
    }
}
