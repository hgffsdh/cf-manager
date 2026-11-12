import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, CalendarDays, ChevronDown, ChevronRight, ClipboardList, Search, ShoppingBag } from 'lucide-react';
import { api, money, when } from '../lib/api';
import { Empty, ErrorText, PageTitle, Status } from '../components/Layout';
import OrderDetailModal from '../components/OrderDetailModal';
import './OrderHistory.css';
import './OrderHistoryByDay.css';

type HistoryOrder = {
  id: string; orderNumber: string; createdAt: string; servedAt?: string | null;
  totalAmount: number; isDemo: boolean; acceptanceStatus: string;
  fulfillmentStatus: string; paymentStatus: string; paymentMethod: string;
  table: string; itemCount: number; isEstimated?: boolean;
};
type PagedHistory = { items: HistoryOrder[]; totalCount: number; page: number; pageSize: number };
type ServedDay = {
  date: string; orderCount: number; portions: number;
  totalAmount: number; estimatedCount: number;
};
const filters = [
  { value: 'completed', label: 'Đã mang ra · Theo ngày' },
  { value: 'all', label: 'Tất cả đơn' },
  { value: 'ready', label: 'Đang chờ mang' },
  { value: 'paid', label: 'Đã thanh toán' },
  { value: 'unpaid', label: 'Chưa thanh toán' },
  { value: 'pending', label: 'Chờ nhận' },
  { value: 'rejected', label: 'Đã từ chối' }
];
const allowed = new Set([...filters.map(f => f.value), 'served']);

function dateLabel(iso: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return iso;
  return `${match[3]}/${match[2]}/${match[1]}`;
}
function OrderRow({ order, onOpen }: { order: HistoryOrder; onOpen: (code: string) => void }) {
  return <button type="button" className="history-order-row" onClick={() => onOpen(order.orderNumber)}>
    <span className="history-order-primary"><strong>{order.orderNumber}</strong><small>{when(order.createdAt)} · {order.table}</small></span>
    <span className="history-order-count">{order.itemCount} phần</span>
    <span className="history-order-tags"><Status value={order.fulfillmentStatus}/><Status value={order.paymentStatus}/>{order.isDemo && <span className="demo-tag">DEMO</span>}</span>
    <span className="history-order-total">{money(order.totalAmount)}</span><ArrowRight size={17} className="history-order-arrow"/>
  </button>;
}

function ServedDayOrders({ date, onOpen }: { date: string; onOpen: (code: string) => void }) {
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [date]);
  const { data, error, isLoading } = useQuery({
    queryKey: ['history-served-day', date, page],
    queryFn: () => api<PagedHistory>(`/staff/order-history/served-day?date=${encodeURIComponent(date)}&page=${page}`),
    refetchInterval: 15_000,
  });
  const maxPage = Math.max(1, Math.ceil((data?.totalCount ?? 0) / (data?.pageSize ?? 20)));
  return <div className="moc-day-orders" onClick={e => e.stopPropagation()}>
    <ErrorText error={error}/>
    {isLoading && <p className="moc-day-loading">Đang tải đơn đã phục vụ...</p>}
    {data?.items.map(item => <OrderRow order={item} key={item.id} onOpen={onOpen}/>)}
    {!isLoading && !error && !data?.items.length && <Empty message="Chưa có đơn hoàn thành trong ngày này."/>}
    {maxPage > 1 && <div className="history-pager">
      <button type="button" disabled={page <= 1} onClick={() => setPage(v => v - 1)}>Trang trước</button>
      <span>Trang {page}/{maxPage}</span>
      <button type="button" disabled={page >= maxPage} onClick={() => setPage(v => v + 1)}>Trang sau</button>
    </div>}
  </div>;
}

