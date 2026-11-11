import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, ChefHat, ClipboardCheck, Plus, ShieldCheck, UserRound, Users, X } from 'lucide-react';
import { api, post, when } from '../lib/api';
import { ErrorText, PageTitle } from '../components/Layout';
import './TeamManager.css';

type Employee = { id: string; fullName: string; email: string; isActive: boolean; roles: string[] };
type Station = { id: string; name: string };
type Assignment = { id: string; userId: string; employeeName: string; duty: string; stationId: string | null };
type Shift = { id: string; name: string; startAt: string; endAt: string; note: string; assignments: Assignment[] };
type WorkLog = { id: string; action: string; quantity: number; createdAt: string; orderNumber: string; productName: string; tableName: string; actorName: string; shiftName: string };
type WorkLogResult = { items: WorkLog[]; page: number; totalCount: number };
const roles = [
  { value: 'Manager', label: 'Quản lý' }, { value: 'Cashier', label: 'Thu ngân' },
  { value: 'Barista', label: 'Pha chế' }, { value: 'Waiter', label: 'Phục vụ' },
  { value: 'InventoryStaff', label: 'Nhân viên kho' }
];
const local = (s: string) => new Date(s).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' });
const shiftTime = (day: string, hour: string) => day && hour ? new Date(`${day}T${hour}:00`).toISOString() : '';
const shiftEndTime = (day: string, startHour: string, endHour: string) => {
  if (!day || !startHour || !endHour) return '';
  const begin = new Date(`${day}T${startHour}:00`);
  const end = new Date(`${day}T${endHour}:00`);
  if (end <= begin) end.setDate(end.getDate() + 1); // Overnight shift.
  return end.toISOString();
};

