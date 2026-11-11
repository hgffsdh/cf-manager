"""Safely merge Mộc Café OS guest wayfinding into the existing codebase.

Requires Python 3.9+ installed on Windows. Run from project folder:
  py -3 scripts\\install-guest-navigation.py
The script backs up every edited file and checks all anchors before writing.
"""
from __future__ import annotations
import datetime as dt
from pathlib import Path
import shutil
import sys

ROOT = Path(__file__).resolve().parent.parent
STAMP = dt.datetime.now().strftime('%Y%m%d-%H%M%S')
BACKUP = ROOT / '.wayfinding-backups' / STAMP

edits: dict[str, list[tuple[str, str, str]]] = {
    'frontend/src/App.tsx': [
        ("import Guest from './pages/Guest';", "import Guest from './pages/Guest';\nimport ChooseHut from './pages/ChooseHut';\nimport NavigationEditor from './pages/NavigationEditor';", "import ChooseHut from './pages/ChooseHut';"),
        ('<Route path="/g/:qr" element={<Guest/>}/>', '<Route path="/g/:qr" element={<Guest/>}/><Route path="/chon-choi" element={<ChooseHut/>}/>', '<Route path="/chon-choi" element={<ChooseHut/>}/>'),
        ('<Route path="/admin/tables" element={<Tables/>}/>', '<Route path="/admin/tables" element={<Tables/>}/><Route path="/admin/navigation" element={<NavigationEditor/>}/>', '<Route path="/admin/navigation" element={<NavigationEditor/>}/>'),
    ],
    'frontend/src/pages/Guest.tsx': [
        ("import { useParams } from 'react-router-dom';", "import { Link, useParams } from 'react-router-dom';", "import { Link, useParams } from 'react-router-dom';"),
        ('import { Coffee,', 'import { MapPinned, Coffee,', 'import { MapPinned, Coffee,'),
        ('type GuestInfo = {tableName:string;isDemo:boolean;visitId:string};', 'type GuestInfo = {tableName:string;isDemo:boolean;visitId:string;tableId?:string};', 'tableId?:string'),
        ('<div className="guest-table">ĐANG PHỤC VỤ · {info.tableName}</div></header>', '<div className="guest-table">ĐANG PHỤC VỤ · {info.tableName}</div><Link className="wh-nav-link" to={info.tableId ? `/chon-choi?table=${info.tableId}&back=${encodeURIComponent(\'/g/\'+qr)}` : `/chon-choi?back=${encodeURIComponent(\'/g/\'+qr)}`}><MapPinned size={16}/> Chỉ đường đến chòi</Link></header>', 'Chỉ đường đến chòi</Link>'),
        ("try{await api('/guest/me',{},'guest');if(live)setInfo(JSON.parse(cached));return;}", "try{const current=await api<{tableId:string}>('/guest/me',{},'guest');const next={...JSON.parse(cached),tableId:current.tableId};sessionStorage.setItem('moc.visit.'+qr,JSON.stringify(next));if(live)setInfo(next);return;}", "const current=await api<{tableId:string}>('/guest/me'"),
        ('visitId:result.visitId}', 'visitId:result.visitId,tableId:result.tableId}', 'visitId:result.visitId,tableId:result.tableId}'),
    ],
    'frontend/src/pages/Tables.tsx': [
        ("import { useState } from 'react';", "import { useState } from 'react';\nimport { Link } from 'react-router-dom';", "import { Link } from 'react-router-dom';"),
        ("    </div>\n    {view === 'map' && data && <HutMap", "      <Link className=\"btn btn-outline\" to=\"/admin/navigation\"><MapPinned size={16}/> Thiết lập lối đi cho khách</Link>\n    </div>\n    {view === 'map' && data && <HutMap", 'Thiết lập lối đi cho khách</Link>'),
    ],
    'backend/MocCafe.Api/Program.cs': [
        ('app.MapGuest();', 'app.MapGuest();\napp.MapNavigation();', 'app.MapNavigation();'),
    ],
    'backend/MocCafe.Api/Data/CafeDbContext.cs': [
        ('    public DbSet<Branch> Branches => Set<Branch>();', '    public DbSet<Branch> Branches => Set<Branch>();\n    public DbSet<CafeNavigationLayout> CafeNavigationLayouts => Set<CafeNavigationLayout>();', 'public DbSet<CafeNavigationLayout>'),
        ('        b.Entity<Branch>().HasIndex(x => x.Code).IsUnique();', '        b.Entity<Branch>().HasIndex(x => x.Code).IsUnique();\n        b.Entity<CafeNavigationLayout>().HasIndex(x => x.BranchId).IsUnique();\n        b.Entity<CafeNavigationLayout>().Property(x => x.LayoutJson).HasMaxLength(30000);', 'b.Entity<CafeNavigationLayout>().HasIndex'),
    ],
    'backend/MocCafe.Api/Endpoints/GuestEndpoints.cs': [
        ('guest.VisitSessionId, guest.VisitSession.IsDemo', 'guest.VisitSessionId, guest.VisitSession.IsDemo, tableId = guest.VisitSession.TableId', 'guest.VisitSession.IsDemo, tableId = guest.VisitSession.TableId'),
        ('guestToken = secret, visitId = visit.Id, tableName = visit.Table.Name, isDemo = visit.IsDemo', 'guestToken = secret, visitId = visit.Id, tableName = visit.Table.Name, tableId = visit.TableId, isDemo = visit.IsDemo', 'tableId = visit.TableId, isDemo = visit.IsDemo'),
    ],
}

