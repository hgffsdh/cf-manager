import { useCallback, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, ClipboardList, Search, SlidersHorizontal } from 'lucide-react';
import { api, money, when } from '../lib/api';
import { Empty, ErrorText, PageTitle, Status } from '../components/Layout';
import OrderDetailModal from '../components/OrderDetailModal';
import './OrderHistory.css';

type HistoryOrder = {
  id: string; orderNumber: string; createdAt: string; totalAmount: number; isDemo: boolean;
  acceptanceStatus: string; fulfillmentStatus: string; paymentStatus: string; paymentMethod: string;
  table: string; itemCount: number;
};
type PagedHistory = { items: HistoryOrder[]; totalCount: number; page: number; pageSize: number };
const validStatuses = ['all', 'completed', 'ready', 'served', 'paid', 'unpaid', 'pending', 'rejected'];
const filters = [
  { value: 'completed', label: 'Đơn đã làm' },
  { value: 'all', label: 'Tất cả' },
  { value: 'ready', label: 'Sẵn sàng' },
  { value: 'served', label: 'Đã phục vụ' },
  { value: 'paid', label: 'Đã thanh toán' },
  { value: 'unpaid', label: 'Chưa thanh toán' },
  { value: 'pending', label: 'Chờ nhận' },
  { value: 'rejected', label: 'Đã từ chối' }
];

export default function OrderHistory() {
  const [params, setParams] = useSearchParams();
  const rawStatus = params.get('status') ?? 'completed';
  const status = validStatuses.includes(rawStatus) ? rawStatus : 'completed';
  const source = 'real';
  const days = [0, 1, 7, 30, 90].includes(Number(params.get('days'))) ? Number(params.get('days')) : 0;
  const page = Math.max(1, Math.min(10000, Number(params.get('page')) || 1));
  const search = params.get('order') ?? '';
  const [searchInput, setSearchInput] = useState(search);
  const [openedOrder, setOpenedOrder] = useState<string | null>(null);
  const closeDetail = useCallback(() => setOpenedOrder(null), []);

  useEffect(() => setSearchInput(search), [search]);
  function change(patch: Record<string, string>) {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([key, value]) => { if (!value) next.delete(key); else next.set(key, value); });
    if (!Object.hasOwn(patch, 'page')) next.delete('page');
    setParams(next);
  }
  const { data, error, isLoading } = useQuery({
    queryKey: ['order-history', status, source, days, page, search],
    queryFn: () => api<PagedHistory>(`/staff/order-history?${new URLSearchParams({ status, source, days: String(days), page: String(page), search })}`),
    refetchInterval: 30_000
  });
  const totalPages = Math.max(1, Math.ceil((data?.totalCount ?? 0) / (data?.pageSize ?? 20)));

  return <>
    <PageTitle eyebrow="LỊCH SỬ VẬN HÀNH" title="Lịch sử đơn hàng"
      desc="Xem đơn đã làm, đã phục vụ, đã thanh toán và toàn bộ món khách gọi. Bấm vào một đơn để xem phiếu chi tiết."
      action={<Link className="history-back-link" to="/admin/reports"><ArrowLeft size={16}/> Về báo cáo</Link>}/>
    <div className="history-toolbar">
      <form className="history-search" onSubmit={e => { e.preventDefault(); change({ order: searchInput.trim() }); }}>
        <Search size={17}/><input aria-label="Tìm mã đơn hoặc bàn" placeholder="Tìm mã đơn, tên bàn..." value={searchInput} onChange={e => setSearchInput(e.target.value)}/>
        <button type="submit">Tìm</button>
      </form>
      <div className="history-selects"><SlidersHorizontal size={16}/>

        <select aria-label="Khoảng thời gian" value={days} onChange={e => change({ days: e.target.value })}>
          <option value={0}>Mọi thời gian</option><option value={1}>Hôm nay</option><option value={7}>7 ngày qua</option><option value={30}>30 ngày qua</option><option value={90}>90 ngày qua</option>
        </select>
      </div>
    </div>
    <div className="history-tabs" aria-label="Lọc trạng thái đơn">{filters.map(f =>
      <button key={f.value} type="button" className={f.value === status ? 'is-current' : ''} onClick={() => change({ status: f.value })}>{f.label}</button>
    )}</div>
    <div className="history-hint">Lịch sử đơn phát sinh thực tế. Dữ liệu thử nghiệm trước đây vẫn được giữ trong SQL Server nhưng không đưa vào báo cáo.</div>
    <ErrorText error={error}/>
    <section className="history-list-panel">
      <div className="history-list-heading"><h2><ClipboardList size={19}/> Danh sách đơn hàng</h2><span>{isLoading ? 'Đang tải...' : `${data?.totalCount ?? 0} đơn`}</span></div>
      <div className="history-list">
        {data?.items.map(order => <button type="button" className="history-order-row" key={order.id} onClick={() => setOpenedOrder(order.orderNumber)}>
          <span className="history-order-primary"><strong>{order.orderNumber}</strong><small>{when(order.createdAt)} · {order.table}</small></span>
          <span className="history-order-count">{order.itemCount} phần</span>
          <span className="history-order-tags"><Status value={order.fulfillmentStatus}/><Status value={order.paymentStatus}/>{order.isDemo && <span className="demo-tag">DEMO</span>}</span>
          <span className="history-order-total">{money(order.totalAmount)}</span><ArrowRight size={17} className="history-order-arrow"/>
        </button>)}
        {!isLoading && !data?.items.length && !error && <Empty message="Không tìm thấy đơn nào theo bộ lọc này."/>}
      </div>
      <div className="history-pager">
        <button type="button" disabled={page <= 1} onClick={() => change({ page: String(page - 1) })}>Trang trước</button>
        <span>Trang {page}/{totalPages}</span>
        <button type="button" disabled={page >= totalPages} onClick={() => change({ page: String(page + 1) })}>Trang sau</button>
      </div>
    </section>
    <OrderDetailModal orderNumber={openedOrder} onClose={closeDetail}/>
  </>;
}
