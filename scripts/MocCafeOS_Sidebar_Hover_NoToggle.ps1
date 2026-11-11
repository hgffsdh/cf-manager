param([string]$ProjectRoot = 'A:\MocCafeOS')
$ErrorActionPreference = 'Stop'

$file = Join-Path $ProjectRoot 'frontend\src\components\Layout.tsx'
if (-not (Test-Path -LiteralPath $file)) {
    throw "Khong tim thay file: $file"
}

# Read the file as UTF-8; preserve all unrelated changes, including staff permissions.
$text = [System.IO.File]::ReadAllText($file, [System.Text.Encoding]::UTF8)
if ($text.Contains('onMouseEnter={() => setCollapsed(false)}')) {
    Write-Host 'Sidebar hover da duoc cai. Khong can sua lan nua.' -ForegroundColor Yellow
    exit 0
}

$oldAside = '<aside className="sidebar" aria-label="Menu quản lý">'
$oldState = "const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem('moc.sidebar.collapsed') === '1'; } catch { return false; } });"
$oldEffect = "useEffect(() => { try { localStorage.setItem('moc.sidebar.collapsed', collapsed ? '1' : '0'); } catch { /* private mode */ } }, [collapsed]);"
$buttonRegex = '(?m)^\s*<button\s+type="button"\s+className="moc-sidebar-toggle"[^\r\n]*\r?\n'

if (-not $text.Contains($oldAside)) { throw 'Khong tim thay aside cua sidebar. Dung de tranh sua nham.' }
if (-not $text.Contains($oldState)) { throw 'Khong tim thay state collapsed goc. Dung de tranh sua nham.' }
if (-not $text.Contains($oldEffect)) { throw 'Khong tim thay effect localStorage goc. Dung de tranh sua nham.' }
if (-not ([regex]::IsMatch($text, $buttonRegex))) { throw 'Khong tim thay nut toggle. Dung de tranh sua nham.' }

$backup = "$file.bak-hover-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
Copy-Item -LiteralPath $file -Destination $backup -ErrorAction Stop

$text = $text.Replace('PanelLeftClose, PanelLeftOpen, ', '')
$text = $text.Replace($oldState, 'const [collapsed, setCollapsed] = useState(true);')
$text = $text.Replace($oldEffect, '')
$text = $text.Replace($oldAside, '<aside className="sidebar" aria-label="Menu quản lý" onMouseEnter={() => setCollapsed(false)} onMouseLeave={() => setCollapsed(true)} onFocusCapture={() => setCollapsed(false)} onBlurCapture={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setCollapsed(true); }}>')
$text = [regex]::Replace($text, $buttonRegex, [string]::Empty)

if ($text.Contains('className="moc-sidebar-toggle"') -or -not $text.Contains('onMouseEnter={() => setCollapsed(false)}')) {
    throw 'Kiem tra sau sua khong dat. File goc da duoc sao luu.'
}
[System.IO.File]::WriteAllText($file, $text, [System.Text.UTF8Encoding]::new($false))
Write-Host 'OK: Da xoa nut toggle. Sidebar tu mo khi hover va thu gon khi roi chuot.' -ForegroundColor Green
Write-Host 'Mobile: Nut menu trong topbar van hoat dong.' -ForegroundColor Green
Write-Host "Backup: $backup"
Write-Host 'Tiep theo: cd /d A:\MocCafeOS\frontend && npm run build'
