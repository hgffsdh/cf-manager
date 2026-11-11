# One-time EF migration for ProductImages (varbinary(max)) in existing MocCafeDB.
# Non-destructive: preserves Products, Orders, Payments and existing ProductVariants.
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$project = Join-Path $root 'backend\MocCafe.Api\MocCafe.Api.csproj'
$ef = Join-Path $root '.moccafe-tools\dotnet-ef.exe'
$migrations = Join-Path $root 'backend\MocCafe.Api\Migrations'
if (!(Test-Path $project)) { throw 'Missing MocCafe.Api.csproj' }
if (!(Test-Path $ef)) { throw 'Missing local dotnet-ef (install version 8 using the existing setup script).' }
if (!(Test-Path $migrations)) { throw 'Missing previous migrations. Do not recreate database; inspect your project first.' }
$server = Read-Host 'SQL Server INSTANCE (Enter=localhost\SQLEXPRESS)'
if ([string]::IsNullOrWhiteSpace($server)) { $server = 'localhost\SQLEXPRESS' }
$securePassword = Read-Host 'SQL password for sa' -AsSecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
try { $password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
$builder = New-Object System.Data.SqlClient.SqlConnectionStringBuilder
$builder.Add('Data Source', [string]$server)
$builder.Add('Initial Catalog', 'MocCafeDB')
$builder.Add('User ID', 'sa')
$builder.Add('Password', [string]$password)
$builder.Add('Encrypt', $true)
$builder.Add('TrustServerCertificate', $true)
$env:ConnectionStrings__DefaultConnection = [string]$builder.ConnectionString
Remove-Variable password -ErrorAction SilentlyContinue
try {
    Write-Host 'Building project...' -ForegroundColor Cyan
    dotnet build $project
    if ($LASTEXITCODE -ne 0) { throw 'Backend build failed. No migration applied.' }
    $hasMigration = @(Get-ChildItem $migrations -Filter '*_AddProductImagesSql.cs' -ErrorAction SilentlyContinue).Count -gt 0
    if (-not $hasMigration) {
        Write-Host 'Creating AddProductImagesSql EF migration...' -ForegroundColor Cyan
        & $ef migrations add AddProductImagesSql --project $project --startup-project $project
        if ($LASTEXITCODE -ne 0) { throw 'Migration generation failed.' }
    }
    # Review only the Up() method. EF Core normally generates DropTable("ProductImages")
    # in Down() as a rollback operation; that is NOT a destructive forward migration.
    Write-Host 'Checking only Up() of AddProductImagesSql before updating the database...' -ForegroundColor Cyan
    $migration = Get-ChildItem $migrations -Filter '*_AddProductImagesSql.cs' |
        Sort-Object Name | Select-Object -Last 1
    if (-not $migration) { throw 'AddProductImagesSql migration file not found. Database was not updated.' }

    $content = Get-Content $migration.FullName -Raw
    $upStart = $content.IndexOf('protected override void Up(')
    if ($upStart -lt 0) { throw 'Cannot find Up() in migration. Database was not updated.' }
    $downStart = $content.IndexOf('protected override void Down(', $upStart)
    if ($downStart -lt 0) { throw 'Cannot find Down() in migration. Database was not updated.' }
    $upBody = $content.Substring($upStart, $downStart - $upStart)

    # For this patch, forward migration must ONLY create the ProductImages table.
    # Any additional operations indicate a changed EF model/snapshot and need manual review.
    $operations = @([regex]::Matches($upBody, 'migrationBuilder\.([A-Za-z][A-Za-z0-9_]*)\s*\(') |
        ForEach-Object { $_.Groups[1].Value })
    $validOperations = ($operations.Count -eq 1 -and $operations[0] -eq 'CreateTable')
    $validTable = ($upBody -match 'name:\s*"ProductImages"')
    $validColumns = (($upBody -match '\bProductId\s*=') -and
                     ($upBody -match '\bBytes\s*=') -and
                     ($upBody -match '\bContentType\s*=') -and
                     ($upBody -match '\bUpdatedAt\s*='))

    Write-Host ('Migration Up() operations: ' + ($operations -join ', ')) -ForegroundColor Gray
    if (-not $validOperations -or -not $validTable -or -not $validColumns) {
        Write-Host ('Migration path: ' + $migration.FullName) -ForegroundColor Yellow
        throw 'Up() contains unexpected changes or table shape. STOP. Do not update the database. Share the generated migration Up() for review.'
    }
    Write-Host 'SAFE: Up() only creates ProductImages. Down() rollback actions are not executed.' -ForegroundColor Green
    Write-Host 'Applying migration to existing MocCafeDB...' -ForegroundColor Cyan
    & $ef database update --project $project --startup-project $project
    if ($LASTEXITCODE -ne 0) { throw 'Migration update failed.' }
    Write-Host 'DONE. ProductImages stored in SQL Server. No existing products or orders deleted.' -ForegroundColor Green
}
finally {
    Remove-Item Env:ConnectionStrings__DefaultConnection -ErrorAction SilentlyContinue
    $builder['Password'] = ''
}
