import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, ClipboardList, Coins, PackagePlus, Plus, RefreshCcw, Search, TrendingDown } from 'lucide-react';
import { api, money, post, when } from '../lib/api';
import { ErrorText, PageTitle } from '../components/Layout';
import './InventoryManagement.css';

type Ingredient = { id: string; code: string; name: string; unit: string; onHand: number; minimumStock: number; low: boolean };
type Movement = { id: string; createdAt: string; ingredientId: string; ingredientName: string; unit: string; quantityDelta: number;
  movementType: 'Receipt' | 'Adjustment'; unitCost: number | null; totalCost: number | null; stockAfter: number | null;
  supplierName: string | null; documentNumber: string | null; reason: string; actorName: string | null };
type Ledger = { items: Movement[]; page: number; pageSize: number; totalCount: number; receiptCost: number };
const formatQty = (n: number) => new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 3 }).format(n);
const dateToday = () => new Date().toLocaleDateString('en-CA');

export default function Inventory() {
  const client = useQueryClient();
  const [tab, setTab] = useState<'receive' | 'history' | 'adjust' | 'create'>('receive');
  const [selected, setSelected] = useState('');
  const [qty, setQty] = useState('');
  const [unitCost, setUnitCost] = useState('');
  const [supplier, setSupplier] = useState('');
  const [invoice, setInvoice] = useState('');
  const [note, setNote] = useState('');
  const [changeQty, setChangeQty] = useState('');
  const [changeReason, setChangeReason] = useState('');
  const [newCode, setNewCode] = useState('');
  const [newName, setNewName] = useState('');
  const [newUnit, setNewUnit] = useState('g');
  const [newMinimum, setNewMinimum] = useState('0');
  const [filterIngredient, setFilterIngredient] = useState('');
  const [filterType, setFilterType] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState(dateToday());
  const [page, setPage] = useState(1);
  const [success, setSuccess] = useState('');

  const ingredients = useQuery({ queryKey: ['ingredients'], queryFn: () => api<Ingredient[]>('/staff/ingredients') });
  const historyPath = useMemo(() => {
    const params = new URLSearchParams({ page: String(page) });
    if (filterIngredient) params.set('ingredientId', filterIngredient);
    if (filterType) params.set('type', filterType);
    if (dateFrom) params.set('from', new Date(`${dateFrom}T00:00:00`).toISOString());
    if (dateTo) { const end = new Date(`${dateTo}T00:00:00`); end.setDate(end.getDate() + 1); params.set('to', end.toISOString()); }
    return `/staff/inventory/movements?${params}`;
  }, [page, filterIngredient, filterType, dateFrom, dateTo]);
  const history = useQuery({ queryKey: ['inventory-movements', historyPath], queryFn: () => api<Ledger>(historyPath) });
  const refresh = () => { client.invalidateQueries({ queryKey: ['ingredients'] }); client.invalidateQueries({ queryKey: ['inventory-movements'] }); };
  const receive = useMutation({
    mutationFn: () => post('/staff/inventory/receipts', { ingredientId: selected, quantity: Number(qty), unitCost: Number(unitCost), supplierName: supplier, documentNumber: invoice, note }),
    onSuccess: () => { refresh(); setSuccess('Đã nhập kho và lưu giá vốn, người nhập, thời gian vào SQL Server.'); setQty(''); setUnitCost(''); setInvoice(''); setNote(''); setTab('history'); setPage(1); }
  });
  const adjust = useMutation({
    mutationFn: () => post('/staff/inventory/adjust', { ingredientId: selected, delta: Number(changeQty), reason: changeReason }),
    onSuccess: () => { refresh(); setSuccess('Đã lưu điều chỉnh tồn kho và nhật ký.'); setChangeQty(''); setChangeReason(''); setTab('history'); setPage(1); }
  });
  const create = useMutation({
    mutationFn: () => post('/staff/ingredients', { code: newCode, name: newName, unit: newUnit, minimumStock: Number(newMinimum) }),
    onSuccess: () => { refresh(); setSuccess('Đã tạo nguyên liệu mới. Chuyển sang Nhập hàng để thêm số lượng và giá vốn.'); setNewCode(''); setNewName(''); setTab('receive'); }
  });
  const selectedItem = ingredients.data?.find(x => x.id === selected);
  const stockSummary = ingredients.data ?? [];
  const totalCost = Number(qty || 0) * Number(unitCost || 0);
  const error = ingredients.error || history.error || receive.error || adjust.error || create.error;
  const resetFilters = () => { setFilterIngredient(''); setFilterType(''); setDateFrom(''); setDateTo(''); setPage(1); };
  return <div className="inv-page">
    <PageTitle eyebrow="QUẢN LÝ KHO THỰC TẾ" title="Nhập nguyên liệu & lịch sử kho"
      desc="Nhập hàng theo số lượng và giá mua; lưu đầy đủ nhà cung cấp, chứng từ và tài khoản thực hiện." />
    <ErrorText error={error}/>{success && <div className="info-banner" role="status">{success}</div>}
    <div className="inv-metrics">
      <div><Archive size={21}/><span>Nguyên liệu đang theo dõi</span><strong>{stockSummary.length}</strong></div>
      <div><TrendingDown size={21}/><span>Nguyên liệu sắp hết</span><strong>{stockSummary.filter(x => x.low).length}</strong></div>
      <div><Coins size={21}/><span>Chi phí nhập theo bộ lọc</span><strong>{money(history.data?.receiptCost ?? 0)}</strong></div>
    </div>
    <div className="inv-tabs" role="tablist" aria-label="Quản lý kho">
      <button className={tab === 'receive' ? 'active' : ''} onClick={() => setTab('receive')}><PackagePlus size={17}/> Nhập hàng</button>
      <button className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}><ClipboardList size={17}/> Lịch sử nhập/xuất</button>
      <button className={tab === 'adjust' ? 'active' : ''} onClick={() => setTab('adjust')}><RefreshCcw size={17}/> Kiểm kê / xuất</button>
      <button className={tab === 'create' ? 'active' : ''} onClick={() => setTab('create')}><Plus size={17}/> Thêm nguyên liệu</button>
    </div>
    {tab === 'receive' && <div className="panel inv-form-panel">
      <div className="section-title"><h2>Phiếu nhập nguyên liệu</h2><p>Giá tiền tính cho 1 đơn vị đang lưu trong kho.</p></div>
      <form onSubmit={e => { e.preventDefault(); setSuccess(''); receive.mutate(); }}>
        <div className="inv-fields">
          <label>Nguyên liệu<select required value={selected} onChange={e => setSelected(e.target.value)}><option value="">Chọn nguyên liệu</option>{stockSummary.map(x => <option key={x.id} value={x.id}>{x.name} ({x.unit})</option>)}</select></label>
          <label>Số lượng nhập ({selectedItem?.unit || 'đơn vị'})<input required type="number" step="0.001" min="0.001" value={qty} onChange={e => setQty(e.target.value)} placeholder="Ví dụ: 5000"/></label>
          <label>Đơn giá (VNĐ/{selectedItem?.unit || 'đơn vị'})<input required type="number" step="0.0001" min="0" value={unitCost} onChange={e => setUnitCost(e.target.value)} placeholder="Ví dụ: 180"/></label>
          <label>Nhà cung cấp<input maxLength={160} value={supplier} onChange={e => setSupplier(e.target.value)} placeholder="Tên cửa hàng / nhà cung cấp"/></label>
          <label>Mã hóa đơn / chứng từ<input maxLength={80} value={invoice} onChange={e => setInvoice(e.target.value)} placeholder="VD: HD-20261110-001"/></label>
          <label>Ghi chú<input maxLength={500} value={note} onChange={e => setNote(e.target.value)} placeholder="Nhập mới, hàng giao buổi sáng..."/></label>
        </div>
        <div className="inv-total"><div><span>Thành tiền phiếu nhập</span><strong>{money(Number.isFinite(totalCost) ? totalCost : 0)}</strong></div><small>Giá vốn của lần nhập này được lưu riêng, không cộng vào doanh thu.</small></div>
        <button className="btn btn-primary" disabled={receive.isPending || !selected || Number(qty) <= 0 || unitCost === '' || Number(unitCost) < 0} type="submit"><PackagePlus size={18}/> {receive.isPending ? 'Đang lưu...' : 'Lưu nhập kho vào SQL Server'}</button>
      </form>
      <div className="inv-helper">Ví dụ: kho lưu <b>g</b>, nhập 5 kg cà phê thì nhập <b>5.000 g</b>, giá 180.000đ/kg tương đương <b>180đ/g</b> → thành tiền 900.000đ.</div>
    </div>}
    {tab === 'history' && <div className="panel inv-form-panel">
      <div className="section-title"><h2>Lịch sử nhập / xuất nguyên liệu</h2><p>Mọi giao dịch được lấy trực tiếp từ SQL Server, mới nhất lên đầu.</p></div>
      <div className="inv-filter">
        <label>Nguyên liệu<select value={filterIngredient} onChange={e => { setFilterIngredient(e.target.value); setPage(1); }}><option value="">Tất cả</option>{stockSummary.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
        <label>Loại giao dịch<select value={filterType} onChange={e => { setFilterType(e.target.value); setPage(1); }}><option value="">Tất cả</option><option value="Receipt">Nhập hàng có giá</option><option value="Adjustment">Kiểm kê / điều chỉnh</option></select></label>
        <label>Từ ngày<input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1); }}/></label>
        <label>Đến ngày<input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1); }}/></label>
        <button className="btn btn-outline" onClick={resetFilters} type="button"><Search size={16}/> Xóa lọc</button>
      </div>
      <div className="inv-history-meta"><b>{history.data?.totalCount ?? 0} giao dịch</b><span>Chi phí nhập hàng trong bộ lọc: <strong>{money(history.data?.receiptCost ?? 0)}</strong></span></div>
      <div className="table-responsive"><table className="data-table inv-table"><thead><tr><th>Thời gian</th><th>Nguyên liệu</th><th>Loại</th><th>Số lượng</th><th>Đơn giá</th><th>Thành tiền</th><th>Nhà cung cấp / chứng từ</th><th>Người nhập</th></tr></thead><tbody>
        {history.data?.items.map(x => <tr key={x.id}><td>{when(x.createdAt)}</td><td><b>{x.ingredientName}</b><small>{x.reason}</small></td><td><span className={x.movementType === 'Receipt' ? 'inv-pill inv-in' : 'inv-pill'}>{x.movementType === 'Receipt' ? 'Nhập hàng' : 'Điều chỉnh'}</span></td><td className={x.quantityDelta >= 0 ? 'inv-positive' : 'inv-negative'}>{x.quantityDelta > 0 ? '+' : ''}{formatQty(x.quantityDelta)} {x.unit}</td><td>{x.unitCost == null ? '—' : money(x.unitCost)}</td><td><b>{x.totalCost == null ? '—' : money(x.totalCost)}</b></td><td>{x.supplierName || '—'}<small>{x.documentNumber || ''}</small></td><td>{x.actorName || 'Không rõ'}</td></tr>)}
        {!history.isLoading && !history.data?.items.length && <tr><td colSpan={8}>Không có lịch sử trong khoảng đã chọn.</td></tr>}
      </tbody></table></div>
      <div className="inv-pagination"><span>Trang {page} / {Math.max(1, Math.ceil((history.data?.totalCount ?? 0) / 30))}</span><button className="btn btn-outline" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Trước</button><button className="btn btn-outline" disabled={page * 30 >= (history.data?.totalCount ?? 0)} onClick={() => setPage(p => p + 1)}>Sau</button></div>
    </div>}
    {tab === 'adjust' && <div className="panel inv-form-panel"><div className="section-title"><h2>Kiểm kê / xuất kho</h2><p>Giảm số lượng dùng dấu âm. Không cho phép xuất vượt tồn kho.</p></div>
      <form onSubmit={e => { e.preventDefault(); setSuccess(''); adjust.mutate(); }}>
        <div className="inv-fields"><label>Nguyên liệu<select required value={selected} onChange={e => setSelected(e.target.value)}><option value="">Chọn nguyên liệu</option>{stockSummary.map(x => <option key={x.id} value={x.id}>{x.name} · tồn {formatQty(x.onHand)} {x.unit}</option>)}</select></label>
        <label>Thay đổi số lượng<input required type="number" step="0.001" value={changeQty} onChange={e => setChangeQty(e.target.value)} placeholder="VD: -200 (hao hụt)"/></label>
        <label>Lý do<input required maxLength={500} value={changeReason} onChange={e => setChangeReason(e.target.value)} placeholder="Hỏng, kiểm kê, xuất nội bộ..."/></label></div>
        <button className="btn btn-primary" type="submit" disabled={adjust.isPending || !selected || Number(changeQty) === 0 || !changeReason.trim()}>Lưu điều chỉnh</button>
      </form><div className="inv-helper">Nhập mua mới có giá phải thực hiện ở tab <b>Nhập hàng</b> để lưu đầy đủ chi phí. Điều chỉnh kho không tự ghi chi phí mua.</div>
    </div>}
    {tab === 'create' && <div className="panel inv-form-panel"><div className="section-title"><h2>Thêm nguyên liệu thật</h2><p>Danh mục nguyên liệu lưu trong bảng Ingredients.</p></div>
      <form onSubmit={e => { e.preventDefault(); setSuccess(''); create.mutate(); }}><div className="inv-fields"><label>Mã nguyên liệu<input required maxLength={25} value={newCode} onChange={e => setNewCode(e.target.value)} placeholder="VD: SYRUP-DAO"/></label><label>Tên nguyên liệu<input required maxLength={120} value={newName} onChange={e => setNewName(e.target.value)} placeholder="Siro đào"/></label><label>Đơn vị<select value={newUnit} onChange={e => setNewUnit(e.target.value)}><option value="g">g</option><option value="kg">kg</option><option value="ml">ml</option><option value="l">l</option><option value="chai">chai</option><option value="hộp">hộp</option><option value="cái">cái</option></select></label><label>Cảnh báo dưới mức<input required type="number" min="0" step="0.001" value={newMinimum} onChange={e => setNewMinimum(e.target.value)}/></label></div><button className="btn btn-primary" type="submit" disabled={create.isPending || !newCode.trim() || !newName.trim()}><Plus size={17}/> Tạo nguyên liệu</button></form>
    </div>}
    <div className="panel inv-form-panel"><div className="section-title"><h2>Đang có trong kho</h2><p>Tồn hiện tại; số tiền nhập kho chỉ ghi nhận từ phiếu mua có giá.</p></div><div className="inv-stock-grid">{stockSummary.map(x => <div key={x.id} className="inv-stock-item"><span>{x.code}</span><b>{x.name}</b><strong>{formatQty(x.onHand)} {x.unit}</strong><small className={x.low ? 'inv-negative' : ''}>{x.low ? 'Sắp hết' : 'Đủ hàng'} · Tối thiểu {formatQty(x.minimumStock)} {x.unit}</small></div>)}</div></div>
  </div>;
}
