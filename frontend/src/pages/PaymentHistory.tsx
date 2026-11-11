import { useCallback, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Banknote, ReceiptText } from 'lucide-react';
import { api, money, when } from '../lib/api';
import { Empty, ErrorText, PageTitle } from '../components/Layout';
import OrderDetailModal from '../components/OrderDetailModal';
import './OrderHistory.css';

type Row = { id: string; amount: number; referenceCode: string; method: string; collectedAt: string; orderNumber: string; table: string };
type Response = { items: Row[]; totalCount: number; totalCollected: number; page: number; pageSize: number };
export default function PaymentHistory() {
  const [params, setParams] = useSearchParams();
  const days = params.get('days') !== null && [0, 1, 7, 30, 90].includes(Number(params.get('days'))) ? Number(params.get('days')) : 7;
  const page = Math.max(1, Math.min(10000, Number(params.get('page')) || 1));
  const [openedOrder, setOpenedOrder] = useState<string | null>(null);
  const closeDetail = useCallback(() => setOpenedOrder(null), []);
  function change(patch: Record<string, string>) {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => next.set(k, v));
    if (!Object.hasOwn(patch, 'page')) next.delete('page');
    setParams(next);
  }
  const { data, error, isLoading } = useQuery({
    queryKey: ['payment-history', days, page],
    queryFn: () => api<Response>(`/staff/payment-history?days=${days}&page=${page}`),
    refetchInterval: 30_000
  });
  const totalPages = Math.max(1, Math.ceil((data?.totalCount ?? 0) / (data?.pageSize ?? 20)));
  return <>
    <PageTitle eyebrow="LỊCH SỬ GIAO DỊCH THỰC" title="Lịch sử thu tiền"
      desc="Tra cứu các khoản tiền thực đã phân bổ cho từng đơn; giao dịch DEMO không có trong danh sách."
      action={<Link className="history-back-link" to="/admin/reports"><ArrowLeft size={16}/> Về báo cáo</Link>}/>
    <div className="history-payment-summary"><span><Banknote size={20}/> Tổng tiền thực đã thu trong kỳ</span><strong>{money(data?.totalCollected ?? 0)}</strong></div>
    <div className="history-toolbar"><div className="history-hint">Một giao dịch có thể thanh toán nhiều đơn; mỗi dòng là khoản phân bổ cho một đơn.</div>
      <div className="history-selects"><select aria-label="Khoảng thời gian thanh toán" value={days} onChange={e => change({ days: e.target.value })}>
        <option value={1}>Hôm nay</option><option value={7}>7 ngày qua</option><option value={30}>30 ngày qua</option><option value={90}>90 ngày qua</option><option value={0}>Mọi thời gian</option>
      </select></div>
    </div>
    <ErrorText error={error}/>
    <section className="history-list-panel"><div className="history-list-heading"><h2><ReceiptText size={19}/> Giao dịch đã ghi nhận</h2><span>{isLoading ? 'Đang tải...' : `${data?.totalCount ?? 0} phân bổ`}</span></div>
      <div className="history-list">
        {data?.items.map(item => <button type="button" className="history-order-row" key={item.id} onClick={() => setOpenedOrder(item.orderNumber)}>
          <span className="history-order-primary"><strong>{item.orderNumber}</strong><small>{when(item.collectedAt)} · {item.table}</small></span>
          <span className="history-payment-method">{item.method === 'Cash' ? 'Tiền mặt' : item.method}<small>{item.referenceCode}</small></span>
          <span className="history-order-total">{money(item.amount)}</span><ArrowRight size={17} className="history-order-arrow"/>
        </button>)}
        {!isLoading && !data?.items.length && !error && <Empty message="Chưa có khoản thu thực tế trong kỳ này."/>}
      </div>
      <div className="history-pager"><button disabled={page <= 1} onClick={() => change({ page: String(page - 1) })}>Trang trước</button><span>Trang {page}/{totalPages}</span><button disabled={page >= totalPages} onClick={() => change({ page: String(page + 1) })}>Trang sau</button></div>
    </section>
    <OrderDetailModal orderNumber={openedOrder} onClose={closeDetail}/>
  </>;
}
