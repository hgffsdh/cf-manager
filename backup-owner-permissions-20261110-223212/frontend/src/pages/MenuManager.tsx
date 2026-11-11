import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, Check, ImagePlus, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { api, money } from '../lib/api';
import { Empty, ErrorText, PageTitle } from '../components/Layout';
import './MenuManager.css';

type Category = { id: string; name: string; sortOrder: number; branchId: string; isActive: boolean };
type Station = { id: string; name: string; branchId: string };
type Lookups = { categories: Category[]; stations: Station[] };
type Variant = { id?: string; name: string; price: number; isActive: boolean };
type Product = { id: string; code: string; name: string; description: string;
  imageUrl: string; categoryId: string; categoryName: string; stationId: string; stationName: string;
  isActive: boolean; isSoldOut: boolean; isFeatured: boolean; variants: Variant[] };
type Draft = { id?: string; code: string; name: string; description: string; categoryId: string;
  stationId: string; isActive: boolean; isSoldOut: boolean; isFeatured: boolean; variants: Variant[]; imageUrl?: string };

const initial = (lookups: Lookups): Draft => ({
  code: '', name: '', description: '', categoryId: lookups.categories.find(c => c.isActive)?.id || '',
  stationId: lookups.stations[0]?.id || '', isActive: true, isSoldOut: false, isFeatured: false,
  variants: [{ name: 'M', price: 30000, isActive: true }]
});

