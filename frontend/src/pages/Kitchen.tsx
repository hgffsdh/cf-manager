import { useCallback, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChefHat, Clock3, Flame, CheckCircle2, ChevronRight, ReceiptText } from 'lucide-react';
import { api, post, when } from '../lib/api';
import { Empty, ErrorText, PageTitle, Status } from '../components/Layout';
import OrderDetailModal from '../components/OrderDetailModal';
import './KitchenCompact.css';

type Task = {
  id: string; status: string; queuedAt: string; station: string; productName: string;
  variantName: string; quantity: number; readyQuantity: number; servedQuantity: number;
  note: string; orderNumber: string; table: string;
};

export default function Kitchen() {
  const client = useQueryClient();
  const [openedOrder, setOpenedOrder] = useState<string | null>(null);
  const closeDetail = useCallback(() => setOpenedOrder(null), []);
  const { data, error } = useQuery({
    queryKey: ['kitchen'], queryFn: () => api<Task[]>('/staff/kitchen'), refetchInterval: 15_000
  });
  const mutation = useMutation({
    mutationFn: ({ id, kind }: { id: string; kind: string }) => post(`/staff/kitchen/${id}/${kind}`, kind === 'ready' ? { quantity: 1 } : {}),
    onSuccess: () => client.invalidateQueries({ queryKey: ['kitchen'] })
  });
  const tasks = (data ?? []).filter(t => t.servedQuantity < t.quantity);
  const queued = tasks.filter(t => t.status === 'Queued');
  const working = tasks.filter(t => t.status === 'Preparing' || t.status === 'PartiallyReady');
  const ready = tasks.filter(t => t.status === 'Ready');

  const Column = ({ title, items, kind, icon }: { title: string; items: Task[]; kind: 'queued' | 'working' | 'ready'; icon: React.ReactNode }) =>
    <section className={`kanban-column ${kind === 'ready' ? 'compact-ready-column' : ''}`}>
      <div className="kanban-heading">{icon}<strong>{title}</strong><span>{items.length}</span></div>
      <div className="kanban-body">
        {items.map(t => kind === 'ready' ?
          <button key={t.id} type="button" className="compact-ready-chip" onClick={() => setOpenedOrder(t.orderNumber)}
            title={`Xem chi tiết đơn ${t.orderNumber}`} aria-label={`Mở chi tiết đơn ${t.orderNumber}, món ${t.productName}`}>
            <span className="compact-ready-check"><CheckCircle2 size={17}/></span>
            <span className="compact-ready-info"><strong>{t.productName} <small>×{t.quantity}</small></strong><span>{t.table} · {t.orderNumber}</span></span>
            <ChevronRight size={16} className="compact-ready-arrow"/>
          </button> :
          <div className="task-card" key={t.id}>
            <div className="task-top"><button type="button" className="compact-order-number" onClick={() => setOpenedOrder(t.orderNumber)}>{t.orderNumber} <ReceiptText size={13}/></button><span>{when(t.queuedAt)}</span></div>
            <h3>{t.productName}</h3><div className="task-meta">{t.variantName} · {t.station}</div>
            <div className="task-location">{t.table}</div>
            {t.note && <div className="task-note">Ghi chú: {t.note}</div>}
            <div className="progress-info"><span>Đã làm {t.readyQuantity}/{t.quantity}</span><Status value={t.status}/></div>
            <div className="progress-track"><div style={{ width: `${t.quantity ? t.readyQuantity / t.quantity * 100 : 0}%` }}/></div>
            {t.status === 'Queued' && <button className="btn btn-primary full" disabled={mutation.isPending} onClick={() => mutation.mutate({ id: t.id, kind: 'start' })}>Bắt đầu làm</button>}
            {['Preparing', 'PartiallyReady'].includes(t.status) && <button className="btn btn-primary full" disabled={mutation.isPending} onClick={() => mutation.mutate({ id: t.id, kind: 'ready' })}><CheckCircle2 size={16}/> Hoàn thành 1 phần</button>}
          </div>)}
        {!items.length && <div className="empty-column">Không có món</div>}
      </div>
    </section>;

  return <>
    <PageTitle eyebrow="KHU VỰC PHA CHẾ" title="Màn hình quầy pha chế"
      desc="Món đã làm xong được thu thành thẻ nhỏ. Chạm thẻ để xem chi tiết cả đơn, mã đơn, món và thanh toán."/>
    <ErrorText error={error || mutation.error}/>
    <div className="kanban-board">
      <Column title="Chờ pha chế" items={queued} kind="queued" icon={<Clock3 size={21}/>}/>
      <Column title="Đang thực hiện" items={working} kind="working" icon={<Flame size={21}/>}/>
      <Column title="Sẵn sàng mang ra" items={ready} kind="ready" icon={<ChefHat size={21}/>}/>
    </div>
    {!tasks.length && !error && <Empty message="Chưa có món cần pha chế hoặc mang ra."/>}
    <OrderDetailModal orderNumber={openedOrder} onClose={closeDetail}/>
  </>;
}
