import { useMemo, useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import { CheckCircle2, CircleHelp, Home, MapPin, PencilRuler, QrCode, Users, X } from 'lucide-react';
import type { Table } from '../lib/api';
import './HutMap.css';

type Position = { x: number; y: number };
type MapTable = Table & { mapX?: number | null; mapY?: number | null };
type Props = {
  tables: MapTable[];
  editing: boolean;
  saving: boolean;
  onSavePosition: (tableId: string, position: Position) => Promise<unknown>;
  onOpen: (tableId: string) => void;
  onClose: (visitId: string) => void;
  onQr: (tableId: string) => void;
};
type Drag = { id: string; initial: Position; moved: boolean };

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const defaultPosition = (table: MapTable, tables: MapTable[], areas: string[]): Position => {
  const group = tables.filter(t => t.area === table.area);
  const idx = group.findIndex(t => t.id === table.id);
  const cols = group.length > 6 ? 3 : 2;
  const rows = Math.max(1, Math.ceil(group.length / cols));
  const zoneIndex = areas.indexOf(table.area);
  const zoneWidth = 84 / Math.max(1, areas.length);
  return {
    x: Math.round(8 + zoneIndex * zoneWidth + zoneWidth * ((idx % cols + 0.5) / cols)),
    y: Math.round(18 + 66 * ((Math.floor(idx / cols) + 0.5) / rows))
  };
};

export default function HutMap({ tables, editing, saving, onSavePosition, onOpen, onClose, onQr }: Props) {
  const surface = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Position>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState('Tất cả');
  const [error, setError] = useState('');
  const areas = useMemo(() => [...new Set(tables.map(t => t.area))], [tables]);
  const selected = tables.find(t => t.id === selectedId) ?? null;
  const occupied = tables.filter(t => !!t.visit).length;
  const needsLayout = tables.some(t => t.mapX == null || t.mapY == null);
  const getPosition = (table: MapTable): Position => drafts[table.id] ?? (
    table.mapX != null && table.mapY != null
      ? { x: table.mapX, y: table.mapY }
      : defaultPosition(table, tables, areas)
  );
  const move = (event: PointerEvent<HTMLButtonElement>, table: MapTable) => {
    if (!editing || !drag.current || drag.current.id !== table.id || !surface.current) return;
    const r = surface.current.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const next = {
      x: Math.round(clamp(((event.clientX - r.left) / r.width) * 100, 8, 92)),
      y: Math.round(clamp(((event.clientY - r.top) / r.height) * 100, 12, 88))
    };
    if (next.x !== drag.current.initial.x || next.y !== drag.current.initial.y) drag.current.moved = true;
    setDrafts(prev => ({ ...prev, [table.id]: next }));
  };
  const finish = async (event: PointerEvent<HTMLButtonElement>, table: MapTable) => {
    if (!editing || !drag.current || drag.current.id !== table.id) return;
    const prev = drag.current;
    drag.current = null;
    try { event.currentTarget.releasePointerCapture(event.pointerId); } catch { /* already released */ }
    const next = getPosition(table);
    if (!prev.moved || (next.x === prev.initial.x && next.y === prev.initial.y)) return;
    setError('');
    try { await onSavePosition(table.id, next); }
    catch (e) {
      setDrafts(old => ({ ...old, [table.id]: prev.initial }));
      setError(e instanceof Error ? e.message : 'Không lưu được vị trí bàn.');
    }
  };
  return <section className="cafe-map-shell" aria-label="Sơ đồ vị trí chòi trong quán">
    <div className="cafe-map-toolbar">
      <div className="cafe-map-heading"><MapPin size={18}/><div><b>Mặt bằng quán cà phê</b><small>{tables.length} bàn/chòi · {occupied} đang phục vụ</small></div></div>
      <div className="cafe-map-legend"><span><i className="cafe-map-dot available"/>Còn trống</span><span><i className="cafe-map-dot occupied"/>Đang có khách</span></div>
      <label className="cafe-map-filter"><span>Khu vực</span><select value={filter} onChange={e => setFilter(e.target.value)}><option value="Tất cả">Tất cả</option>{areas.map(a => <option key={a} value={a}>{a}</option>)}</select></label>
    </div>
    {needsLayout && <p className="cafe-map-note"><CircleHelp size={16}/> Vị trí ban đầu chỉ là minh họa. Chọn “Chỉnh vị trí” và kéo các bàn đến đúng vị trí thực tế để lưu vào SQL Server.</p>}
    {editing && <p className="cafe-map-editor-note"><PencilRuler size={16}/> Chế độ chỉnh sửa đang bật: kéo thả biểu tượng bàn để lưu vị trí. Chỉ Owner/Manager có quyền lưu.</p>}
    {error && <div className="error-banner" role="alert">{error}</div>}
    <div className="cafe-map-scroll">
      <div ref={surface} className={`cafe-map-surface${editing ? ' editing' : ''}`}>
        {areas.map((a, i) => <div key={a} className={`cafe-map-zone zone-${i % 3}`} style={{ left: `${4 + i * 92 / areas.length}%`, width: `${92 / areas.length - 1.5}%` }}><span>{a}</span></div>)}
        <div className="cafe-map-walkway" aria-hidden="true"/>
        <div className="cafe-map-water" aria-hidden="true"/>
        <span className="cafe-map-entry">LỐI VÀO ↓</span>
        <span className="cafe-map-counter">☕ QUẦY PHA CHẾ</span>
        {tables.map(table => {
          const p = getPosition(table);
          const hidden = filter !== 'Tất cả' && filter !== table.area;
          return <button
            type="button" key={table.id}
            className={`cafe-map-marker ${table.visit ? 'is-occupied' : 'is-available'}${selectedId === table.id ? ' is-selected' : ''}${hidden ? ' is-faded' : ''}`}
            style={{ left: `${p.x}%`, top: `${p.y}%` }}
            title={`${table.name} · ${table.area} · ${table.visit ? 'Đang có khách' : 'Còn trống'}`}
            aria-label={`${table.name} – ${table.visit ? 'Đang có khách' : 'Còn trống'}`}
            onPointerDown={e => { if (!editing || saving) return; e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); drag.current = { id: table.id, initial: p, moved: false }; }}
            onPointerMove={e => move(e, table)}
            onPointerUp={e => { void finish(e, table); }}
            onPointerCancel={() => { const active = drag.current; if (active?.id === table.id) { setDrafts(old => ({ ...old, [table.id]: active.initial })); drag.current = null; } }}
            onClick={() => { if (!editing && !hidden) setSelectedId(table.id); }}
            disabled={hidden || (editing && saving)}
          >
            <span className="cafe-map-marker-roof"><Home size={19} strokeWidth={2.3}/></span>
            <strong>{table.name}</strong><small>{table.visit ? 'Có khách' : 'Trống'}</small>
          </button>;
        })}
      </div>
    </div>
    {!editing && selected && <div className="cafe-map-detail" role="region" aria-label={`Thông tin ${selected.name}`}>
      <div className="cafe-map-detail-title"><Home size={23}/><div><strong>{selected.name}</strong><small>{selected.area} · {selected.code}</small></div><button type="button" aria-label="Đóng thông tin bàn" onClick={() => setSelectedId(null)}><X size={18}/></button></div>
      <div className="cafe-map-detail-info"><span><Users size={16}/>{selected.capacity} người</span><span className={selected.visit ? 'occupied-text' : 'available-text'}><CheckCircle2 size={16}/>{selected.visit ? 'Đang có khách' : 'Còn trống'}</span></div>
      <div className="cafe-map-detail-actions">
        {selected.visit ? <button className="btn btn-outline" onClick={() => { onClose(selected.visit!.id); setSelectedId(null); }}>Đóng phiên</button> : <button className="btn btn-primary" onClick={() => { onOpen(selected.id); setSelectedId(null); }}>Mở phiên</button>}
        <button className="btn btn-outline" onClick={() => { onQr(selected.id); setSelectedId(null); }}><QrCode size={17}/> Mã QR</button>
      </div>
    </div>}
    <div className="cafe-map-bottom"><span>Bấm vào chòi để thao tác · Cuộn ngang trên màn hình nhỏ</span><span>Không phải bản đồ GPS</span></div>
  </section>;
}