export default function OrderHistory() {
  const [params, setParams] = useSearchParams();
  const rawStatus = params.get('status') ?? 'completed';
  const status = allowed.has(rawStatus) ? rawStatus : 'completed';
  const isDaily = status === 'completed' || status === 'served';
  const selectedDay = params.get('date');
  const page = Math.max(1, Math.min(10000, Number(params.get('page')) || 1));
  const days = [0, 1, 7, 30, 90].includes(Number(params.get('days'))) ? Number(params.get('days')) : 0;
  const search = params.get('order') ?? '';
  const [searchInput, setSearchInput] = useState(search);
  const [month, setMonth] = useState('');
  const [openedOrder, setOpenedOrder] = useState<string | null>(null);
  const closeDetail = useCallback(() => setOpenedOrder(null), []);
  useEffect(() => setSearchInput(search), [search]);
  function change(patch: Record<string, string>) {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([key, value]) => value ? next.set(key, value) : next.delete(key));
    if (!Object.prototype.hasOwnProperty.call(patch, 'page')) next.delete('page');
    setParams(next);
  }
  const { data: servedDays, error: daysError, isLoading: daysLoading } = useQuery({
    queryKey: ['history-served-days'],
    queryFn: () => api<ServedDay[]>('/staff/order-history/served-days'),
    enabled: isDaily,
    refetchInterval: 15_000,
  });
  const { data: otherHistory, error: otherError, isLoading: otherLoading } = useQuery({
    queryKey: ['order-history', status, days, page, search],
    queryFn: () => api<PagedHistory>(`/staff/order-history?${new URLSearchParams({ status, source: 'real', days: String(days), page: String(page), search })}`),
    enabled: !isDaily,
    refetchInterval: 30_000,
  });
  const displayDays = useMemo(() => (servedDays ?? []).filter(x => !month || x.date.slice(0, 7) === month), [servedDays, month]);
  const totalPages = Math.max(1, Math.ceil((otherHistory?.totalCount ?? 0) / (otherHistory?.pageSize ?? 20)));
  const totalOrders = displayDays.reduce((sum, d) => sum + d.orderCount, 0);
  const totalPortions = displayDays.reduce((sum, d) => sum + d.portions, 0);
  return <>
    <PageTitle eyebrow="LỊCH SỬ VẬN HÀNH" title="Lịch sử đơn hàng" desc="Đơn được gom theo ngày mang hết món ra bàn. Chọn ngày, rồi chọn đơn để xem đầy đủ chi tiết." action={<Link className="history-back-link" to="/admin/orders"><ArrowLeft size={16}/> Về đơn hàng</Link>}/>
    <div className="history-tabs" aria-label="Lọc trạng thái đơn">{filters.map(f =>
      <button key={f.value} type="button" className={f.value === status || (status === 'served' && f.value === 'completed') ? 'is-current' : ''} onClick={() => change({ status: f.value, date: '', page: '' })}>{f.label}</button>
    )}</div>
    {isDaily ? <>
      <div className="moc-history-summary">
        <div><CalendarDays size={19}/><span>Ngày có đơn đã mang hết</span><strong>{displayDays.length}</strong></div>
        <div><ClipboardList size={19}/><span>Đơn đã phục vụ</span><strong>{totalOrders}</strong></div>
        <div><ShoppingBag size={19}/><span>Tổng số phần</span><strong>{totalPortions}</strong></div>
      </div>
      <div className="moc-history-month">
        <label htmlFor="historyMonth">Lọc theo tháng</label>
        <input id="historyMonth" type="month" value={month} onChange={e => { setMonth(e.target.value); change({date: ''}); }}/>
        {month && <button type="button" onClick={() => setMonth('')}>Xóa lọc</button>}
      </div>
      <p className="history-hint">Ngày được tính theo giờ Việt Nam (UTC+7). Đơn chưa mang đủ các món sẽ không xuất hiện trong mục này.</p>
      <ErrorText error={daysError}/>
      {daysLoading && <p className="moc-day-loading">Đang tổng hợp lịch sử theo ngày...</p>}
      <div className="moc-day-list">{displayDays.map(day => {
        const isOpen = selectedDay === day.date;
        return <section className={`moc-day-card ${isOpen ? 'moc-day-card-open' : ''}`} key={day.date}>
          <button type="button" className="moc-day-trigger" aria-expanded={isOpen} onClick={() => change({ date: isOpen ? '' : day.date })}>
            <span className="moc-day-icon"><CalendarDays size={21}/></span>
            <span className="moc-day-title"><strong>Ngày {dateLabel(day.date)}</strong><small>{day.orderCount} đơn · {day.portions} phần đã mang ra</small></span>
            <span className="moc-day-total">{money(day.totalAmount)}</span>
            {isOpen ? <ChevronDown size={19}/> : <ChevronRight size={19}/>}
          </button>
          {day.estimatedCount > 0 && <p className="moc-day-note">{day.estimatedCount} đơn lịch sử cũ chưa lưu thời gian phục vụ; đang tạm xếp theo ngày đặt đơn.</p>}
          {isOpen && <ServedDayOrders date={day.date} onOpen={setOpenedOrder}/>}
        </section>;
      })}</div>
      {!daysLoading && !daysError && displayDays.length === 0 && <Empty message="Chưa có đơn đã mang hết trong khoảng thời gian này."/>}
    </> : <>
      <div className="history-toolbar">
        <form className="history-search" onSubmit={e => { e.preventDefault(); change({ order: searchInput.trim() }); }}>
          <Search size={17}/><input aria-label="Tìm mã đơn hoặc bàn" placeholder="Tìm mã đơn, tên bàn..." value={searchInput} onChange={e => setSearchInput(e.target.value)}/><button type="submit">Tìm</button>
        </form>
        <div className="history-selects"><select aria-label="Khoảng thời gian" value={days} onChange={e => change({ days: e.target.value })}>
          <option value={0}>Mọi thời gian</option><option value={1}>Hôm nay</option><option value={7}>7 ngày qua</option><option value={30}>30 ngày qua</option><option value={90}>90 ngày qua</option>
        </select></div>
      </div>
      <ErrorText error={otherError}/>
      <section className="history-list-panel">
        <div className="history-list-heading"><h2><ClipboardList size={19}/> Danh sách đơn hàng</h2><span>{otherLoading ? 'Đang tải...' : `${otherHistory?.totalCount ?? 0} đơn`}</span></div>
        <div className="history-list">{otherHistory?.items.map(order => <OrderRow order={order} key={order.id} onOpen={setOpenedOrder}/>)}
          {!otherLoading && !otherError && !otherHistory?.items.length && <Empty message="Không tìm thấy đơn nào theo bộ lọc này."/>}</div>
        <div className="history-pager"><button type="button" disabled={page <= 1} onClick={() => change({page:String(page-1)})}>Trang trước</button><span>Trang {page}/{totalPages}</span><button type="button" disabled={page >= totalPages} onClick={() => change({page:String(page+1)})}>Trang sau</button></div>
      </section>
    </>}
    <OrderDetailModal orderNumber={openedOrder} onClose={closeDetail}/>
  </>;
}