export default function TeamManager() {
  const client = useQueryClient();
  const [tab, setTab] = useState<'employees' | 'shifts' | 'work'>('shifts');
  const [success, setSuccess] = useState('');
  const [fullName, setFullName] = useState(''); const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [role, setRole] = useState('Barista');
  const [shiftName, setShiftName] = useState('Ca sáng'); const [shiftDay, setShiftDay] = useState(new Date().toLocaleDateString('en-CA'));
  const [startHour, setStartHour] = useState('07:00'); const [endHour, setEndHour] = useState('13:00'); const [shiftNote, setShiftNote] = useState('');
  const [assignShiftId, setAssignShiftId] = useState(''); const [assignUserId, setAssignUserId] = useState('');
  const [duty, setDuty] = useState('Pha chế đồ uống'); const [stationId, setStationId] = useState('');
  const [days, setDays] = useState(7); const [workPage, setWorkPage] = useState(1);
  const employees = useQuery({ queryKey: ['team-employees'], queryFn: () => api<Employee[]>('/staff/team/employees') });
  const shifts = useQuery({ queryKey: ['team-shifts'], queryFn: () => api<Shift[]>('/staff/team/shifts') });
  const stations = useQuery({ queryKey: ['team-stations'], queryFn: () => api<Station[]>('/staff/team/stations') });
  const work = useQuery({ queryKey: ['team-work-log', days, workPage], queryFn: () => api<WorkLogResult>(`/staff/team/work-log?days=${days}&page=${workPage}`) });
  const refresh = () => { client.invalidateQueries({ queryKey: ['team-employees'] }); client.invalidateQueries({ queryKey: ['team-shifts'] }); client.invalidateQueries({ queryKey: ['team-work-log'] }); };
  const createEmployee = useMutation({
    mutationFn: () => post('/staff/team/employees', { fullName, email, password, role }),
    onSuccess: () => { refresh(); setFullName(''); setEmail(''); setPassword(''); setSuccess('Đã tạo tài khoản nhân viên. Nhân viên có thể đăng nhập bằng email và mật khẩu vừa đặt.'); }
  });
  const updateEmployee = useMutation({
    mutationFn: ({ id, role, isActive }: { id: string; role: string; isActive: boolean }) => api(`/staff/team/employees/${id}`, { method: 'PUT', body: JSON.stringify({ role, isActive }) }),
    onSuccess: () => { refresh(); setSuccess('Đã lưu thay đổi tài khoản.'); }
  });
  const createShift = useMutation({
    mutationFn: () => post('/staff/team/shifts', { name: shiftName, startAt: shiftTime(shiftDay, startHour), endAt: shiftEndTime(shiftDay, startHour, endHour), note: shiftNote }),
    onSuccess: () => { refresh(); setSuccess('Đã tạo ca làm việc trong SQL Server.'); setShiftNote(''); }
  });
  const assign = useMutation({
    mutationFn: () => post(`/staff/team/shifts/${assignShiftId}/assign`, { userId: assignUserId, duty, stationId: stationId || null }),
    onSuccess: () => { refresh(); setSuccess('Đã phân công nhân viên vào ca.'); setAssignUserId(''); }
  });
  const removeAssignment = useMutation({
    mutationFn: ({ shiftId, id }: { shiftId: string; id: string }) => api(`/staff/team/shifts/${shiftId}/assign/${id}`, { method: 'DELETE' }),
    onSuccess: () => { refresh(); setSuccess('Đã hủy phân công trong ca.'); }
  });
  const issue = employees.error || shifts.error || stations.error || work.error || createEmployee.error || updateEmployee.error || createShift.error || assign.error || removeAssignment.error;
  const active = employees.data?.filter(x => x.isActive) ?? [];
  const selectedShift = shifts.data?.find(x => x.id === assignShiftId);
  return <div className="team-page">
    <PageTitle eyebrow="NHÂN SỰ VÀ VẬN HÀNH" title="Quản lý nhân viên & lịch làm việc"
      desc="Ai làm ca nào, phụ trách quầy nào, ai bắt đầu và hoàn thành món: lưu bằng tài khoản thật trong SQL Server." />
    <ErrorText error={issue}/>{success && <div role="status" className="info-banner">{success}</div>}
    <div className="team-overview">
      <div><Users size={20}/><span>Nhân sự đang hoạt động</span><strong>{active.length}</strong></div>
      <div><CalendarClock size={20}/><span>Ca trong lịch</span><strong>{shifts.data?.length ?? 0}</strong></div>
      <div><ChefHat size={20}/><span>Thao tác pha chế / {days} ngày</span><strong>{work.data?.totalCount ?? 0}</strong></div>
    </div>
    <div className="team-tabs">
      <button className={tab === 'shifts' ? 'active' : ''} onClick={() => setTab('shifts')}><CalendarClock size={17}/> Lịch làm việc</button>
      <button className={tab === 'employees' ? 'active' : ''} onClick={() => setTab('employees')}><Users size={17}/> Nhân viên</button>
      <button className={tab === 'work' ? 'active' : ''} onClick={() => setTab('work')}><ClipboardCheck size={17}/> Ai đã pha món</button>
    </div>
    {tab === 'employees' && <>
      <section className="panel team-panel"><div className="section-title"><h2><UserRound size={20}/> Tạo tài khoản nhân viên</h2></div>
        <form className="team-fields" onSubmit={e => { e.preventDefault(); setSuccess(''); createEmployee.mutate(); }}>
          <label>Họ và tên<input required minLength={2} maxLength={120} value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Nguyễn Văn A"/></label>
          <label>Email đăng nhập<input required type="email" maxLength={160} value={email} onChange={e => setEmail(e.target.value)} placeholder="nhanvien@quan.vn"/></label>
          <label>Mật khẩu ban đầu<input required type="password" minLength={8} autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} placeholder="≥8 ký tự, có hoa/thường/số/ký hiệu"/></label>
          <label>Vai trò<select value={role} onChange={e => setRole(e.target.value)}>{roles.map(x => <option key={x.value} value={x.value}>{x.label}</option>)}</select></label>
          <button className="btn btn-primary" type="submit" disabled={createEmployee.isPending}><Plus size={17}/> Tạo nhân viên</button>
        </form><p className="team-hint">Chỉ Owner có thể tạo / sửa quyền Quản lý. Vai trò Owner không được thay đổi ở trang này.</p>
      </section>
      <section className="panel team-panel"><div className="section-title"><h2>Danh sách nhân viên</h2></div>
        <div className="table-responsive"><table className="data-table"><thead><tr><th>Nhân viên</th><th>Email</th><th>Vai trò</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>
          {employees.data?.map(e => { const r = e.roles[0] || '—'; const owner = e.roles.includes('Owner'); return <tr key={e.id}><td><b>{e.fullName}</b></td><td>{e.email}</td><td>{owner ? 'Owner' : <select aria-label={`Vai trò ${e.fullName}`} value={r} onChange={ev => { setSuccess(''); updateEmployee.mutate({ id: e.id, role: ev.target.value, isActive: e.isActive }); }} disabled={updateEmployee.isPending}>{roles.map(x => <option key={x.value} value={x.value}>{x.label}</option>)}</select>}</td><td><span className={e.isActive ? 'team-ok' : 'team-off'}>{e.isActive ? 'Đang hoạt động' : 'Tạm khóa'}</span></td><td><button type="button" className="btn btn-outline" disabled={owner || updateEmployee.isPending} onClick={() => { if (window.confirm(`Đổi trạng thái của ${e.fullName}?`)) updateEmployee.mutate({ id: e.id, role: r, isActive: !e.isActive }); }}>{e.isActive ? 'Tạm khóa' : 'Mở lại'}</button></td></tr>; })}
        </tbody></table></div>
      </section>
    </>}
    {tab === 'shifts' && <>
      <section className="panel team-panel"><div className="section-title"><h2><CalendarClock size={20}/> Tạo ca làm việc</h2><p>Giờ nhập theo múi giờ trên máy bạn, API lưu UTC trong SQL Server.</p></div>
        <form className="team-fields" onSubmit={e => { e.preventDefault(); setSuccess(''); createShift.mutate(); }}>
          <label>Tên ca<input required minLength={2} value={shiftName} onChange={e => setShiftName(e.target.value)} placeholder="Ca sáng / Ca chiều"/></label>
          <label>Ngày<input required type="date" value={shiftDay} onChange={e => setShiftDay(e.target.value)}/></label>
          <label>Bắt đầu<input required type="time" value={startHour} onChange={e => setStartHour(e.target.value)}/></label>
          <label>Kết thúc<input required type="time" value={endHour} onChange={e => setEndHour(e.target.value)}/></label>
          <label>Ghi chú<input maxLength={500} value={shiftNote} onChange={e => setShiftNote(e.target.value)} placeholder="Đặc biệt, ngày lễ..."/></label>
          <button className="btn btn-primary" type="submit" disabled={createShift.isPending || !shiftTime(shiftDay, startHour) || !shiftTime(shiftDay, endHour)}><Plus size={17}/> Tạo ca</button>
        </form><p className="team-hint">Nếu giờ kết thúc nhỏ hơn hoặc bằng giờ bắt đầu, hệ thống hiểu là kết thúc vào ngày hôm sau. Mỗi ca tối đa 16 giờ.</p>
      </section>
      <section className="panel team-panel"><div className="section-title"><h2><UserRound size={20}/> Phân công nhân viên</h2><p>Không cho xếp một nhân viên vào hai ca bị trùng giờ.</p></div>
        <form className="team-fields" onSubmit={e => { e.preventDefault(); setSuccess(''); assign.mutate(); }}>
          <label>Ca làm<select required value={assignShiftId} onChange={e => setAssignShiftId(e.target.value)}><option value="">Chọn ca</option>{shifts.data?.map(s => <option key={s.id} value={s.id}>{s.name} · {local(s.startAt)}</option>)}</select></label>
          <label>Nhân viên<select required value={assignUserId} onChange={e => setAssignUserId(e.target.value)}><option value="">Chọn người</option>{active.map(e => <option key={e.id} value={e.id}>{e.fullName} · {e.roles.join(', ')}</option>)}</select></label>
          <label>Nhiệm vụ<input required minLength={2} maxLength={100} value={duty} onChange={e => setDuty(e.target.value)} placeholder="Pha cà phê, phục vụ, thu ngân..."/></label>
          <label>Quầy phụ trách<select value={stationId} onChange={e => setStationId(e.target.value)}><option value="">Không chỉ định</option>{stations.data?.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
          <button className="btn btn-primary" type="submit" disabled={assign.isPending || !assignShiftId || !assignUserId || !duty.trim()}><ShieldCheck size={17}/> Phân công</button>
        </form>{selectedShift && <p className="team-hint">Đang chọn: {selectedShift.name}, {local(selectedShift.startAt)} – {local(selectedShift.endAt)}</p>}
      </section>
      <section className="panel team-panel"><div className="section-title"><h2>Lịch ca đã phân công</h2></div>
        <div className="team-shift-grid">{shifts.data?.map(s => <article key={s.id} className="team-shift-card"><div className="team-shift-head"><strong>{s.name}</strong><span>{local(s.startAt)} → {new Date(s.endAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</span></div>{s.note && <p>{s.note}</p>}
          {s.assignments.length ? s.assignments.map(a => <div className="team-assignment" key={a.id}><div><b>{a.employeeName}</b><small>{a.duty}{a.stationId ? ` · ${stations.data?.find(x => x.id === a.stationId)?.name || ''}` : ''}</small></div><button type="button" aria-label={`Bỏ phân công ${a.employeeName}`} title="Bỏ phân công" disabled={removeAssignment.isPending} onClick={() => { if (window.confirm(`Bỏ phân công ${a.employeeName} khỏi ${s.name}?`)) removeAssignment.mutate({ shiftId: s.id, id: a.id }); }}><X size={16}/></button></div>) : <span className="team-empty">Chưa phân công nhân viên</span>}</article>)}
        </div>{shifts.data?.length === 0 && <p className="team-hint">Chưa có ca trong khoảng 7 ngày trước đến 30 ngày tới.</p>}
      </section>
    </>}
    {tab === 'work' && <section className="panel team-panel"><div className="section-title"><h2><ChefHat size={20}/> Nhật ký ai đã làm món nào</h2><p>Ghi từ thao tác thực tế trên màn hình Pha chế, không suy đoán theo lịch phân ca.</p></div>
      <div className="team-work-filter"><label>Khoảng thời gian<select value={days} onChange={e => { setDays(Number(e.target.value)); setWorkPage(1); }}><option value={1}>24 giờ gần đây</option><option value={7}>7 ngày gần đây</option><option value={30}>30 ngày gần đây</option><option value={90}>90 ngày gần đây</option></select></label><span>{work.data?.totalCount ?? 0} thao tác</span></div>
      <div className="table-responsive"><table className="data-table"><thead><tr><th>Thời gian</th><th>Người thao tác</th><th>Ca làm</th><th>Hành động</th><th>Món</th><th>Mã đơn</th><th>Chòi</th></tr></thead><tbody>
        {work.data?.items.map(e => <tr key={e.id}><td>{when(e.createdAt)}</td><td><b>{e.actorName}</b></td><td>{e.shiftName}</td><td><span className={e.action === 'Ready' ? 'team-ok' : 'team-off'}>{e.action === 'Ready' ? `Đã làm xong ${e.quantity}` : 'Bắt đầu pha'}</span></td><td>{e.productName}</td><td>{e.orderNumber}</td><td>{e.tableName}</td></tr>)}
        {!work.isLoading && !work.data?.items.length && <tr><td colSpan={7}>Chưa có thao tác pha chế thực trong khoảng đã chọn.</td></tr>}
      </tbody></table></div><div className="team-work-footer"><span>Trang {workPage} / {Math.max(1, Math.ceil((work.data?.totalCount ?? 0) / 50))}</span><button className="btn btn-outline" disabled={workPage === 1} onClick={() => setWorkPage(p => p - 1)}>Trước</button><button className="btn btn-outline" disabled={workPage * 50 >= (work.data?.totalCount ?? 0)} onClick={() => setWorkPage(p => p + 1)}>Sau</button></div>
      <p className="team-hint">Lịch sử này bắt đầu ghi từ khi cài bản nâng cấp. Các món hoàn thành trước đó chưa có thông tin người làm, hệ thống không tự gán tên giả.</p>
    </section>}
  </div>;
}
