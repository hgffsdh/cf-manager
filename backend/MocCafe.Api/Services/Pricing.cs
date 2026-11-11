using Microsoft.EntityFrameworkCore;
using MocCafe.Api.Contracts;
using MocCafe.Api.Data;
using MocCafe.Api.Domain;

namespace MocCafe.Api.Services;

public sealed record PricedLine(ProductVariant Variant, Product Product, List<ModifierOption> Options, int Quantity, string Note, decimal UnitTotal);
public static class Pricing
{
    public static async Task<(List<PricedLine> Lines, string? Error)> Calculate(CafeDbContext db, List<CartLineDto> items)
    {
        if (items == null || items.Count is < 1 or > 30 || items.Any(x => x.Quantity is < 1 or > 30)) return (new(), "Số lượng món không hợp lệ");
        var variantIds = items.Select(x => x.VariantId).Distinct().ToList();
        var variants = await db.ProductVariants.Include(v => v.Product).ThenInclude(p => p.Category)
            .Include(v => v.Product).ThenInclude(p => p.ModifierGroups)
            .ThenInclude(pg => pg.ModifierGroup).Where(v => variantIds.Contains(v.Id)).ToDictionaryAsync(v => v.Id);
        var optionIds = items.SelectMany(i => i.ModifierOptionIds ?? new()).Distinct().ToList();
        var options = await db.ModifierOptions.Where(x => optionIds.Contains(x.Id)).ToDictionaryAsync(x => x.Id);
        var lines = new List<PricedLine>();
        foreach (var item in items)
        {
            if (!variants.TryGetValue(item.VariantId, out var v) || !v.IsActive || !v.Product.IsActive || v.Product.IsSoldOut) return (new(), "Món đã hết bán hoặc không tồn tại");
            var ids = item.ModifierOptionIds ?? new List<Guid>();
            if (ids.Count != ids.Distinct().Count()) return (new(), "Không thể chọn topping trùng lặp");
            var allowedGroups = v.Product.ModifierGroups.Select(g => g.ModifierGroup).ToDictionary(g => g.Id);
            var selected = new List<ModifierOption>();
            foreach (var id in ids)
            {
                if (!options.TryGetValue(id, out var opt) || !opt.IsActive || !allowedGroups.ContainsKey(opt.ModifierGroupId)) return (new(), "Topping không hợp lệ");
                selected.Add(opt);
            }
            foreach (var group in allowedGroups.Values)
            {
                int chosen = selected.Count(x => x.ModifierGroupId == group.Id);
                if (chosen < group.MinSelections || chosen > group.MaxSelections) return (new(), "Số topping không hợp lệ");
            }
            lines.Add(new PricedLine(v, v.Product, selected, item.Quantity, (item.Note ?? "").Trim(), v.Price + selected.Sum(x => x.Price)));
        }
        return (lines, null);
    }
}
