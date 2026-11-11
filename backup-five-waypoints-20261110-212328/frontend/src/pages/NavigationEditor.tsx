import { useEffect, useRef, useState } from 'react';
import type { MouseEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, DoorOpen, Link2, MapPin, MousePointer2, Plus, Route, Save, Trash2, Unplug } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageTitle } from '../components/Layout';
import { api } from '../lib/api';
import type { PublicHutMap, WayLayout, WayNode, Point } from '../lib/cafeRoute';
import { routeSvgPoints, shortestHutRoute } from '../lib/cafeRoute';
import './NavigationEditor.css';

type Tool = 'preview' | 'select' | 'add' | 'connect' | 'entrance' | 'access';
const clone = (layout: WayLayout): WayLayout => ({nodes:layout.nodes.map(n=>({...n})),edges:layout.edges.map(e=>({...e})),accesses:layout.accesses.map(a=>({...a}))});
const emptyLayout: WayLayout = {nodes:[],edges:[],accesses:[]};

export default function NavigationEditor() {
  const {data,error} = useQuery({queryKey:['public-hut-map'],queryFn:()=>api<PublicHutMap>('/guest/hut-map',{},'public'),refetchOnWindowFocus:false});
  const [draft,setDraft] = useState<WayLayout>(emptyLayout);
  const [tool,setTool] = useState<Tool>('preview');
  const [first,setFirst] = useState<string | null>(null);
  const [activeHut,setActiveHut] = useState('');
  const [message,setMessage] = useState('');
  const [edited,setEdited] = useState(false);
  const surface = useRef<HTMLDivElement>(null);
  const client = useQueryClient();
  useEffect(()=>{ if(data && !edited) {setDraft(clone(data.layout));setActiveHut(t=>t||data.tables[0]?.id||'');} },[data,edited]);
  const save = useMutation({
    mutationFn:()=>api('/staff/navigation', {method:'PUT',body:JSON.stringify(draft)}),
    onSuccess:()=>{setMessage('Đã lưu mạng lưới lối đi vào SQL Server.');setEdited(false); void client.invalidateQueries({queryKey:['public-hut-map']});},
    onError:(e:Error)=>setMessage(e.message),
  });
  const modify = (next: WayLayout) => {setDraft(next);setEdited(true);setMessage('Có thay đổi chưa lưu');};
  const addNode=(event:MouseEvent<HTMLDivElement>)=>{
    if(tool!=='add'||!surface.current)return;
    const rect=surface.current.getBoundingClientRect();
    const pos:Point={x:Math.round(((event.clientX-rect.left)/rect.width)*100),y:Math.round(((event.clientY-rect.top)/rect.height)*100)};
    if(pos.x<3||pos.x>97||pos.y<3||pos.y>97)return;
    modify({...draft,nodes:[...draft.nodes,{...pos,id:crypto.randomUUID(),isEntrance:draft.nodes.length===0}]});
  };
  const tapNode=(node:WayNode)=>{
    if(tool==='entrance')modify({...draft,nodes:draft.nodes.map(n=>({...n,isEntrance:n.id===node.id}))});
    if(tool==='access') {if(!activeHut){setMessage('Hãy chọn chòi cần gán.');return;}modify({...draft,accesses:[...draft.accesses.filter(a=>a.tableId!==activeHut),{tableId:activeHut,nodeId:node.id}]});}
    if(tool==='connect') {
      if(!first){setFirst(node.id);return;}
      if(first!==node.id&&!draft.edges.some(e=>(e.from===first&&e.to===node.id)||(e.from===node.id&&e.to===first))){modify({...draft,edges:[...draft.edges,{from:first,to:node.id}]});}
      setFirst(null);
    }
    if(tool==='select')setFirst(node.id);
  };
  const removeNode=()=>{
    if(!first)return;
    modify({...draft,nodes:draft.nodes.filter(n=>n.id!==first),edges:draft.edges.filter(e=>e.from!==first&&e.to!==first),accesses:draft.accesses.filter(a=>a.nodeId!==first)});
    setFirst(null);
  };
  const clearAccess=()=>modify({...draft,accesses:draft.accesses.filter(a=>a.tableId!==activeHut)});
  const target=data?.tables.find(t=>t.id===activeHut);
  const trial=target?shortestHutRoute(draft,target):null;
  return <section className="ne-page">
    <PageTitle eyebrow="SƠ ĐỒ KHÔNG GIAN" title="Thiết lập đường đến chòi" desc="Quản lý cổng vào và mạng lưới lối đi thực tế để chỉ đường cho khách. Lưu dữ liệu xuống SQL Server." action={<Link className="btn btn-outline" to="/admin/tables"><MapPin size={16}/> Vị trí các chòi</Link>}/>
    {error && <p className="ne-error">Lỗi tải sơ đồ: {(error as Error).message}</p>}
    {data && <div className="ne-shell">
      <div className="ne-tools">
        <strong>Công cụ chỉnh lối đi</strong>
        <div className="ne-buttons">
          {([['preview',Route,'Xem đường sáng'],['add',Plus,'Thêm điểm'],['connect',Link2,'Nối lối đi'],['entrance',DoorOpen,'Đặt cổng'],['access',Check,'Gán chòi'],['select',MousePointer2,'Chọn để xóa']] as const).map(([id,Icon,label])=><button key={id} type="button" className={tool===id?'active':''} onClick={()=>{setTool(id);setFirst(null);}}><Icon size={16}/>{label}</button>)}
        </div>
        {tool==='preview'&&<p>Bấm vào biểu tượng một chòi trên mặt bằng để tự làm sáng đường ngắn nhất từ cổng đến chòi đó.</p>}
        {tool==='add'&&<p>Bấm vào mặt bằng để thêm một điểm nằm trên lối đi thực tế. Điểm đầu tiên tự được coi là cổng vào.</p>}
        {tool==='connect'&&<p>Bấm lần lượt hai điểm để nối thành một đoạn đường có thể đi bộ. Đừng nối đường đi xuyên hồ, tường hay khu vực cấm.</p>}
        {tool==='entrance'&&<p>Bấm điểm tương ứng với cổng vào quán.</p>}
        {tool==='access'&&<p>Chọn chòi bên dưới, rồi bấm điểm trên lối đi dẫn đến chòi đó.</p>}
        {tool==='select'&&<p>Bấm một điểm rồi nhấn “Xóa điểm” nếu muốn sửa đường.</p>}
        <label className="ne-select">Chòi cần gán lối vào<select value={activeHut} onChange={e=>setActiveHut(e.target.value)}>{data.tables.map(t=><option key={t.id} value={t.id}>{t.name} · {t.area}</option>)}</select></label>
        <p className={`ne-assigned ${trial ? 'ne-assigned--ready' : ''}`} role="status">{target && draft.accesses.some(a=>a.tableId===target.id) ? (trial?'✓ Đã tìm được đường đi! Tuyến xanh sáng hiển thị trực tiếp trên bản đồ.':'Đã gán điểm tiếp cận, nhưng chưa nối thông đường từ cổng.') : 'Chòi này chưa được gán điểm tiếp cận.'}</p>
        <div className="ne-actions"><button className="btn btn-outline" onClick={clearAccess} disabled={!draft.accesses.some(a=>a.tableId===activeHut)}><Unplug size={16}/> Bỏ gán chòi</button><button className="btn btn-outline" onClick={removeNode} disabled={!first||tool!=='select'}><Trash2 size={16}/> Xóa điểm</button></div>
        <button className="btn btn-primary full" onClick={()=>save.mutate()} disabled={save.isPending||!edited}><Save size={17}/>{save.isPending?'Đang lưu...':'Lưu vào SQL Server'}</button>
        <Link className="ne-preview" to={`/chon-choi?table=${encodeURIComponent(activeHut)}`} target="_blank" rel="noopener noreferrer">Xem trang khách sau khi lưu</Link>
        {message&&<p role="status" className="ne-status">{message}</p>}
      </div>
      <div className="ne-canvas-wrap">
        <div className="ne-heading"><b>Mặt bằng · {draft.nodes.length} điểm đi bộ</b><span>{draft.edges.length} đoạn nối · {draft.accesses.length} chòi đã gán</span></div>
        <div className={`ne-route-caption ${trial ? 'ne-route-caption--ready' : ''}`} role="status">
          {trial && target ? `Tuyến sáng: Cổng vào → ${target.name}` : (target ? `Chưa có tuyến hợp lệ tới ${target.name}` : 'Chọn chòi để xem đường đi')}
        </div>
        <div className={`ne-canvas ${tool==='preview'?'ne-canvas--preview':''}`} ref={surface} onClick={addNode} role="presentation">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="ne-svg" aria-hidden="true">
            {/* Tất cả lối đi nền đều mờ. */}
            {draft.edges.map((e,i)=>{const a=draft.nodes.find(n=>n.id===e.from),b=draft.nodes.find(n=>n.id===e.to);return a&&b?<line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="ne-path-base" vectorEffect="non-scaling-stroke"/>:null;})}
            {/* Khi đổi chòi, key thay đổi để hiệu ứng chạy lại từ đầu. */}
            {trial && <g key={activeHut} className="ne-route-active">
              <polyline points={routeSvgPoints(trial.nodes)} className="ne-route-glow" />
              <polyline points={routeSvgPoints(trial.nodes)} className="ne-route-border" />
              <polyline points={routeSvgPoints(trial.nodes)} className="ne-route-line" />
              <polyline points={routeSvgPoints(trial.nodes)} className="ne-route-flow" />
              {/* Đường nét đứt tới chòi: chỉ là chỉ dẫn từ điểm tiếp cận. */}
              <line x1={trial.approach.x} y1={trial.approach.y} x2={trial.hut.x} y2={trial.hut.y} className="ne-route-access" />
            </g>}
          </svg>
          {data.tables.map(t=>t.mapX!=null&&t.mapY!=null?<button type="button" className={`ne-hut ${activeHut===t.id?'active':''} ${activeHut===t.id&&trial?'has-route':''}`} key={t.id} style={{left:`${t.mapX}%`,top:`${t.mapY}%`}} title={`Chọn ${t.name} để xem đường sáng`} aria-pressed={activeHut===t.id} onClick={e=>{e.stopPropagation();setActiveHut(t.id);setFirst(null);}}>{t.code}</button>:null)}
          {draft.nodes.map((n,i)=><button key={n.id} className={`ne-point ${n.isEntrance?'entrance':''} ${n.id===first?'chosen':''} ${trial?.nodes.some(p=>p.id===n.id)?'on-route':''}`} style={{left:`${n.x}%`,top:`${n.y}%`}} title={n.isEntrance?'Cổng vào':`Điểm đường ${i+1}`} onClick={e=>{e.stopPropagation();tapNode(n);}} type="button">{n.isEntrance?'C':i+1}</button>)}
        </div>
        <p className="ne-note">Chú ý: Đây là tọa độ mặt bằng, không phải GPS. Bạn cần đặt vị trí chòi ở “Sơ đồ bàn & chòi” trước, sau đó vẽ từng lối đi đúng thực địa và gán điểm tiếp cận cho mỗi chòi.</p>
      </div>
    </div>}
  </section>;
}