NEW_FILES = [
    'frontend/src/pages/ChooseHut.tsx', 'frontend/src/pages/ChooseHut.css',
    'frontend/src/pages/NavigationEditor.tsx', 'frontend/src/pages/NavigationEditor.css',
    'frontend/src/lib/cafeRoute.ts',
    'backend/MocCafe.Api/Domain/CafeNavigationLayout.cs',
    'backend/MocCafe.Api/Endpoints/NavigationEndpoints.cs',
]


def run():
    for path in NEW_FILES:
        if not (ROOT / path).is_file():
            raise RuntimeError(f'Chưa sao chép file mới vào dự án: {path}')
    updated: dict[str, tuple[str, str]] = {}
    for path, substitutions in edits.items():
        filename = ROOT / path
        if not filename.exists():
            raise RuntimeError(f'Không có file gốc: {path}')
        original = filename.read_text(encoding='utf-8-sig')
        content = original
        for old, new, marker in substitutions:
            if marker in content:
                continue
            if content.count(old) != 1:
                raise RuntimeError(f'Không tìm thấy đúng điểm ghép trong {path}: {old[:75]!r}. Không có file nào bị ghi đè. Hãy gửi file này để ghép thủ công.')
            content = content.replace(old, new, 1)
        if content != original:
            updated[path] = (original, content)
    if not updated:
        print('Đã tích hợp tính năng này từ trước. Không cần sửa lại source.')
        return
    for path, (original, _) in updated.items():
        dest = BACKUP / path
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(original, encoding='utf-8')
    for path, (_, content) in updated.items():
        target = ROOT / path
        tmp = target.with_suffix(target.suffix + '.tmp')
        tmp.write_text(content, encoding='utf-8')
        tmp.replace(target)
        print('Đã cập nhật:', path)
    print('\nĐã sao lưu source gốc tại:', BACKUP)
    print('Bước tiếp theo: chạy script enable-guest-navigation.ps1 để tạo migration (không xóa dữ liệu cũ).')


if __name__ == '__main__':
    try:
        run()
    except Exception as exc:
        print('DỪNG ĐỂ BẢO VỆ SOURCE:', exc, file=sys.stderr)
        sys.exit(1)
