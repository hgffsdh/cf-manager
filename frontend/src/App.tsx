import { Navigate, Route, Routes } from 'react-router-dom';
import type { ReactNode } from 'react';
import { isOwner } from './lib/permissions';
import { Layout } from './components/Layout';
import { getStaffToken } from './lib/api';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Tables from './pages/Tables';
import Orders from './pages/Orders';
import Kitchen from './pages/Kitchen';
import Service from './pages/Service';
import Inventory from './pages/Inventory';
import Reservations from './pages/Reservations';
import Reports from './pages/Reports';
import OrderHistory from './pages/OrderHistory';
import PaymentHistory from './pages/PaymentHistory';
import Guest from './pages/Guest';
import ChooseHut from './pages/ChooseHut';
import NavigationEditor from './pages/NavigationEditor';
import MenuManager from './pages/MenuManager';

import TeamManager from './pages/TeamManager';

function OwnerRoute({ children }: { children: ReactNode }) { return isOwner() ? <>{children}</> : <Navigate to="/admin" replace/>; }
function Private() { return getStaffToken() ? <Layout/> : <Navigate to="/login" replace/>; }
export default function App() { return <Routes>
  <Route path="/" element={<Navigate to={getStaffToken() ? '/admin' : '/login'}/>}/>
  <Route path="/login" element={<Login/>}/>
  <Route path="/g/:qr" element={<Guest/>}/><Route path="/chon-choi" element={<ChooseHut/>}/>
  <Route element={<Private/>}><Route path="/admin" element={<Dashboard/>}/><Route path="/admin/tables" element={<Tables/>}/><Route path="/admin/navigation" element={<NavigationEditor/>}/><Route path="/admin/orders" element={<Orders/>}/><Route path="/admin/kitchen" element={<Kitchen/>}/><Route path="/admin/service" element={<Service/>}/><Route path="/admin/inventory" element={<OwnerRoute><Inventory/></OwnerRoute>}/>
<Route path="/admin/team" element={<OwnerRoute><TeamManager/></OwnerRoute>}/>
<Route path="/admin/menu" element={<MenuManager/>}/><Route path="/admin/reservations" element={<Reservations/>}/><Route path="/admin/reports" element={<OwnerRoute><Reports/></OwnerRoute>}/><Route path="/admin/order-history" element={<OrderHistory/>}/><Route path="/admin/payment-history" element={<OwnerRoute><PaymentHistory/></OwnerRoute>}/></Route>
  <Route path="*" element={<Navigate to="/"/>}/>
</Routes>; }
