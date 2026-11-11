import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { LayoutDashboard, MapPinned, ClipboardList, ChefHat, ConciergeBell, Boxes, ChartNoAxesCombined, CalendarDays, LogOut, Coffee, ShieldCheck, CircleDot, UtensilsCrossed } from 'lucide-react';
import { ADMIN_TOKEN } from '../lib/api';
import { useRealtime } from '../lib/realtime';
const links = [
  { to: '/admin', icon: LayoutDashboard, title: 'Tổng quan', end: true },
  { to: '/admin/tables', icon: MapPinned, title: 'Sơ đồ chòi' },
  { to: '/admin/orders', icon: ClipboardList, title: 'Đơn hàng' },
  { to: '/admin/order-history?status=completed', icon: ClipboardList, title: 'Lịch sử đơn đã làm' },
  { to: '/admin/kitchen', icon: ChefHat, title: 'Pha chế' },
  { to: '/admin/service', icon: ConciergeBell, title: 'Phục vụ' },
  { to: '/admin/menu', icon: UtensilsCrossed, title: 'Quản lý thực đơn' },
  { to: '/admin/inventory', icon: Boxes, title: 'Kho nguyên liệu' },
  { to: '/admin/reservations', icon: CalendarDays, title: 'Đặt chòi' },
  { to: '/admin/reports', icon: ChartNoAxesCombined, title: 'Báo cáo' }
];
export function Layout() {
  const navigate = useNavigate();
  useRealtime();
  return <div className="app-shell"><aside className="sidebar"><div className="logo"><span className="logo-mark"><Coffee size={26}/></span><div><strong>Mộc Café</strong><small>GARDEN OS</small></div></div><div className="side-label">KHÔNG GIAN LÀM VIỆC</div><nav className="side-links">{links.map(({ to, icon: Icon, title, end }) => <NavLink key={to} to={to} end={end} className={({isActive}) => `side-link ${isActive ? 'active' : ''}`}><Icon size={19}/><span>{title}</span></NavLink>)}</nav><div className="sidebar-bottom"><div className="status-live"><CircleDot size={16}/> Vận hành trực tuyến</div><button className="side-link logout" onClick={() => { sessionStorage.removeItem(ADMIN_TOKEN); navigate('/login'); }}><LogOut size={18}/> Đăng xuất</button></div></aside><div className="workspace"><header className="topbar"><div><span className="crumb">Không gian quản lý</span><span className="crumb-slash">/</span><b>Mộc Café Garden</b></div><div className="top-actions"><span className="live-pill"><span className="pulse-dot"/> Live</span><div className="avatar">MC</div></div></header><main className="main-content"><Outlet/></main><footer className="main-footer"><ShieldCheck size={15}/> Mộc Café OS · Phần mềm vận hành quán cà phê</footer></div></div>;
}
export function PageTitle({eyebrow, title, desc, action}: {eyebrow: string; title: string; desc?: string; action?: React.ReactNode}) { return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1>{desc && <p>{desc}</p>}</div>{action && <div>{action}</div>}</div>; }
export function Empty({message}: {message: string}) { return <div className="empty-state"><Coffee size={36}/><p>{message}</p></div>; }
export function ErrorText({error}: {error?: unknown}) { return error ? <div className="error-banner">{String(error instanceof Error ? error.message : error)}</div> : null; }
export function Status({value}: {value: string}) { const map: Record<string, string> = { Pending: 'Chờ tiếp nhận', Accepted: 'Đã tiếp nhận', Rejected: 'Đã từ chối', NotReleased: 'Chờ pha chế', Queued: 'Trong hàng chờ', Preparing: 'Đang pha chế', PartiallyReady: 'Xong một phần', Ready: 'Đã sẵn sàng', PartiallyServed: 'Phục vụ một phần', Served: 'Đã phục vụ', Unpaid: 'Chưa thanh toán', Paid: 'Đã thanh toán', Succeeded: 'Thành công', Failed: 'Thất bại', New: 'Mới' }; const tone = /Paid|Served|Accepted|Ready|Succeeded/.test(value) ? 'success' : /Failed|Rejected|Unpaid/.test(value) ? 'danger' : 'warning'; return <span className={`status status-${tone}`}>{map[value] ?? value}</span>; }
