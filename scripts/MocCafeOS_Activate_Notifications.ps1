param(
  [string]$ProjectRoot = 'A:\MocCafeOS'
)
$ErrorActionPreference = 'Stop'
$layoutFile = Join-Path $ProjectRoot 'frontend\src\components\Layout.tsx'
$pagesTsx = Join-Path $ProjectRoot 'frontend\src\pages\OrderNotifications.tsx'
$pagesCss = Join-Path $ProjectRoot 'frontend\src\pages\OrderNotifications.css'
$componentsTsx = Join-Path $ProjectRoot 'frontend\src\components\OrderNotifications.tsx'
$componentsCss = Join-Path $ProjectRoot 'frontend\src\components\OrderNotifications.css'

try {
  if (-not (Test-Path -LiteralPath $layoutFile)) {
    throw "Khong tim thay Layout.tsx: $layoutFile"
  }

  # Use the files that are ALREADY inside frontend/src/pages, as shown in VS Code.
  if ((Test-Path -LiteralPath $pagesTsx) -and (Test-Path -LiteralPath $pagesCss)) {
    $importPath = '../pages/OrderNotifications'
    $tsxPath = $pagesTsx
  } elseif ((Test-Path -LiteralPath $componentsTsx) -and (Test-Path -LiteralPath $componentsCss)) {
    $importPath = './OrderNotifications'
    $tsxPath = $componentsTsx
  } else {
    throw 'Khong tim thay cap OrderNotifications.tsx va OrderNotifications.css trong frontend/src/pages hoac frontend/src/components.'
  }

  $utf8 = New-Object System.Text.UTF8Encoding($false)
  $layout = [System.IO.File]::ReadAllText($layoutFile, [System.Text.Encoding]::UTF8)
  $modified = $layout

  # Make sure we are not mixing an older import with another source folder.
  $existingImport = [regex]::Match($modified, '(?m)^\s*import\s*\{[^}]*\bOrderBell\b[^}]*\}\s*from\s*[''"]([^''"]*OrderNotifications)[''"]\s*;?')
  if ($existingImport.Success -and $existingImport.Groups[1].Value -ne $importPath) {
    throw "Layout da import tu '$($existingImport.Groups[1].Value)', nhung file tim thay o '$importPath'. Dung de tranh trung module."
  }

  if (-not $existingImport.Success) {
    $line = "import { OrderBell, PendingOrderBadge, OrderDeepLink } from '$importPath';`r`n"
    $modified = $line + $modified
  } elseif ($existingImport.Value -notmatch '\bOrderDeepLink\b' -or $existingImport.Value -notmatch '\bPendingOrderBadge\b') {
    $line = "import { OrderBell, PendingOrderBadge, OrderDeepLink } from '$importPath';"
    $modified = $modified.Remove($existingImport.Index, $existingImport.Length).Insert($existingImport.Index, $line)
  }

  if ($modified -notmatch '<OrderBell\s*/>') {
    $top = [regex]::Match($modified, '<div\b[^>]*\bclassName\s*=\s*"top-actions[^\"]*"[^>]*>', [System.Text.RegularExpressions.RegexOptions]::Singleline)
    if (-not $top.Success) {
      throw 'Khong tim thay <div className="top-actions ..."> trong Layout. Khong thay doi file.'
    }
    $modified = $modified.Insert($top.Index + $top.Length, "`r`n            <OrderBell />")
  }

  if ($modified -notmatch '<PendingOrderBadge\s*/>') {
    $nav = [regex]::Match($modified, '<nav\b[^>]*\bclassName\s*=\s*"side-links"[^>]*>', [System.Text.RegularExpressions.RegexOptions]::Singleline)
    if (-not $nav.Success) {
      throw 'Khong tim thay <nav className="side-links">. Khong thay doi file.'
    }
    $closingNavLink = $modified.IndexOf('</NavLink>', $nav.Index + $nav.Length)
    if ($closingNavLink -lt 0) {
      throw 'Khong tim thay </NavLink> trong sidebar. Khong thay doi file.'
    }
    $modified = $modified.Insert($closingNavLink, "{to === '/admin/orders' && <PendingOrderBadge />}")
  }

  # A global modal inside Layout handles /admin/orders?orderId=..., without editing Orders.tsx.
  if ($modified -notmatch '<OrderDeepLink\s*/>') {
    $outlet = [regex]::Match($modified, '<Outlet\s*/>')
    if (-not $outlet.Success) {
      throw 'Khong tim thay <Outlet/> trong Layout. Khong thay doi file.'
    }
    $modified = $modified.Insert($outlet.Index + $outlet.Length, "`r`n          <OrderDeepLink />")
  }

  # Validate all three controls before touching the project.
  foreach ($marker in @('<OrderBell />', '<PendingOrderBadge />', '<OrderDeepLink />')) {
    if (-not $modified.Contains($marker)) {
      throw "Thieu component: $marker. Khong thay doi file."
    }
  }

  if ($modified -eq $layout) {
    Write-Host '[OK] Layout da co du chuong, badge va modal; khong can sua.' -ForegroundColor Green
  } else {
    $backup = "$layoutFile.backup-notifications-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
    Copy-Item -LiteralPath $layoutFile -Destination $backup -ErrorAction Stop
    [System.IO.File]::WriteAllText($layoutFile, $modified, $utf8)
    Write-Host '[OK] Da chen chuong, badge va modal vao Layout.tsx.' -ForegroundColor Green
    Write-Host "[BACKUP] $backup"
  }

  Write-Host "[SOURCE] $tsxPath"
  Write-Host '[NEXT] cd /d A:\MocCafeOS\frontend'
  Write-Host '[NEXT] npm run build'
  Write-Host '[INFO] Chuong se xuat hien ke ca khi khong co don Pending. So do chi hien khi co don Pending.'
  Write-Host '[INFO] Modal chi hien sau khi click thong bao va duong dan co orderId.'
} catch {
  Write-Host ("[ERROR] " + $_.Exception.Message) -ForegroundColor Red
  exit 1
}
