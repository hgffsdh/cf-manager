using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using MocCafe.Api.Data;
using MocCafe.Api.Domain;

namespace MocCafe.Api.Services;
public static class SeedData
{
    public static async Task RunAsync(IServiceProvider services, IConfiguration config)
    {
        using var scope = services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<CafeDbContext>();
        var roles = scope.ServiceProvider.GetRequiredService<RoleManager<IdentityRole<Guid>>>();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<CafeUser>>();
        foreach (var role in new[] { "Owner", "Manager", "Cashier", "Barista", "Waiter", "InventoryStaff" })
            if (!await roles.RoleExistsAsync(role)) await roles.CreateAsync(new IdentityRole<Guid>(role));
        var email = config["Seed:AdminEmail"];
        var password = config["Seed:AdminPassword"];
        if (!string.IsNullOrEmpty(email) && !string.IsNullOrEmpty(password) && await users.FindByEmailAsync(email) == null)
        {
            var user = new CafeUser { UserName = email, Email = email, EmailConfirmed = true, FullName = "Quản trị Mộc Café" };
            var result = await users.CreateAsync(user, password);
            if (!result.Succeeded) throw new Exception("Admin seed invalid: " + string.Join("; ", result.Errors.Select(e => e.Description)));
            await users.AddToRoleAsync(user, "Owner");
        }
        if (await db.Branches.AnyAsync()) return;
        var branch = new Branch { Code = "MOC01", Name = "Mộc Café Garden", Address = "Việt Nam" };
        db.Branches.Add(branch);
        var stations = new[] { new PreparationStation { BranchId = branch.Id, Code = "COFFEE", Name = "Quầy cà phê" }, new PreparationStation { BranchId = branch.Id, Code = "TEA", Name = "Quầy trà" }, new PreparationStation { BranchId = branch.Id, Code = "KITCHEN", Name = "Bếp bánh" } };
        db.PreparationStations.AddRange(stations);
        var areas = new[] { new Area { BranchId = branch.Id, Name = "Sân vườn", SortOrder = 0 }, new Area { BranchId = branch.Id, Name = "Hồ cá", SortOrder = 1 }, new Area { BranchId = branch.Id, Name = "Trong nhà", SortOrder = 2 } };
        db.Areas.AddRange(areas);
        for (var i = 0; i < 12; i++)
        {
            var hut = new Hut { AreaId = areas[i / 4].Id, Code = $"C{i + 1:00}", Name = $"Chòi {i + 1:00}", Capacity = i % 3 == 0 ? 6 : 4 };
            db.Huts.Add(hut);
            db.CafeTables.Add(new CafeTable { BranchId = branch.Id, HutId = hut.Id, Code = $"B{i + 1:00}", Name = $"Bàn {i + 1:00}", Capacity = hut.Capacity });
        }
        var cats = new[] { new Category { BranchId = branch.Id, Name = "Cà phê", SortOrder = 0 }, new Category { BranchId = branch.Id, Name = "Trà & trái cây", SortOrder = 1 }, new Category { BranchId = branch.Id, Name = "Bánh & ăn nhẹ", SortOrder = 2 } };
        db.Categories.AddRange(cats);
        var names = new[] { "Cà phê đen đá", "Cà phê sữa đá", "Bạc xỉu", "Cappuccino", "Latte", "Americano", "Espresso", "Mocha", "Cold brew", "Cà phê muối", "Trà đào cam sả", "Trà vải", "Trà tắc mật ong", "Trà sữa trân châu", "Matcha latte", "Nước ép cam", "Sinh tố xoài", "Bánh tiramisu", "Croissant bơ", "Bánh cheesecake" };
        var topping = new ModifierGroup { Name = "Topping", MaxSelections = 3, Options = new() { new ModifierOption { Name = "Trân châu", Price = 5000 }, new ModifierOption { Name = "Kem cheese", Price = 8000 }, new ModifierOption { Name = "Shot espresso", Price = 10000 } } };
        db.ModifierGroups.Add(topping);
        for (var i = 0; i < names.Length; i++)
        {
            int cat = i < 10 ? 0 : i < 17 ? 1 : 2;
            var p = new Product { CategoryId = cats[cat].Id, StationId = stations[cat].Id, Code = $"SP{i + 1:000}", Name = names[i], Description = cat == 0 ? "Đậm đà hương vị cà phê Việt" : cat == 1 ? "Tươi mát, thơm ngon" : "Món ngon dùng kèm đồ uống", IsFeatured = i < 6 };
            p.Variants.Add(new ProductVariant { Name = "M", Price = 25000 + (i % 5) * 5000 });
            if (cat != 2) p.Variants.Add(new ProductVariant { Name = "L", Price = 33000 + (i % 5) * 5000 });
            if (cat != 2) p.ModifierGroups.Add(new ProductModifierGroup { ProductId = p.Id, ModifierGroupId = topping.Id });
            db.Products.Add(p);
        }
        db.Ingredients.AddRange(new[] {
            new Ingredient { BranchId = branch.Id, Code = "COFFEE", Name = "Hạt cà phê", Unit = "g", OnHand = 10000, MinimumStock = 2000 },
            new Ingredient { BranchId = branch.Id, Code = "MILK", Name = "Sữa tươi", Unit = "ml", OnHand = 20000, MinimumStock = 3000 },
            new Ingredient { BranchId = branch.Id, Code = "TEA", Name = "Trà khô", Unit = "g", OnHand = 5000, MinimumStock = 800 },
            new Ingredient { BranchId = branch.Id, Code = "SUGAR", Name = "Đường", Unit = "g", OnHand = 15000, MinimumStock = 1000 }
        });
        await db.SaveChangesAsync();
    }
}
