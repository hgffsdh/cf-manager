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
    Write-Host 'Review generated migration: it should only add ProductImages (no DropTable / DropColumn).' -ForegroundColor Yellow
    $migration = Get-ChildItem $migrations -Filter '*_AddProductImagesSql.cs' | Sort-Object Name | Select-Object -Last 1
    if ($migration) {
        $content = Get-Content $migration.FullName -Raw
        if ($content -match 'DropTable\(|DropColumn\(|DeleteData\(') {
            throw 'Migration includes destructive changes. STOP and review manually. Database was not updated.'
        }
    }
    Write-Host 'Applying migration to existing MocCafeDB...' -ForegroundColor Cyan
    & $ef database update --project $project --startup-project $project
    if ($LASTEXITCODE -ne 0) { throw 'Migration update failed.' }
    Write-Host 'DONE. ProductImages stored in SQL Server. No existing products or orders deleted.' -ForegroundColor Green
}
finally {
    Remove-Item Env:ConnectionStrings__DefaultConnection -ErrorAction SilentlyContinue
    $builder['Password'] = ''
}