export default function MenuManager() {
  const qc = useQueryClient();
  const {data: lookups, error: lookupError} = useQuery({queryKey:['menu-lookups'], queryFn:()=>api<Lookups>('/staff/menu/lookups')});
  const {data: products=[], error: productError, isLoading} = useQuery({queryKey:['menu-admin-products'], queryFn:()=>api<Product[]>('/staff/menu/products')});
  const [search, setSearch] = useState('');
  const [categoryFilter,setCategoryFilter] = useState('all');
  const [draft,setDraft] = useState<Draft|null>(null);
  const [image,setImage] = useState<File|null>(null);
  const [preview,setPreview] = useState('');
  const [saving,setSaving] = useState(false);
  const [alert,setAlert] = useState('');
  const [error,setError] = useState('');
  const [newCategory,setNewCategory] = useState('');

  useEffect(()=>{
    if (!image) { setPreview(''); return; }
    const url = URL.createObjectURL(image); setPreview(url);
    return ()=> URL.revokeObjectURL(url);
  },[image]);

  const filtered = useMemo(()=> products.filter(p=>
    (categoryFilter==='all'||p.categoryId===categoryFilter) &&
    `${p.code} ${p.name}`.toLocaleLowerCase('vi').includes(search.toLocaleLowerCase('vi').trim())
  ),[products,search,categoryFilter]);
  const close=()=>{setDraft(null);setImage(null);setError('');};
  const edit=(p:Product)=>{setImage(null);setError('');setDraft({id:p.id,code:p.code,name:p.name,
    description:p.description,categoryId:p.categoryId,stationId:p.stationId,isActive:p.isActive,
    isSoldOut:p.isSoldOut,isFeatured:p.isFeatured,imageUrl:p.imageUrl,
    variants:p.variants.map(v=>({...v}))});};
  const refresh=async()=>{await Promise.all([qc.invalidateQueries({queryKey:['menu-admin-products']}), qc.invalidateQueries({queryKey:['menu']}),qc.invalidateQueries({queryKey:['menu-lookups']})]);};
  const upload=async(id:string,file:File)=>{
    if (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size>3*1024*1024 || file.size===0)
      throw new Error('Chọn ảnh JPEG, PNG hoặc WebP không quá 3 MB.');
    const form = new FormData();form.append('file',file);
    await api(`/staff/menu/products/${id}/image`, {method:'POST',body:form});
  };
  const save=async()=>{
    if(!draft)return;
    setSaving(true);setError('');setAlert('');
    let persisted=false;
    let savedId:string|undefined;
    try {
      const payload={ code:draft.code.trim(),name:draft.name.trim(),description:draft.description.trim(),
        categoryId:draft.categoryId,stationId:draft.stationId,isActive:draft.isActive,
        isSoldOut:draft.isSoldOut,isFeatured:draft.isFeatured,variants:draft.variants };
      const result=await api<{id:string}>(draft.id?`/staff/menu/products/${draft.id}`:'/staff/menu/products',
        {method:draft.id?'PUT':'POST',body:JSON.stringify(payload)});
      persisted=true;
      savedId=result.id;
      if(image)await upload(result.id,image);
      await refresh();
      setAlert(image?'Đã lưu món và ảnh thật vào SQL Server.':'Đã lưu thông tin món vào SQL Server.');
      close();
    } catch(e) {
      if(savedId)setDraft(d=>d?{...d,id:savedId}:null);
      setError((persisted?'Thông tin món đã lưu nhưng ảnh chưa cập nhật. ':'')+(e instanceof Error?e.message:String(e)));
      await qc.invalidateQueries({queryKey:['menu-admin-products']});
    } finally {setSaving(false);}
  };
  const toggleSoldOut=async(p:Product)=>{
    setError('');setAlert('');
    try {await api(`/staff/menu/products/${p.id}`,{method:'PUT',body:JSON.stringify({
      code:p.code,name:p.name,description:p.description,categoryId:p.categoryId,
      stationId:p.stationId,isActive:p.isActive,isSoldOut:!p.isSoldOut,
      isFeatured:p.isFeatured,variants:p.variants
    })});await refresh();setAlert(p.isSoldOut?'Đã mở bán lại món.':'Đã đánh dấu hết món.');}
    catch(e){setError(e instanceof Error?e.message:String(e));}
  };
  const removePhoto=async()=>{
    if(!draft?.id || !window.confirm('Xóa ảnh thật của món này khỏi SQL Server?'))return;
    setSaving(true);
    try {await api(`/staff/menu/products/${draft.id}/image`,{method:'DELETE'});
      setDraft(d=>d?{...d,imageUrl:''}:null);setImage(null);await refresh();setAlert('Đã xóa ảnh.');}
    catch(e){setError(e instanceof Error?e.message:String(e));}
    finally{setSaving(false);}
  };
  const addCategory=async()=>{
    const name=newCategory.trim();if(!name)return;
    try {await api('/staff/menu/categories',{method:'POST',body:JSON.stringify({name,sortOrder:lookups?.categories.length||0})});
      setNewCategory('');await refresh();setAlert('Đã tạo danh mục mới.');}
    catch(e){setError(e instanceof Error?e.message:String(e));}
  };
  const active = products.filter(p=>p.isActive && !p.isSoldOut).length;
  return <div className="menu-admin">
    <PageTitle eyebrow="THỰC ĐƠN VẬN HÀNH" title="Quản lý món thật" desc="Tên món, giá và ảnh được lưu tại SQL Server và hiển thị lên menu QR của khách." action={lookups && <button className="btn btn-primary" onClick={()=>{setAlert('');setError('');setImage(null);setDraft(initial(lookups));}}><Plus size={18}/> Thêm món mới</button>}/>
    <div className="menu-stats"><div><span>Tổng món trong hệ thống</span><strong>{products.length}</strong></div><div><span>Đang bán</span><strong>{active}</strong></div><div><span>Hết món</span><strong>{products.filter(p=>p.isSoldOut).length}</strong></div><div><span>Có ảnh thật</span><strong>{products.filter(p=>!!p.imageUrl).length}</strong></div></div>
    {alert&&<div className="info-banner">{alert}</div>}
    <ErrorText error={error||lookupError||productError}/>
    <div className="menu-toolbar"><div className="menu-search"><Search size={18}/><input aria-label="Tìm món" placeholder="Tìm tên hoặc mã món..." value={search} onChange={e=>setSearch(e.target.value)}/></div>
      <select aria-label="Lọc danh mục" value={categoryFilter} onChange={e=>setCategoryFilter(e.target.value)}><option value="all">Tất cả danh mục</option>{lookups?.categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
    {isLoading?<p>Đang tải thực đơn từ SQL Server...</p>:!filtered.length?<Empty message="Chưa tìm thấy món. Bấm Thêm món mới để nhập món thật."/>:
      <div className="menu-products">{filtered.map(p=><article key={p.id} className="menu-admin-card"><div className="menu-admin-photo">{p.imageUrl?<img src={p.imageUrl} alt={p.name} loading="lazy"/>:<div className="menu-photo-empty"><ImagePlus size={32}/><small>Chưa tải ảnh</small></div>}</div><div className="menu-admin-info"><div className="menu-admin-tags"><span>{p.categoryName}</span><span>{p.code}</span>{!p.isActive?<b className="off">Đã ẩn</b>:p.isSoldOut?<b className="off">Hết món</b>:<b className="on">Đang bán</b>}</div><h3>{p.name}</h3><p>{p.description||'Chưa có mô tả'}</p><div className="menu-variant-preview">{p.variants.filter(v=>v.isActive).map(v=><span key={v.id}>{v.name}: <b>{money(v.price)}</b></span>)}</div><small>Trạm: {p.stationName}</small><div className="menu-admin-actions"><button className="btn btn-primary" onClick={()=>edit(p)}><Pencil size={15}/> Chỉnh sửa</button><button className="btn btn-outline" onClick={()=>toggleSoldOut(p)}>{p.isSoldOut?'Mở bán lại':'Báo hết món'}</button></div></div></article>)}</div>}
    <div className="menu-category-create"><div><strong>Thêm danh mục món</strong><p>Các danh mục sẽ xuất hiện trên thực đơn của khách.</p></div><input aria-label="Tên danh mục mới" placeholder="Ví dụ: Nước ép" value={newCategory} maxLength={80} onChange={e=>setNewCategory(e.target.value)}/><button className="btn btn-outline" disabled={!newCategory.trim()} onClick={addCategory}><Plus size={16}/> Thêm danh mục</button></div>

    {draft&&<div className="overlay menu-edit-overlay" onClick={close}><div className="dialog menu-edit-dialog" role="dialog" aria-modal="true" aria-label="Chỉnh sửa món" onClick={e=>e.stopPropagation()}>
      <div className="menu-edit-head"><div><small>{draft.id?'CHỈNH SỬA SẢN PHẨM':'TẠO SẢN PHẨM MỚI'}</small><h2>{draft.id?'Cập nhật món thật':'Thêm món mới'}</h2></div><button className="menu-close" aria-label="Đóng" onClick={close}><X size={20}/></button></div>
      <div className="menu-edit-scroll"><div className="menu-image-row"><div className="menu-edit-photo">{preview||draft.imageUrl?<img src={preview||draft.imageUrl} alt="Ảnh món"/>:<Camera size={38}/>}</div><div><strong>Ảnh món do bạn chụp</strong><p>JPG, PNG hoặc WebP, tối đa 3 MB. Ảnh lưu trực tiếp trong SQL Server.</p><label className="btn btn-outline menu-image-upload"><ImagePlus size={17}/> Chọn ảnh từ máy <input type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={e=>{setImage(e.target.files?.[0]||null);e.currentTarget.value='';}}/></label>{(draft.imageUrl||image)&&<div className="menu-image-extra">{image&&<button onClick={()=>setImage(null)}>Bỏ ảnh mới</button>}{draft.id&&draft.imageUrl&&<button onClick={removePhoto} disabled={saving}><Trash2 size={13}/> Xóa ảnh cũ</button>}</div>}</div></div>
      <div className="menu-form-grid"><div><label htmlFor="menu-code">Mã món *</label><input id="menu-code" maxLength={30} value={draft.code} placeholder="VD: CF001" onChange={e=>setDraft({...draft,code:e.target.value})}/></div><div><label htmlFor="menu-name">Tên món *</label><input id="menu-name" maxLength={120} value={draft.name} placeholder="VD: Cà phê sữa đá" onChange={e=>setDraft({...draft,name:e.target.value})}/></div><div><label htmlFor="menu-cat">Danh mục</label><select id="menu-cat" value={draft.categoryId} onChange={e=>{
        const category=lookups?.categories.find(c=>c.id===e.target.value);
        const station = lookups?.stations.find(s=>s.branchId===category?.branchId);
        setDraft({...draft,categoryId:e.target.value,stationId:station?.id||draft.stationId});
      }}>{lookups?.categories.filter(c=>c.isActive).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div><div><label htmlFor="menu-station">Quầy pha chế</label><select id="menu-station" value={draft.stationId} onChange={e=>setDraft({...draft,stationId:e.target.value})}>{lookups?.stations.filter(s=>s.branchId===lookups?.categories.find(c=>c.id===draft.categoryId)?.branchId).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></div></div>
      <label htmlFor="menu-desc">Mô tả</label><textarea id="menu-desc" rows={3} maxLength={800} value={draft.description} onChange={e=>setDraft({...draft,description:e.target.value})} placeholder="Thành phần, hương vị, cách dùng..."/>
      <div className="menu-editor-section"><div className="menu-editor-title"><strong>Giá và size</strong><button type="button" className="btn btn-outline" onClick={()=>setDraft({...draft,variants:[...draft.variants,{name:'',price:30000,isActive:true}]})}><Plus size={15}/> Thêm size</button></div>
        {draft.variants.map((v,i)=><div className="menu-variant-row" key={v.id||`new-${i}`}><input aria-label={`Tên size ${i+1}`} placeholder="Tên size" value={v.name} onChange={e=>setDraft(d=>d?{...d,variants:d.variants.map((x,j)=>j===i?{...x,name:e.target.value}:x)}:d)}/><input aria-label={`Giá size ${i+1}`} type="number" min={1000} max={10000000} step={1000} value={v.price} onChange={e=>setDraft(d=>d?{...d,variants:d.variants.map((x,j)=>j===i?{...x,price:Number(e.target.value)}:x)}:d)}/><label className="menu-active-check"><input type="checkbox" checked={v.isActive} onChange={e=>setDraft(d=>d?{...d,variants:d.variants.map((x,j)=>j===i?{...x,isActive:e.target.checked}:x)}:d)}/> Bán</label><button className="menu-delete-variant" title="Bỏ size" onClick={()=>setDraft(d=>d?{...d,variants:d.variants.filter((_,j)=>j!==i)}:d)}><Trash2 size={16}/></button></div>)}
        <small>Size đã từng bán sẽ được ẩn thay vì xóa khỏi SQL, để bảo toàn lịch sử đơn hàng.</small></div>
      <div className="menu-checkbox-row"><label><input type="checkbox" checked={draft.isActive} onChange={e=>setDraft({...draft,isActive:e.target.checked})}/> Hiển thị trong thực đơn</label><label><input type="checkbox" checked={draft.isSoldOut} onChange={e=>setDraft({...draft,isSoldOut:e.target.checked})}/> Đang hết món</label><label><input type="checkbox" checked={draft.isFeatured} onChange={e=>setDraft({...draft,isFeatured:e.target.checked})}/> Món nổi bật</label></div>
      <ErrorText error={error}/></div><div className="menu-edit-footer"><button className="btn btn-outline" onClick={close}>Hủy</button><button className="btn btn-primary" disabled={saving||!draft.name.trim()||!draft.code.trim()} onClick={save}><Check size={17}/>{saving?'Đang lưu SQL...':'Lưu món và ảnh'}</button></div>
    </div></div>}
  </div>;
}
