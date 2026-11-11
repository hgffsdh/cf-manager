using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace MocCafe.Api.Data;

// Lets `dotnet ef` generate migrations WITHOUT starting Program.cs or seeding the DB.
public sealed class DesignTimeCafeDbContextFactory : IDesignTimeDbContextFactory<CafeDbContext>
{
    public CafeDbContext CreateDbContext(string[] args)
    {
        var connection = Environment.GetEnvironmentVariable("ConnectionStrings__DefaultConnection")
            ?? throw new InvalidOperationException("Set ConnectionStrings__DefaultConnection before dotnet ef");
        return new CafeDbContext(new DbContextOptionsBuilder<CafeDbContext>().UseSqlServer(connection).Options);
    }
}
