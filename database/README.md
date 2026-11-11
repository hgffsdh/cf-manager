# SQL Server database

Database name: `MocCafeDB`.

The **EF Core model** defines relational schema: `backend/MocCafe.Api/Domain/Entities.cs` and `Data/CafeDbContext.cs`.

Because the creation environment has no .NET SDK or SQL Server, the **initial SQL Server migration cannot be generated or applied here**. On Windows, `scripts/setup-windows.ps1` builds the model, generates `InitialCreate` into `backend/MocCafe.Api/Migrations`, then applies it using `dotnet ef database update`. Preserve that generated migrations folder in Git/source for the next developer. The script **does not drop existing databases**. Before applying to a database with existing tables, review the migration and back it up.

Docker demo uses EnsureCreated on a fresh DB instead of migrations; do not mix this with the migration-managed DB.
