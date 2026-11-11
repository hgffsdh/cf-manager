import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import './SidebarWorkBadges.css';

type OrdersPage = { totalCount: number };
type KitchenTask = {
  id: string;
  status: string;
  orderNumber: string;
  quantity: number;
  readyQuantity: number;
  servedQuantity: number;
};
type ServiceRequest = { id: string };

// These keys deliberately match the existing pages and notification bell.
// useRealtime() in Layout invalidates queries when SignalR messages arrive.
export function useSidebarWorkCounts() {
  const pendingOrders = useQuery({
    queryKey: ['moc-order-notifications', 'Pending'],
    queryFn: () => api<OrdersPage>('/staff/orders?status=Pending&page=1'),
    refetchInterval: 12_000,
    refetchOnWindowFocus: true,
    staleTime: 1_500,
    retry: 1,
  });

  const kitchen = useQuery({
    queryKey: ['kitchen'],
    queryFn: () => api<KitchenTask[]>('/staff/kitchen'),
    refetchInterval: 12_000,
    refetchOnWindowFocus: true,
    staleTime: 1_500,
    retry: 1,
  });

  const support = useQuery({
    queryKey: ['support'],
    queryFn: () => api<ServiceRequest[]>('/staff/support'),
    refetchInterval: 12_000,
    refetchOnWindowFocus: true,
    staleTime: 1_500,
    retry: 1,
  });

  const tasks = kitchen.data ?? [];
  const queued = tasks.filter((task) => task.status === 'Queued').length;
  const preparing = tasks.filter((task) =>
    task.status === 'Preparing' || task.status === 'PartiallyReady'
  ).length;

  // A fully served task may still have Status='Ready' in the current backend.
  // Compare actual quantities instead of relying on task status alone.
  const readyToServe = tasks.reduce(
    (sum, task) => sum + Math.max(0, task.readyQuantity - task.servedQuantity),
    0
  );

  const activeOrderNumbers = new Set(
    tasks
      .filter((task) =>
        task.status === 'Queued' ||
        task.status === 'Preparing' ||
        task.status === 'PartiallyReady' ||
        task.readyQuantity > task.servedQuantity
      )
      .map((task) => task.orderNumber)
      .filter(Boolean)
  );

  return {
    pending: pendingOrders.data?.totalCount ?? 0,
    activeOrders: activeOrderNumbers.size,
    queued,
    preparing,
    readyToServe,
    supportRequests: support.data?.length ?? 0,
    pendingError: Boolean(pendingOrders.error),
    kitchenError: Boolean(kitchen.error),
    supportError: Boolean(support.error),
  };
}

export type SidebarWorkCounts = ReturnType<typeof useSidebarWorkCounts>;

type WorkBadgeProps = {
  count: number;
  label: string;
  tone: 'red' | 'amber' | 'green' | 'blue';
};

function WorkBadge({ count, label, tone }: WorkBadgeProps) {
  if (count <= 0) return null;
  const text = count > 99 ? '99+' : String(count);
  return (
    <span
      className={`moc-work-badge moc-work-badge-${tone}`}
      title={`${label}: ${count}`}
      aria-label={`${label}: ${count}`}
    >
      {text}
    </span>
  );
}

function WorkErrorBadge({ label }: { label: string }) {
  return (
    <span
      className="moc-work-badge moc-work-badge-error"
      title={`Không tải được số lượng: ${label}. Hãy kiểm tra quyền truy cập hoặc API.`}
      aria-label={`Không tải được số lượng ${label}`}
    >
      !
    </span>
  );
}

export function SidebarOrderWorkBadge({ counts }: { counts: SidebarWorkCounts }) {
  return (
    <>
      {counts.pendingError ? (
        <WorkErrorBadge label="đơn chờ xác nhận" />
      ) : (
        <WorkBadge count={counts.pending} label="Đơn chờ xác nhận" tone="red" />
      )}
      {counts.kitchenError ? (
        <WorkErrorBadge label="đơn đang xử lý" />
      ) : (
        <WorkBadge count={counts.activeOrders} label="Đơn đang xử lý" tone="amber" />
      )}
    </>
  );
}

export function SidebarKitchenWorkBadge({ counts }: { counts: SidebarWorkCounts }) {
  if (counts.kitchenError) return <WorkErrorBadge label="công việc pha chế" />;
  return (
    <>
      <WorkBadge count={counts.queued} label="Món chờ pha chế" tone="red" />
      <WorkBadge count={counts.preparing} label="Món đang pha chế" tone="amber" />
    </>
  );
}

export function SidebarServiceWorkBadge({ counts }: { counts: SidebarWorkCounts }) {
  return (
    <>
      {counts.kitchenError ? (
        <WorkErrorBadge label="món chờ phục vụ" />
      ) : (
        <WorkBadge count={counts.readyToServe} label="Phần món chờ phục vụ" tone="green" />
      )}
      {counts.supportError ? (
        <WorkErrorBadge label="yêu cầu hỗ trợ" />
      ) : (
        <WorkBadge count={counts.supportRequests} label="Yêu cầu khách đang chờ" tone="blue" />
      )}
    </>
  );
}
