using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using MocCafe.Api.Domain;

namespace MocCafe.Api.Data;

public class CafeDbContext(DbContextOptions<CafeDbContext> options)
    : IdentityDbContext<CafeUser, IdentityRole<Guid>, Guid>(options)
{
    public DbSet<Branch> Branches => Set<Branch>();
    public DbSet<Area> Areas => Set<Area>();
    public DbSet<Hut> Huts => Set<Hut>();
    public DbSet<CafeTable> CafeTables => Set<CafeTable>();
    public DbSet<TableQrToken> TableQrTokens => Set<TableQrToken>();
    public DbSet<VisitSession> VisitSessions => Set<VisitSession>();
    public DbSet<GuestSession> GuestSessions => Set<GuestSession>();
    public DbSet<Category> Categories => Set<Category>();
    public DbSet<Product> Products => Set<Product>();
    public DbSet<ProductImage> ProductImages => Set<ProductImage>();
    public DbSet<ProductVariant> ProductVariants => Set<ProductVariant>();
    public DbSet<ModifierGroup> ModifierGroups => Set<ModifierGroup>();
    public DbSet<ModifierOption> ModifierOptions => Set<ModifierOption>();
    public DbSet<ProductModifierGroup> ProductModifierGroups => Set<ProductModifierGroup>();
    public DbSet<PreparationStation> PreparationStations => Set<PreparationStation>();
    public DbSet<CafeOrder> Orders => Set<CafeOrder>();
    public DbSet<OrderItem> OrderItems => Set<OrderItem>();
    public DbSet<OrderItemModifier> OrderItemModifiers => Set<OrderItemModifier>();
    public DbSet<PreparationTask> PreparationTasks => Set<PreparationTask>();
    public DbSet<PaymentAttempt> PaymentAttempts => Set<PaymentAttempt>();
    public DbSet<Payment> Payments => Set<Payment>();
    public DbSet<PaymentAllocation> PaymentAllocations => Set<PaymentAllocation>();
    public DbSet<ServiceRequest> ServiceRequests => Set<ServiceRequest>();
    public DbSet<Ingredient> Ingredients => Set<Ingredient>();
    public DbSet<InventoryMovement> InventoryMovements => Set<InventoryMovement>();
    public DbSet<Reservation> Reservations => Set<Reservation>();
    public DbSet<OutboxMessage> OutboxMessages => Set<OutboxMessage>();
    public DbSet<AuditLog> AuditLogs => Set<AuditLog>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        base.OnModelCreating(b);
        b.Entity<Branch>().HasIndex(x => x.Code).IsUnique();
        b.Entity<CafeTable>().HasIndex(x => new { x.BranchId, x.Code }).IsUnique();
        b.Entity<TableQrToken>().HasIndex(x => x.TokenHash).IsUnique();
        b.Entity<TableQrToken>().HasIndex(x => new { x.TableId, x.RevokedAt });
        b.Entity<GuestSession>().HasIndex(x => x.AccessTokenHash).IsUnique();
        b.Entity<Product>().HasIndex(x => x.Code).IsUnique();
        b.Entity<ProductImage>().HasKey(x => x.ProductId);
        b.Entity<ProductImage>().Property(x => x.Bytes).HasColumnType("varbinary(max)");
        b.Entity<ProductImage>().HasOne(x => x.Product).WithOne()
            .HasForeignKey<ProductImage>(x => x.ProductId).OnDelete(DeleteBehavior.Restrict);
        b.Entity<ProductModifierGroup>().HasKey(x => new { x.ProductId, x.ModifierGroupId });
        b.Entity<ProductModifierGroup>().HasOne<Product>().WithMany(p => p.ModifierGroups).HasForeignKey(x => x.ProductId).OnDelete(DeleteBehavior.NoAction);
        b.Entity<ProductModifierGroup>().HasOne(x => x.ModifierGroup).WithMany().HasForeignKey(x => x.ModifierGroupId).OnDelete(DeleteBehavior.NoAction);
        b.Entity<CafeOrder>().HasIndex(x => x.OrderNumber).IsUnique();
        b.Entity<CafeOrder>().HasIndex(x => new { x.GuestSessionId, x.IdempotencyKey }).IsUnique();
        b.Entity<CafeOrder>().HasIndex(x => new { x.BranchId, x.CreatedAt });
        b.Entity<PreparationTask>().HasIndex(x => x.OrderItemId).IsUnique();
        b.Entity<PreparationTask>().HasIndex(x => new { x.StationId, x.Status });
        b.Entity<PaymentAttempt>().HasIndex(x => x.ReferenceCode).IsUnique();
        b.Entity<PaymentAttempt>().HasIndex(x => x.DemoTokenHash).IsUnique();
        b.Entity<Payment>().HasIndex(x => x.ReferenceCode).IsUnique();
        b.Entity<Payment>().HasIndex(x => new { x.BranchId, x.CollectedAt });
        b.Entity<PaymentAllocation>().HasIndex(x => new { x.OrderId, x.PaymentId }).IsUnique();
        b.Entity<Reservation>().HasIndex(x => new { x.TableId, x.StartAt, x.EndAt });
        b.Entity<Ingredient>().HasIndex(x => new { x.BranchId, x.Code }).IsUnique();
        b.Entity<OutboxMessage>().HasIndex(x => new { x.ProcessedAt, x.CreatedAt });
        b.Entity<VisitSession>().HasIndex(x => new { x.TableId, x.Status });
        b.Entity<GuestSession>().HasIndex(x => new { x.VisitSessionId, x.ExpiresAt });
        b.Entity<ServiceRequest>().HasIndex(x => new { x.VisitSessionId, x.Status });

        foreach (var t in new[] { typeof(CafeTable), typeof(VisitSession), typeof(CafeOrder), typeof(OrderItem), typeof(PreparationTask), typeof(PaymentAttempt), typeof(Ingredient) })
            b.Entity(t).Property(nameof(CafeOrder.RowVersion)).IsRowVersion();
        foreach (var entity in b.Model.GetEntityTypes())
            foreach (var property in entity.GetProperties().Where(p => p.ClrType == typeof(decimal)))
            {
                property.SetPrecision(18);
                property.SetScale(2);
            }
        // Ingredient quantities may need fractional grams/ml. Override the money default.
        b.Entity<Ingredient>().Property(x => x.OnHand).HasPrecision(18, 3);
        b.Entity<Ingredient>().Property(x => x.MinimumStock).HasPrecision(18, 3);
        b.Entity<InventoryMovement>().Property(x => x.QuantityDelta).HasPrecision(18, 3);

        // Avoid dangerous cascade deletes in transactional/history tables.
        foreach (var fk in b.Model.GetEntityTypes().SelectMany(x => x.GetForeignKeys()))
            if (fk.DeleteBehavior == DeleteBehavior.Cascade && !fk.IsOwnership && !fk.DeclaringEntityType.ClrType.Namespace!.Contains("Identity"))
                fk.DeleteBehavior = DeleteBehavior.NoAction;
    }
}
