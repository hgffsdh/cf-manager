import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ChevronRight, Coffee, DoorOpen, Footprints, Home, MapPinned, Navigation2, Search, ShieldAlert, Users } from 'lucide-react';
import { api } from '../lib/api';
import { shortestHutRoute, routeSvgPoints, type PublicHutMap } from '../lib/cafeRoute';
import './ChooseHut.css';

export default function ChooseHut() {
  const [query, setQuery] = useSearchParams();
  const selectedId = query.get('table') ?? '';
  const back = query.get('back');
  const returnTo = back?.startsWith('/g/') && !back.includes('//') ? back : null;
  const [search, setSearch] = useState('');
  const { data, error, isPending } = useQuery({
    queryKey: ['public-hut-map'],
    queryFn: () => api<PublicHutMap>('/guest/hut-map', {}, 'public'),
    staleTime: 60_000,
  });
  const selected = data?.tables.find(t => t.id === selectedId);
  const route = useMemo(() => selected && data ? shortestHutRoute(data.layout, selected) : null, [data, selected]);
  const entrance = data?.layout.nodes.find(n => n.isEntrance);
  const filtered = data?.tables.filter(t => `${t.name} ${t.code} ${t.area}`.toLocaleLowerCase('vi').includes(search.toLocaleLowerCase('vi'))) ?? [];
  const choose = (id: string) => { const p = new URLSearchParams(query); p.set('table', id); setQuery(p); };
  useEffect(() => { if (selected) document.title = `Đường đến ${selected.name} | Mộc Café`; else document.title = 'Chọn chòi | Mộc Café'; }, [selected]);

  return <div className="wh-page">
    <header className="wh-header">
      <div className="wh-brand"><Coffee size={25}/><span>MỘC <b>CAFÉ</b></span></div>
      {returnTo ? <Link className="wh-header-link" to={returnTo}><ArrowLeft size={16}/> Về thực đơn</Link> : <span className="wh-header-pill">Sơ đồ trong khuôn viên</span>}
    </header>
    <main className="wh-main">
      <div className="wh-intro"><span><MapPinned size={16}/> SƠ ĐỒ DI CHUYỂN</span><h1>Đường đến chòi của bạn</h1><p>Chọn chòi để xem vị trí và lối đi từ cổng quán. Chỉ đường dựa trên mặt bằng đã được nhân viên thiết lập.</p></div>
      {isPending && <div className="wh-notice">Đang lấy vị trí các chòi từ SQL Server...</div>}
      {error && <div className="wh-notice wh-error" role="alert">Không tải được sơ đồ. Hãy kiểm tra backend hoặc nhờ nhân viên hướng dẫn.</div>}
      {data && <div className="wh-layout">
        <aside className="wh-sidebar" aria-label="Chọn chòi">
          <div className="wh-sidebar-title"><div><h2>Chọn chòi</h2><p>{data.branchName} · {data.tables.length} vị trí</p></div><Home size={24}/></div>
          <label className="wh-search"><Search size={17}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Tìm tên hoặc mã chòi" aria-label="Tìm chòi" /></label>
          <div className="wh-hut-list">
            {filtered.map(t => <button key={t.id} className={`wh-hut-choice ${selectedId === t.id ? 'active' : ''}`} onClick={() => choose(t.id)} aria-pressed={selectedId === t.id}>
              <span className="wh-hut-icon"><Home size={20}/></span>
              <span className="wh-hut-text"><b>{t.name}</b><small>{t.area} · {t.code} · {t.capacity} chỗ</small></span>
              <ChevronRight size={18}/>
            </button>)}
            {!filtered.length && <p className="wh-empty">Không có chòi phù hợp.</p>}
          </div>
          <div className="wh-info"><ShieldAlert size={17}/> Chọn chòi để xem đường đi <b>không tự mở phiên gọi món</b>. Bạn vẫn cần quét QR hợp lệ tại bàn để đặt món.</div>
        </aside>
        <section className="wh-map-panel" aria-label="Bản đồ mặt bằng">
          <div className="wh-map-title"><div><span>KHÔNG GIAN MỘC CAFÉ</span><h2>{selected ? selected.name : 'Chọn một chòi trên bản đồ'}</h2></div><span className="wh-map-tag"><Navigation2 size={14}/> Từ cổng vào</span></div>
          <div className="wh-map-surface">
            <div className="wh-map-grid" aria-hidden="true" />
            {/* This is a neutral floor-plan grid. Do not fabricate water/roads/obstacles. */}
            <svg className="wh-svg" viewBox="0 0 100 100" preserveAspectRatio="none"
              aria-label={route && selected ? `Đường từ cổng vào đến ${selected.name} đang được chiếu sáng` : 'Lối đi đã được quản lý thiết lập'}>
              {/* Các lối đi khác vẫn hiển thị màu xám mờ. */}
              {data.layout.edges.map((edge, index) => {
                const a = data.layout.nodes.find(n=>n.id===edge.from), b = data.layout.nodes.find(n=>n.id===edge.to);
                return a && b ? <line key={index} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="wh-path-base"/> : null;
              })}
              {/* Đổi key để hiệu ứng chạy lại khi khách chọn chòi khác. */}
              {route && <g key={selectedId} className="wh-route-active" aria-hidden="true">
                {/* Ánh sáng lan rộng dưới toàn bộ tuyến đường đi bộ hợp lệ. */}
                <polyline points={routeSvgPoints(route.nodes)} className="wh-route-glow"/>
                <polyline points={routeSvgPoints(route.nodes)} className="wh-route-outline"/>
                <polyline points={routeSvgPoints(route.nodes)} className="wh-path-selected"/>
                {/* Nét trắng chuyển động theo tuyến màu xanh để hướng dẫn trực quan. */}
                <polyline points={routeSvgPoints(route.nodes)} className="wh-route-flow"/>
                {/* Đoạn nét đứt từ nút tiếp cận đến cửa chòi, không khẳng định là lối đi bộ. */}
                <line x1={route.approach.x} y1={route.approach.y} x2={route.hut.x} y2={route.hut.y} className="wh-route-hut-glow"/>
                <line x1={route.approach.x} y1={route.approach.y} x2={route.hut.x} y2={route.hut.y} className="wh-path-to-hut"/>
              </g>}
            </svg>
            {entrance && <span className="wh-entry-pin" style={{left:`${entrance.x}%`,top:`${entrance.y}%`}}><DoorOpen size={16}/> Cổng vào</span>}
            {data.tables.map(t => t.mapX != null && t.mapY != null ? <button key={t.id} type="button" className={`wh-map-hut ${selectedId===t.id?'selected':''}`} style={{left:`${t.mapX}%`,top:`${t.mapY}%`}} onClick={()=>choose(t.id)} aria-label={`Chỉ đường đến ${t.name}`} aria-pressed={selectedId===t.id}><Home size={17}/><b>{t.code}</b></button> : null)}
            {!data.tables.some(t=>t.mapX!=null && t.mapY!=null) && <div className="wh-map-pending">Quản lý chưa gán vị trí các chòi trong sơ đồ.</div>}
          </div>
          <div className="wh-bottom">
            {selected ? <div className="wh-selected-info"><span className="wh-selected-badge"><Home size={21}/></span><div><strong>{selected.name} · {selected.area}</strong><span><Users size={13}/> Sức chứa {selected.capacity} khách</span></div></div> : <div className="wh-selected-info"><MapPinned size={23}/><span>Chạm vào một chòi hoặc chọn từ danh sách</span></div>}
            {route ? <div className="wh-route-ok"><Footprints size={18}/><div><b>Đã tìm thấy lối đi</b><span>Đường màu xanh phát sáng dẫn từ cổng tới điểm tiếp cận chòi; đoạn nét đứt hướng tới chòi. Không phải định vị GPS trực tiếp.</span></div></div>
              : <div className="wh-route-unavailable"><ShieldAlert size={17}/><span>{!selected ? 'Chọn chòi để xem đường đi.' : selected.mapX == null ? 'Chòi chưa được đặt vị trí trên sơ đồ.' : 'Chưa có lối đi hợp lệ tới chòi này. Vui lòng hỏi nhân viên hoặc nhờ quản lý cấu hình trong Quản lý lối đi.'}</span></div>}
          </div>
        </section>
      </div>}
      <div className="wh-footer">Mộc Café · Sơ đồ phục vụ bên trong quán, không theo dõi vị trí điện thoại.</div>
    </main>
  </div>;
}
