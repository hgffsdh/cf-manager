$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$program = Join-Path $root 'backend\MocCafe.Api\Program.cs'
$endpoint = Join-Path $root 'backend\MocCafe.Api\Endpoints\HistoryEndpoints.cs'
if (!(Test-Path $endpoint)) { throw 'Missing HistoryEndpoints.cs. Extract patch into A:\MocCafeOS first.' }
if (!(Test-Path $program)) { throw 'Missing Program.cs.' }
$code = [System.IO.File]::ReadAllText($program)
if ($code -match 'app\.MapHistory\(\);') {
    Write-Host 'History API already registered. No change needed.' -ForegroundColor Green
} else {
    if (!$code.Contains('app.MapOperations();')) { throw 'Cannot find app.MapOperations();. Please inspect Program.cs manually.' }
    $newCode = $code.Replace('app.MapOperations();', "app.MapOperations();`r`napp.MapHistory();")
    [System.IO.File]::WriteAllText($program, $newCode, (New-Object System.Text.UTF8Encoding($false)))
    Write-Host 'Registered app.MapHistory() in Program.cs.' -ForegroundColor Green
}
Write-Host 'Next: stop running backend, run dotnet build, and restart backend.'
