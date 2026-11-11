import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Clock3, Printer, ReceiptText, X } from 'lucide-react';
import { api, money, when } from '../lib/api';
import { ErrorText, Status } from './Layout';
import './OrderDetailModal.css';

type Modifier = { name: string; unitPrice: number };
type OrderItem = {
  id: string; productName: string; variantName: string; unitPrice: number; lineTotal: number;
  quantity: number; readyQuantity: number; servedQuantity: number; note: string; modifiers: Modifier[];
};
type OrderDetail = {
  id: string; orderNumber: string; createdAt: string; acceptedAt: string | null;
  acceptanceStatus: string; fulfillmentStatus: string; paymentStatus: string; paymentMethod: string;
  source: string; note: string; isDemo: boolean; subtotal: number; totalAmount: number;
  table: string; area: string; items: OrderItem[];
};
type PaymentLine = { amount: number; method: string; referenceCode: string; collectedAt: string; isDemo: boolean };
type DetailResponse = { order: OrderDetail; payments: PaymentLine[] };

const paymentMethod = (value: string) =>
  value === 'Cash' ? 'Tiền mặt' : value === 'BankTransfer' ? 'Chuyển khoản ngân hàng (đã đối soát)' : value === 'BankDemo' ? 'Chuyển khoản thử nghiệm cũ' : value;

export default function OrderDetailModal({ orderNumber, onClose }: { orderNumber: string | null; onClose: () => void }) {
  const closeButton = useRef<HTMLButtonElement>(null);
  const { data, error, isLoading } = useQuery({
    queryKey: ['order-detail', orderNumber],
    queryFn: () => api<DetailResponse>(`/staff/order-history/detail/${encodeURIComponent(orderNumber!)}`),
    enabled: Boolean(orderNumber),
    staleTime: 5_000
  });

  useEffect(() => {
    if (!orderNumber) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    closeButton.current?.focus();
    const before = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = before; };
  }, [orderNumber, onClose]);

  if (!orderNumber) return null;
  const order = data?.order;
  const collected = data?.payments.reduce((sum, payment) => sum + payment.amount, 0) ?? 0;
  const owed = order ? Math.max(0, order.totalAmount - collected) : 0;

  return <div className="order-detail-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="order-detail-dialog" role="dialog" aria-modal="true" aria-label={`Chi tiết đơn hàng ${orderNumber}`}>
      <header className="order-detail-header">
        <div className="order-detail-heading"><span><ReceiptText size={18}/> PHIẾU CHI TIẾT ĐƠN HÀNG</span><h2>{orderNumber}</h2></div>
        <button className="order-detail-close" type="button" ref={closeButton} onClick={onClose} title="Thu nhỏ / Đóng (Esc)" aria-label="Đóng chi tiết đơn"><X size={22}/></button>
      </header>
      <div className="order-detail-body">
        {isLoading && <div className="order-detail-loading">Đang tải chi tiết từ SQL Server...</div>}
        <ErrorText error={error}/>
        {order && <>
          <div className="order-detail-badges"><Status value={order.fulfillmentStatus}/><Status value={order.paymentStatus}/>{order.isDemo && <span className="demo-tag">DEMO</span>}</div>
          <div className="order-detail-facts">
            <div><small>Vị trí phục vụ</small><strong>{order.table}</strong><span>{order.area}</span></div>
            <div><small>Thời gian gọi</small><strong>{when(order.createdAt)}</strong><span>Nguồn: {order.source}</span></div>
            <div><small>Thanh toán</small><strong>{paymentMethod(order.paymentMethod)}</strong><span>{order.acceptanceStatus === 'Rejected' ? 'Đơn bị từ chối' : 'Đơn đặt tại quán'}</span></div>
          </div>
          <div className="order-detail-section-title"><span>Món khách đã đặt</span><span>{order.items.reduce((n, i) => n + i.quantity, 0)} phần</span></div>
          <div className="order-detail-lines">
            {order.items.map(i => <div className="order-detail-item" key={i.id}>
              <div className="order-detail-item-main"><strong><span className="order-detail-qty">{i.quantity}×</span> {i.productName}</strong><b>{money(i.lineTotal)}</b></div>
              {i.variantName && <div className="order-detail-sub">Size: {i.variantName}</div>}
              {i.modifiers.length > 0 && <div className="order-detail-sub">Topping: {i.modifiers.map(m => `${m.name}${m.unitPrice ? ` (+${money(m.unitPrice)})` : ''}`).join(', ')}</div>}
              {i.note && <div className="order-detail-sub">Ghi chú: {i.note}</div>}
              <div className="order-detail-progress"><CheckCircle2 size={13}/> Đã làm {i.readyQuantity}/{i.quantity} · Đã mang ra {i.servedQuantity}/{i.quantity}</div>
            </div>)}
          </div>
          {order.note && <div className="order-detail-general-note">Ghi chú chung: {order.note}</div>}
          <div className="order-detail-totals"><div><span>Tạm tính</span><b>{money(order.subtotal)}</b></div><div className="order-detail-grand"><span>Tổng đơn</span><strong>{money(order.totalAmount)}</strong></div><div><span>Đã ghi nhận thu</span><b>{money(collected)}</b></div><div><span>Còn phải thu</span><b>{money(owed)}</b></div></div>
          {data && data.payments.length > 0 && <div className="order-detail-payments"><h3>Lịch sử thu tiền</h3>{data.payments.map(p => <div key={p.referenceCode}><span>{paymentMethod(p.method)} · {when(p.collectedAt)}<small>{p.referenceCode}</small></span><strong>{money(p.amount)}</strong></div>)}</div>}
          {data && data.payments.length === 0 && <div className="order-detail-awaiting"><Clock3 size={16}/> Chưa có giao dịch thanh toán được ghi nhận cho đơn này.</div>}
          <p className="order-detail-legal">Phiếu tra cứu nội bộ theo dữ liệu hệ thống, không thay thế hóa đơn thuế/VAT.</p>
        </>}
      </div>
      <footer className="order-detail-footer">
        <button type="button" className="order-detail-secondary" onClick={onClose}>Thu nhỏ lại</button>
        <button type="button" className="order-detail-print" onClick={() => window.print()} disabled={!order}><Printer size={17}/> In phiếu</button>
      </footer>
    </section>
  </div>;
}
