namespace MocCafe.Api.Domain;

// One walkable floor-plan graph per branch. No QR/access tokens are stored here.
public sealed class CafeNavigationLayout
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid BranchId { get; set; }
    public string LayoutJson { get; set; } = "{\"nodes\":[],\"edges\":[],\"accesses\":[]}";
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
