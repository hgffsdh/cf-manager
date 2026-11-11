# Creates one additive EF Core migration after validating its Up() shape.
# Do not bypass guardrails: this script refuses to drop/alter existing tables/columns.
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$project = Join-Path $root 'backend\MocCafe.Api\MocCafe.Api.csproj'
$migrations = Join-Path $root 'backend\MocCafe.Api\Migrations'
$ef = Join-Path $root '.moccafe-tools\dotnet-ef.exe'
if (!(Test-Path $project)) { throw 'Backend .csproj not found.' }
if (!(Test-Path $migrations)) { throw 'Existing EF Migrations folder not found. STOP: do not initialize a fresh DB.' }
if (!(Test-Path $ef)) { throw 'Local dotnet-ef not found: .moccafe-tools\dotnet-ef.exe; run the original setup first.' }
$server = Read-Host 'SQL Server INSTANCE (Enter=localhost\SQLEXPRESS)'
if ([string]::IsNullOrWhiteSpace($server)) { $server = 'localhost\SQLEXPRESS' }
$passwordSecure = Read-Host 'SQL password for sa' -AsSecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($passwordSecure)
try { $password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
$builder = New-Object System.Data.SqlClient.SqlConnectionStringBuilder
$builder['Data Source'] = [string]$server
$builder['Initial Catalog'] = 'MocCafeDB'
$builder['User ID'] = 'sa'
$builder['Password'] = [string]$password
$builder['Encrypt'] = $true
$builder['TrustServerCertificate'] = $true
$env:ConnectionStrings__DefaultConnection = [string]$builder.ConnectionString
Remove-Variable password -ErrorAction SilentlyContinue
try {
  dotnet build $project
  if ($LASTEXITCODE -ne 0) { throw 'Backend build failed. No SQL changes.' }
  $name = 'AddInventoryCostStaffShifts2026'
  $existing = Get-ChildItem -LiteralPath $migrations -Filter "*_${name}.cs" | Sort-Object Name | Select-Object -Last 1
  if (!$existing) {
    & $ef migrations add $name --project $project --startup-project $project
    if ($LASTEXITCODE -ne 0) { throw 'Could not scaffold EF migration.' }
    $existing = Get-ChildItem -LiteralPath $migrations -Filter "*_${name}.cs" | Sort-Object Name | Select-Object -Last 1
  }
  if (!$existing) { throw 'New migration file missing.' }
  $text = Get-Content $existing.FullName -Raw
  $upStart = $text.IndexOf('protected override void Up(')
  if ($upStart -lt 0) { throw 'Missing Up() in migration.' }
  $downStart = $text.IndexOf('protected override void Down(', $upStart)
  if ($downStart -lt 0) { throw 'Missing Down() in migration.' }
  $up = $text.Substring($upStart, $downStart - $upStart)
  $operations = @([regex]::Matches($up, 'migrationBuilder\.([A-Za-z][A-Za-z0-9_]*)\s*\(') | ForEach-Object { $_.Groups[1].Value })
  $allowed = @('CreateTable','AddColumn','CreateIndex','AddForeignKey')
  if (@($operations | Where-Object { $allowed -notcontains $_ }).Count -gt 0) {
    throw 'UNSAFE migration operations in Up(). STOP; review migration: ' + $existing.FullName
  }
  # Only these new entities, plus 6 nullable/defaulted columns on existing InventoryMovements.
  $tables = @([regex]::Matches($up, 'migrationBuilder\.CreateTable\(\s*name:\s*"([^"]+)"', 'Singleline') | ForEach-Object { $_.Groups[1].Value })
  $expectedTables = @('StaffShifts','StaffShiftAssignments','PreparationWorkEvents')
  if ($tables.Count -ne 3 -or @($tables | Where-Object { $expectedTables -notcontains $_ }).Count -gt 0) {
    throw 'UNSAFE or missing new tables. STOP; review migration: ' + $existing.FullName
  }
  $columns = @([regex]::Matches($up, 'migrationBuilder\.AddColumn<[^>]+>\(\s*name:\s*"([^"]+)"\s*,\s*table:\s*"([^"]+)"', 'Singleline'))
  $expectedColumns = @('MovementType','UnitCost','TotalCost','StockAfter','SupplierName','DocumentNumber')
  if ($columns.Count -ne 6) { throw "Expected 6 new columns on InventoryMovements; got $($columns.Count). STOP." }
  foreach ($col in $columns) {
    if ($col.Groups[2].Value -ne 'InventoryMovements' -or $expectedColumns -notcontains $col.Groups[1].Value) {
      throw 'Unexpected AddColumn: ' + $col.Value
    }
  }
  $indexes = @([regex]::Matches($up, 'migrationBuilder\.CreateIndex\(\s*name:\s*"[^"]+"\s*,\s*table:\s*"([^"]+)"', 'Singleline'))
  foreach ($idx in $indexes) {
    if ((@('InventoryMovements') + $expectedTables) -notcontains $idx.Groups[1].Value) { throw 'Unexpected CreateIndex on an existing unrelated table.' }
  }
  if ($up -match 'migrationBuilder\.Sql\s*\(') { throw 'Raw SQL detected. STOP.' }
  Write-Host ('Verified Up() operations: ' + ($operations -join ', ')) -ForegroundColor Cyan
  Write-Host ('Migration file: ' + $existing.FullName) -ForegroundColor Gray
  Write-Host 'Up() only adds cost fields, new shift tables and work events. Existing orders not altered.' -ForegroundColor Green
  & $ef database update --project $project --startup-project $project
  if ($LASTEXITCODE -ne 0) { throw 'EF database update failed. Check logs; never delete your DB.' }
  Write-Host 'DONE. Inventory costs, shifts and work history are now backed by MocCafeDB.' -ForegroundColor Green
}
finally {
  Remove-Item Env:ConnectionStrings__DefaultConnection -ErrorAction SilentlyContinue
  $builder['Password'] = ''
}
