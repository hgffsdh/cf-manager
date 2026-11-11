import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowUpRight, Banknote, CalendarDays, CheckCircle2,
  Clock3, ClipboardList, Coins, Medal, RefreshCw, TrendingUp
} from 'lucide-react';
import { api, money } from '../lib/api';
import { Empty, ErrorText, PageTitle } from '../components/Layout';
import './Reports.css';

type RangeDays = 1 | 7 | 30;
type ProductStat = { product: string; quantity: number; orderValue: number };
type DayStat = { date: string; amount: number };
type ActualReport = {
  fromDate: string;
  toDate: string;
  orderCount: number;
  paidOrderCount: number;
  unpaidOrderCount: number;
  paymentCount: number;
  collectedTotal: number;
  cashCollected: number;
  otherCollected: number;
  topProducts: ProductStat[];
  dailyCollected: DayStat[];
};

const ranges: { value: RangeDays; text: string }[] = [
  { value: 1, text: 'Hôm nay' },
  { value: 7, text: '7 ngày qua' },
  { value: 30, text: '30 ngày qua' }
];

function dayLabel(date: string) {
  const parts = date.split('-');
  return parts.length === 3 ? `${parts[2]}/${parts[1]}` : date;
}

export default function Reports() {
  const [days, setDays] = useState<RangeDays>(7);
  const { data, error, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['reports', 'real', days],
    queryFn: () => api<ActualReport>(`/staff/reports/actual?days=${days}`),
    refetchInterval: 30_000,
    staleTime: 10_000
  });

  const maxDay = Math.max(1, ...(data?.dailyCollected ?? []).map(x => x.amount));
  const maxProduct = Math.max(1, ...(data?.topProducts ?? []).map(x => x.quantity));
  const collected = data?.collectedTotal ?? 0;
  const cashPct = collected > 0 ? Math.round(((data?.cashCollected ?? 0) / collected) * 100) : 0;
  const metrics = [
    { label: 'Tiền thực tế đã thu', value: money(collected), detail: `${data?.paymentCount ?? 0} giao dịch được ghi nhận`, Icon: Coins, className: 'real-green', to: `/admin/payment-history?days=${days}` },
    { label: 'Đơn hàng phát sinh', value: data?.orderCount ?? 0, detail: 'Đơn thực trong khoảng đã chọn', Icon: ClipboardList, className: 'real-blue', to: `/admin/order-history?source=real&status=all&days=${days}` },
    { label: 'Đơn đã thanh toán', value: data?.paidOrderCount ?? 0, detail: 'Đã ghi nhận trạng thái Paid', Icon: CheckCircle2, className: 'real-green', to: `/admin/order-history?source=real&status=paid&days=${days}` },
    { label: 'Đơn còn chờ thanh toán', value: data?.unpaidOrderCount ?? 0, detail: 'Không gồm đơn đã từ chối', Icon: Clock3, className: 'real-gold', to: `/admin/order-history?source=real&status=unpaid&days=${days}` }
  ];

  return <>
    <PageTitle
      eyebrow="BÁO CÁO VẬN HÀNH THỰC TẾ"
      title="Báo cáo & thống kê"
      desc="Chỉ sử dụng dữ liệu kinh doanh thực từ SQL Server, loại trừ toàn bộ giao dịch DEMO."
      action={<div className="real-report-controls" aria-label="Khoảng thời gian báo cáo">
        <div className="real-range-tabs">{ranges.map(r =>
          <button key={r.value} className={days === r.value ? 'active' : ''}
            onClick={() => setDays(r.value)} type="button">{r.text}</button>
        )}</div>
        <button className="real-refresh" type="button" disabled={isFetching}
          title="Cập nhật dữ liệu từ SQL Server" onClick={() => void refetch()}><RefreshCw size={17}/></button>
      </div>}
    />
    <ErrorText error={error}/>
    <div className="real-report-note">
      <div className="real-note-icon"><CalendarDays size={22}/></div>
      <div>
        <strong>Báo cáo giao dịch thực tế</strong>
        <span>{data ? `Kỳ báo cáo: ${dayLabel(data.fromDate)} – ${dayLabel(data.toDate)} · Múi giờ Việt Nam (UTC+7)` : 'Dữ liệu đang được tải từ hệ thống.'}</span>
        <small>Tiền đã thu được tính từ phân bổ thanh toán thật; các đơn DEMO không được cộng vào báo cáo.</small>
      </div>
      {isFetching && <span className="real-sync">Đang cập nhật...</span>}
    </div>

    <section className="real-kpi-grid" aria-label="Các chỉ số kinh doanh">
      {metrics.map(({ label, value, detail, Icon, className, to }) => <Link key={label} to={to} className="real-kpi real-kpi-link"
        aria-label={`${label}: ${value}. Bấm để xem chi tiết`}>
        <div className="real-kpi-head"><span>{label}</span><span className={`real-kpi-icon ${className}`}><Icon size={20}/></span></div>
        <strong>{isLoading ? '—' : value}</strong><small>{detail} · Bấm để xem</small><ArrowUpRight size={16} className="real-kpi-arrow"/>
      </Link>)}
    </section>
    <div className="real-history-shortcut"><Link to="/admin/order-history?status=completed"><ClipboardList size={16}/> Mở lịch sử đơn đã làm <ArrowUpRight size={15}/></Link></div>

    <div className="real-report-grid">
      <section className="panel real-report-panel">
        <div className="section-title"><div><h2><TrendingUp size={21}/> Tiền đã thu theo ngày</h2><p>Dựa theo thời điểm thu tiền, không phải thời điểm gọi món</p></div></div>
        <div className="real-chart" role="img" aria-label="Biểu đồ tiền thu theo từng ngày">
          {(data?.dailyCollected ?? []).map(day => <div className="real-chart-col" key={day.date}
            title={`${dayLabel(day.date)}: ${money(day.amount)}`}>
            <div className="real-chart-track"><div className="real-chart-bar" style={{height: `${Math.max(day.amount ? 4 : 0, day.amount / maxDay * 100)}%`}}/></div>
            <span>{dayLabel(day.date)}</span>
          </div>)}
          {!isLoading && !data?.dailyCollected.length && <Empty message="Chưa có khoản thu thực tế trong kỳ."/>}
        </div>
      </section>
      <section className="panel real-report-panel real-method-panel">
        <div className="section-title"><div><h2><Banknote size={21}/> Phương thức thu tiền</h2><p>Giá trị phân bổ của những giao dịch thực</p></div></div>
        <div className="real-donut" style={{background: `conic-gradient(#276c50 ${cashPct}%, #d6e5d9 ${cashPct}% 100%)`}}>
          <div><strong>{cashPct}%</strong><span>Tiền mặt</span></div>
        </div>
        <div className="real-method-row"><span><i className="real-dot cash"/> Tiền mặt</span><b>{money(data?.cashCollected ?? 0)}</b></div>
        <div className="real-method-row"><span><i className="real-dot other"/> Phương thức khác đã ghi nhận</span><b>{money(data?.otherCollected ?? 0)}</b></div>
      </section>
    </div>

    <section className="panel real-report-panel">
      <div className="section-title"><div><h2><Medal size={21}/> Món bán chạy thực tế</h2><p>Chỉ tính món thuộc đơn THỰC đã được chấp nhận và thanh toán trong kỳ đặt món</p></div></div>
      {data?.topProducts.length ? <div className="ranking-list">
        {data.topProducts.map((item, i) => <div className="ranking-row" key={item.product}>
          <span className="ranking-index">{String(i + 1).padStart(2, '0')}</span>
          <div className="ranking-detail"><div className="ranking-title">
            <strong>{item.product}</strong><span>{item.quantity} phần · Giá trị món {money(item.orderValue)}</span>
          </div><div className="ranking-track"><div style={{width: `${item.quantity / maxProduct * 100}%`}}/></div></div>
        </div>)}
      </div> : !isLoading && !error ? <Empty message="Chưa có món nào được thanh toán từ phiên THỰC trong khoảng thời gian này."/> : null}
    </section>
    <div className="real-report-disclaimer"><ArrowUpRight size={17}/>
      Tiền đã thu không đồng nghĩa lợi nhuận: hệ thống chưa tính đầy đủ hoàn tiền, giá vốn, chi phí và thuế. Không chuyển dữ liệu DEMO thành doanh thu thực.
    </div>
  </>;
}
