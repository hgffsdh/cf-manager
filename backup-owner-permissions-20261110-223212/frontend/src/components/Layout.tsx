import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, MapPinned, ClipboardList, ChefHat, ConciergeBell, Boxes, ChartNoAxesCombined,
  CalendarDays, LogOut, Coffee, ShieldCheck, CircleDot, UtensilsCrossed, Users, PanelLeftClose, PanelLeftOpen, Menu, X } from 'lucide-react';
import { ADMIN_TOKEN } from '../lib/api';
import { useRealtime } from '../lib/realtime';
import './SidebarCollapse.css';

const links = [
  { to: '/admin', icon: LayoutDashboard, title: 'Tổng quan', end: true },
  { to: '/admin/tables', icon: MapPinned, title: 'Sơ đồ chòi' },
  { to: '/admin/orders', icon: ClipboardList, title: 'Đơn hàng' },
  { to: '/admin/order-history?status=completed', icon: ClipboardList, title: 'Lịch sử đơn đã làm' },
  { to: '/admin/kitchen', icon: ChefHat, title: 'Pha chế' },
  { to: '/admin/service', icon: ConciergeBell, title: 'Phục vụ' },
  { to: '/admin/menu', icon: UtensilsCrossed, title: 'Quản lý thực đơn' },
  { to: '/admin/inventory', icon: Boxes, title: 'Kho nguyên liệu' },
  { to: '/admin/team', icon: Users, title: 'Quản lý nhân viên' },
  { to: '/admin/reservations', icon: CalendarDays, title: 'Đặt chòi' },
  { to: '/admin/reports', icon: ChartNoAxesCombined, title: 'Báo cáo' }
];

export function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem('moc.sidebar.collapsed') === '1'; } catch { return false; } });
  const [mobileOpen, setMobileOpen] = useState(false);
  useRealtime();
  useEffect(() => { try { localStorage.setItem('moc.sidebar.collapsed', collapsed ? '1' : '0'); } catch { /* private mode */ } }, [collapsed]);
  useEffect(() => { setMobileOpen(false); }, [location.pathname]);
  const logout = () => { sessionStorage.removeItem(ADMIN_TOKEN); navigate('/login'); };
  return <div className={`app-shell moc-shell ${collapsed ? 'moc-sidebar-collapsed' : ''} ${mobileOpen ? 'moc-mobile-open' : ''}`}>
    {mobileOpen && <button type="button" className="moc-sidebar-backdrop" aria-label="Đóng menu" onClick={() => setMobileOpen(false)}/>}
    <aside className="sidebar" aria-label="Menu quản lý">
      <div className="moc-sidebar-heading">
        <div className="logo"><span className="logo-mark"><Coffee size={26}/></span><div><strong>Mộc Café</strong><small>GARDEN OS</small></div></div>
        <button type="button" className="moc-sidebar-toggle" title={collapsed ? 'Mở rộng thanh menu' : 'Thu gọn thanh menu'} aria-label={collapsed ? 'Mở rộng thanh menu' : 'Thu gọn thanh menu'} onClick={() => setCollapsed(v => !v)}>{collapsed ? <PanelLeftOpen size={19}/> : <PanelLeftClose size={19}/>}</button>
        <button type="button" className="moc-sidebar-close-mobile" aria-label="Đóng thanh điều hướng" onClick={() => setMobileOpen(false)}><X size={21}/></button>
      </div>
      <div className="side-label">KHÔNG GIAN LÀM VIỆC</div>
      <nav className="side-links">{links.map(({ to, icon: Icon, title, end }) => <NavLink key={to} title={collapsed ? title : undefined} to={to} end={end} className={({ isActive }) => `side-link ${isActive ? 'active' : ''}`}><Icon size={19}/><span>{title}</span></NavLink>)}</nav>
      <div className="sidebar-bottom"><div className="status-live"><CircleDot size={16}/><span>Vận hành trực tuyến</span></div><button className="side-link logout" onClick={logout} title="Đăng xuất"><LogOut size={18}/><span>Đăng xuất</span></button></div>
    </aside>
    <div className="workspace"><header className="topbar">
      <div className="moc-topbar-start"><button type="button" className="moc-mobile-trigger" aria-label="Mở menu quản lý" onClick={() => setMobileOpen(true)}><Menu size={23}/></button><span className="crumb">Không gian quản lý</span><span className="crumb-slash">/</span><b>Mộc Café Garden</b></div>
      <div className="top-actions"><span className="live-pill"><span className="pulse-dot"/> Live</span><div className="avatar">MC</div></div>
    </header><main className="main-content"><Outlet/></main><footer className="main-footer"><ShieldCheck size={15}/> Mộc Café OS · Phần mềm vận hành quán cà phê</footer></div>
  </div>;
}
export function PageTitle({ eyebrow, title, desc, action }: { eyebrow: string; title: string; desc?: string; action?: React.ReactNode }) { return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1>{desc && <p>{desc}</p>}</div>{action && <div>{action}</div>}</div>; }
export function Empty({ message }: { message: string }) { return <div className="empty-state"><Coffee size={36}/><p>{message}</p></div>; }
export function ErrorText({ error }: { error?: unknown }) { return error ? <div className="error-banner">{String(error instanceof Error ? error.message : error)}</div> : null; }
export function Status({ value }: { value: string }) { const map: Record<string, string> = { Pending: 'Chờ tiếp nhận', Accepted: 'Đã tiếp nhận', Rejected: 'Đã từ chối', NotReleased: 'Chờ pha chế', Queued: 'Trong hàng chờ', Preparing: 'Đang pha chế', PartiallyReady: 'Xong một phần', Ready: 'Đã sẵn sàng', PartiallyServed: 'Phục vụ một phần', Served: 'Đã phục vụ', Unpaid: 'Chưa thanh toán', Paid: 'Đã thanh toán', Succeeded: 'Thành công', Failed: 'Thất bại', New: 'Mới' }; const tone = /Paid|Served|Accepted|Ready|Succeeded/.test(value) ? 'success' : /Failed|Rejected|Unpaid/.test(value) ? 'danger' : 'warning'; return <span className={`status status-${tone}`}>{map[value] ?? value}</span>; }
