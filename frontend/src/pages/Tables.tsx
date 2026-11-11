import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { QrCode, Home, Users, X, Copy, DoorOpen, Check, RotateCcw, MapPinned, LayoutGrid, PencilRuler } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Empty, ErrorText, PageTitle } from '../components/Layout';
import HutMap from '../components/HutMap';
import { api, post, Table } from '../lib/api';

type Action = { kind: 'open' | 'close' | 'qr' | 'archive'; id: string };
type Position = { x: number; y: number };

export default function Tables() {
  const client = useQueryClient();
  const { data, error } = useQuery({ queryKey: ['tables'], queryFn: () => api<Table[]>('/staff/tables') });
  const [view, setView] = useState<'map' | 'cards'>('map');
  const [editing, setEditing] = useState(false);
  const [qr, setQr] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  
  const [guestCount, setGuestCount] = useState(2);
  const [message, setMessage] = useState('');
  const action = useMutation({
    mutationFn: async (work: Action) => {
      if (work.kind === 'open') return post(`/staff/tables/${work.id}/open`, { guestCount, isDemo: false });
      if (work.kind === 'close') return post(`/staff/visits/${work.id}/close`, {});
      if (work.kind === 'archive') return post(`/staff/visits/${work.id}/archive-demo`, { reason: 'Dọn phiên thử nghiệm cũ để mở phiên phục vụ thực tế' });
      return post<{ url: string }>(`/staff/tables/${work.id}/qr`, {});
    },
    onSuccess: (result, input) => {
      setMessage('Thao tác thành công');
      void client.invalidateQueries({ queryKey: ['tables'] });
      if (input.kind === 'qr') setQr((result as { url: string }).url);
      setSelected(null);
    },
    onError: e => setMessage(e.message)
  });
  const savePosition = useMutation({
    mutationFn: ({ id, position }: { id: string; position: Position }) => api(`/staff/tables/${id}/position`, {
      method: 'PUT', body: JSON.stringify({ x: position.x, y: position.y })
    }),
    onSuccess: () => { void client.invalidateQueries({ queryKey: ['tables'] }); },
  });
  return <>
    <PageTitle eyebrow="KHÔNG GIAN QUÁN" title="Sơ đồ bàn & chòi" desc="Xem vị trí chòi trên mặt bằng, mở phiên phục vụ và cấp QR cho từng bàn." action={<div className="date-chip"><Home size={16}/> {data?.length ?? 0} bàn/chòi</div>}/>
    {message && <div className="info-banner" onClick={() => setMessage('')}>{message} ×</div>}
    <ErrorText error={error}/>
    <div className="cafe-map-view-switch">
      <div className="segmented" role="group" aria-label="Chế độ hiển thị bàn">
        <button className={view === 'map' ? 'active' : ''} onClick={() => setView('map')}><MapPinned size={15}/> Sơ đồ vị trí</button>
        <button className={view === 'cards' ? 'active' : ''} onClick={() => { setView('cards'); setEditing(false); }}><LayoutGrid size={15}/> Danh sách bàn</button>
      </div>
      {view === 'map' && <button className={`btn cafe-map-edit-btn ${editing ? 'btn-primary' : 'btn-outline'}`} onClick={() => setEditing(v => !v)}><PencilRuler size={17}/>{editing ? 'Hoàn tất chỉnh vị trí' : 'Chỉnh vị trí các chòi'}</button>}
      <Link className="btn btn-outline" to="/admin/navigation"><MapPinned size={16}/> Thiết lập lối đi cho khách</Link>
    </div>
    {view === 'map' && data && <HutMap
      tables={data} editing={editing} saving={savePosition.isPending}
      onSavePosition={(id, position) => savePosition.mutateAsync({ id, position })}
      onOpen={id => setSelected(id)}
      onClose={id => {const legacy = data?.find(t=>t.visit?.id===id)?.visit?.isDemo; if(legacy){if(window.confirm('Đóng phiên DEMO CŨ? Lịch sử và giao dịch demo được giữ nguyên; không chuyển thành doanh thu thật.')) action.mutate({kind:'archive',id});}else action.mutate({ kind: 'close', id });}}
      onQr={id => { setMessage(''); action.mutate({ kind: 'qr', id }); }}
    />}
    {view === 'cards' && <div className="table-grid">{data?.map(t => <div className="hut-card" key={t.id}>
      <div className="hut-top"><span className={`hut-icon ${t.visit ? 'occupied' : ''}`}><Home size={26}/></span><span className={`hut-tag ${t.visit ? 'busy' : 'free'}`}>{t.visit ? 'Đang có khách' : 'Còn trống'}</span></div>
      <strong>{t.name}</strong><p>{t.area} · {t.code}</p>
      <div className="hut-meta"><Users size={15}/>{t.capacity} người {t.visit?.isDemo ? <span>· Phiên thử nghiệm cũ</span> : null}</div>
      <div className="hut-actions">{t.visit ? <button className="btn btn-outline" disabled={action.isPending} onClick={() => {if(t.visit!.isDemo){if(window.confirm('Lưu trữ phiên thử nghiệm cũ? Không chuyển tiền demo thành tiền thật.')) action.mutate({kind:'archive',id:t.visit!.id});}else action.mutate({ kind: 'close', id: t.visit!.id });}}>{t.visit.isDemo?'Lưu trữ phiên cũ':'Đóng phiên'}</button> : <button className="btn btn-primary" onClick={() => setSelected(t.id)}>Mở phiên</button>}
        <button className="icon-button" title="Tạo QR mới" disabled={action.isPending} onClick={() => { setMessage(''); action.mutate({ kind: 'qr', id: t.id }); }}><QrCode size={21}/></button>
      </div>
    </div>)}</div>}
    {!data?.length && !error && <Empty message="Chưa có bàn. Hãy chạy seed dữ liệu Development."/>}
    {selected && <div className="overlay" onClick={() => setSelected(null)}><div className="dialog" onClick={e => e.stopPropagation()}>
      <button className="close" onClick={() => setSelected(null)}><X size={20}/></button>
      <div className="dialog-icon"><DoorOpen size={28}/></div><h2>Mở phiên phục vụ</h2>
      <p>Nhân viên mở bàn trước khi khách quét QR và gọi món.</p>
      <label>Số khách</label><input type="number" min="1" max="25" value={guestCount} onChange={e => setGuestCount(Number(e.target.value))}/>
      <p className="fine-print">Phiên phục vụ thực tế · đơn và tiền đã thu được ghi vào SQL Server. Không tạo phiên thử nghiệm.</p>
      <button className="btn btn-primary full" disabled={action.isPending} onClick={() => action.mutate({ kind: 'open', id: selected })}><Check size={18}/> Xác nhận mở phiên</button>
    </div></div>}
    {qr && <div className="overlay" onClick={() => setQr('')}><div className="dialog qr-dialog" onClick={e => e.stopPropagation()}>
      <button className="close" onClick={() => setQr('')}><X size={20}/></button><div className="dialog-icon"><QrCode size={28}/></div><h2>Mã QR bàn</h2>
      <p>Khách quét mã này bằng điện thoại khi bàn đã mở phiên.</p><div className="qr-pad"><QRCodeSVG value={qr} size={220} level="M"/></div>
      <div className="qr-url">{qr}</div><button className="btn btn-primary full" onClick={() => void navigator.clipboard.writeText(qr)}><Copy size={17}/> Sao chép liên kết</button>
      <p className="fine-print"><RotateCcw size={14}/> Cấp QR mới sẽ vô hiệu hóa QR cũ.</p>
    </div></div>}
  </>;
}
