import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createPortal } from 'react-dom';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Bell, BellRing, Check, CheckCircle2, ClipboardList, Clock3, RefreshCw, X } from 'lucide-react';
import { api, money, post, when } from '../lib/api';
import type { Order } from '../lib/api';
import './OrderNotifications.css';

type OrdersPage = { items: Order[]; totalCount: number; page: number; pageSize: number };

// Reuse the backend that already exists in MocCafe OS; do NOT invent notification data.
const pendingKey = ['moc-order-notifications', 'Pending'] as const;
function usePendingOrders() {
  return useQuery({
    queryKey: pendingKey,
    queryFn: () => api<OrdersPage>('/staff/orders?status=Pending&page=1'),
    // SignalR's existing useRealtime() invalidates this query immediately.
    // Polling is a backup if the WebSocket connection drops.
    refetchInterval: 12_000,
    refetchOnWindowFocus: true,
    staleTime: 1_000,
    retry: 1,
  });
}

function printableCount(n: number): string { return n > 99 ? '99+' : String(n); }

export function PendingOrderBadge() {
  const { data } = usePendingOrders();
  const n = data?.totalCount ?? 0;
  return n > 0 ? <span className="moc-order-badge" aria-label={`${n} đơn đang chờ xác nhận`}>{printableCount(n)}</span> : null;
}

export function OrderBell() {
  const navigate = useNavigate();
  const { data, error, isFetching, refetch } = usePendingOrders();
  const orders = data?.items ?? [];
  const total = data?.totalCount ?? 0;
  const [open, setOpen] = useState(false);
  const [toastOrder, setToastOrder] = useState<Order | null>(null);
  const seenIds = useRef<Set<string> | null>(null);
  const anchorRef = useRef<HTMLDivElement>(null);

  // First load displays all pending orders but does not bombard staff with old toasts.
  useEffect(() => {
    if (!data) return;
    const now = new Set(data.items.map(o => o.id));
    if (seenIds.current) {
      const added = data.items.find(o => !seenIds.current!.has(o.id));
      if (added) setToastOrder(added);
    }
    seenIds.current = now;
  }, [data]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (anchorRef.current && !anchorRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false); }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Hide a toast after it has been acknowledged or the corresponding order is no longer pending.
  useEffect(() => {
    if (!toastOrder || !data) return;
    if (!data.items.some(o => o.id === toastOrder.id)) setToastOrder(null);
  }, [data, toastOrder]);

  const openOrder = (order: Order) => {
    setOpen(false);
    setToastOrder(null);
    navigate(`/admin/orders?orderId=${encodeURIComponent(order.id)}`);
  };

  return <>
    <div className="moc-alert-anchor" ref={anchorRef}>
      <button type="button" className={`moc-alert-trigger${total ? ' moc-alert-has-new' : ''}`}
        title="Thông báo đơn hàng" aria-label={`Thông báo đơn hàng, ${total} đơn chờ xác nhận`}
        aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen(v => !v)}>
        {total ? <BellRing size={20} /> : <Bell size={20} />}
        {total > 0 && <span className="moc-alert-trigger-count">{printableCount(total)}</span>}
      </button>
      {open && <div className="moc-alert-popover" role="dialog" aria-label="Đơn hàng chờ xác nhận">
        <div className="moc-alert-popover-head">
          <div><strong>Thông báo đơn hàng</strong><small>{total ? `${total} đơn cần xác nhận` : 'Không có đơn chờ mới'}</small></div>
          <button className="moc-alert-icon-btn" type="button" title="Làm mới" aria-label="Làm mới" onClick={() => void refetch()} disabled={isFetching}><RefreshCw size={17}/></button>
        </div>
        {error && <p className="moc-alert-error">Không tải được đơn hàng: {error instanceof Error ? error.message : String(error)}. Kiểm tra quyền xem đơn/API.</p>}
        <div className="moc-alert-list">
          {!error && !orders.length && <div className="moc-alert-empty"><CheckCircle2 size={30}/><span>Đã xử lý hết đơn chờ!</span></div>}
          {orders.map(o => <button type="button" key={o.id} className="moc-alert-item" onClick={() => openOrder(o)}>
            <span className="moc-alert-item-dot" aria-hidden="true" />
            <span className="moc-alert-item-body">
              <strong>{o.table || 'Bàn/chòi'} · {o.orderNumber}</strong>
              <small>{o.items?.map(i => `${i.quantity}× ${i.productName}`).slice(0, 3).join(', ') || 'Đơn mới cần xác nhận'}</small>
              <em><Clock3 size={12}/>{when(o.createdAt)} · {money(o.totalAmount)}</em>
            </span>
            <span className="moc-alert-item-open">Xem</span>
          </button>)}
        </div>
        {total > orders.length && <div className="moc-alert-overflow">Đang hiển thị {orders.length}/{total} đơn mới nhất.</div>}
        <button type="button" className="moc-alert-view-all" onClick={() => { setOpen(false); navigate('/admin/orders'); }}>
          <ClipboardList size={17}/> Xem tất cả đơn hàng
        </button>
      </div>}
    </div>
    {toastOrder && createPortal(<div className="moc-alert-toast" role="status">
      <span className="moc-alert-toast-icon"><BellRing size={20}/></span>
      <div><strong>Đơn hàng mới từ {toastOrder.table || 'bàn/chòi'}</strong><small>{toastOrder.orderNumber} · {toastOrder.items?.reduce((n, i) => n + i.quantity, 0) ?? 0} món</small>
        <button type="button" onClick={() => openOrder(toastOrder)}>Xem chi tiết và xác nhận</button>
      </div>
      <button className="moc-alert-toast-close" type="button" aria-label="Đóng thông báo" onClick={() => setToastOrder(null)}><X size={17}/></button>
    </div>, document.body)}
  </>;
}

// The existing staff API has a paged list, not an order-by-ID endpoint.
// A freshly requested pending order is in page 1. For older deep links we scan the
// first pages instead of pretending the list API supports /orders/{id}.
async function findOrderById(id: string): Promise<Order | null> {
  const pending = await api<OrdersPage>('/staff/orders?status=Pending&page=1');
  const inPending = pending.items.find(o => o.id.toLowerCase() === id.toLowerCase());
  if (inPending) return inPending;

  let page = 1;
  let total = 1;
  while (page <= total && page <= 10) {
    const result = await api<OrdersPage>(`/staff/orders?page=${page}`);
    const found = result.items.find(o => o.id.toLowerCase() === id.toLowerCase());
    if (found) return found;
    total = Math.max(1, Math.ceil(result.totalCount / Math.max(1, result.pageSize || 30)));
    page++;
  }
  return null;
}

export function OrderDeepLink() {
  const [params, setParams] = useSearchParams();
  const orderId = params.get('orderId');
  const client = useQueryClient();
  const navigate = useNavigate();
  const [success, setSuccess] = useState('');
  const [actionError, setActionError] = useState('');
  const close = () => {
    const next = new URLSearchParams(params);
    next.delete('orderId');
    setParams(next, { replace: true });
    setActionError('');
    setSuccess('');
  };
  const { data: order, error, isPending, refetch } = useQuery({
    queryKey: ['moc-order-notification-detail', orderId],
    queryFn: () => findOrderById(orderId!),
    enabled: Boolean(orderId),
    staleTime: 2_000,
    retry: 1,
  });
  const accept = useMutation({
    mutationFn: (id: string) => post(`/staff/orders/${id}/accept`, {}),
    onSuccess: async () => {
      setActionError('');
      setSuccess('Đã xác nhận đơn thành công. Đã chuyển sang pha chế.');
      await Promise.all([
        client.invalidateQueries({ queryKey: ['orders'] }),
        client.invalidateQueries({ queryKey: pendingKey }),
        client.invalidateQueries({ queryKey: ['kitchen'] }),
        client.invalidateQueries({ queryKey: ['moc-order-notification-detail'] }),
      ]);
    },
    onError: (err) => {
      setActionError(err instanceof Error ? err.message : String(err));
      void refetch();
    },
  });

  useEffect(() => { setActionError(''); setSuccess(''); }, [orderId]);
  useEffect(() => {
    if (!orderId) return;
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') close(); }
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = previous; };
  // Only subscribe per modal opening. close() uses latest URL query when pressed.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  if (!orderId) return null;
  return createPortal(<div className="moc-alert-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) close(); }}>
    <section className="moc-alert-dialog" role="dialog" aria-modal="true" aria-label="Chi tiết đơn hàng mới">
      <header className="moc-alert-dialog-head">
        <div><small>PHIẾU XÁC NHẬN ĐƠN HÀNG</small><h2>{order?.orderNumber || 'Đang tải đơn...'}</h2></div>
        <button type="button" aria-label="Đóng chi tiết đơn" onClick={close}><X size={22}/></button>
      </header>
      <div className="moc-alert-dialog-body">
        {isPending && <p>Đang tải chi tiết đơn từ SQL Server...</p>}
        {error && <p className="moc-alert-error">{error instanceof Error ? error.message : String(error)}</p>}
        {!isPending && !error && !order && <p className="moc-alert-error">Không tìm thấy đơn này trong các trang đơn gần đây hoặc bạn không có quyền xem.</p>}
        {order && <>
          <div className="moc-alert-dialog-meta">
            <div><small>Bàn / Chòi</small><strong>{order.table}</strong></div>
            <div><small>Đặt lúc</small><strong>{when(order.createdAt)}</strong></div>
            <div><small>Trạng thái</small><strong>{order.acceptanceStatus === 'Pending' ? 'Chờ nhận' : order.acceptanceStatus}</strong></div>
          </div>
          <div className="moc-alert-dialog-lines">
            {order.items.map(i => <div className="moc-alert-dialog-line" key={i.id}>
              <div><strong>{i.quantity}× {i.productName}</strong><small>Size {i.variantName}{i.note ? ` · ${i.note}` : ''}</small></div>
              <b>{money(i.lineTotal)}</b>
            </div>)}
          </div>
          <div className="moc-alert-dialog-total"><span>Tổng tiền</span><strong>{money(order.totalAmount)}</strong></div>
          <p className="moc-alert-dialog-payment">Thanh toán: {order.paymentMethod === 'Cash' ? 'Tiền mặt' : order.paymentMethod === 'BankTransfer' ? 'Chuyển khoản' : order.paymentMethod} · {order.paymentStatus}</p>
        </>}
        {actionError && <p className="moc-alert-error">Không thể xác nhận: {actionError}</p>}
        {success && <p className="moc-alert-success"><CheckCircle2 size={17}/>{success}</p>}
      </div>
      <footer className="moc-alert-dialog-actions">
        <button type="button" className="moc-alert-secondary" onClick={close}>Đóng</button>
        <button type="button" className="moc-alert-secondary" onClick={() => { close(); navigate('/admin/orders'); }}>Danh sách đơn</button>
        {order?.acceptanceStatus === 'Pending' && !success && <button type="button" className="moc-alert-accept"
          disabled={accept.isPending} onClick={() => accept.mutate(order.id)}><Check size={17}/>{accept.isPending ? 'Đang xác nhận...' : 'Xác nhận đơn'}</button>}
      </footer>
    </section>
  </div>, document.body);
}
