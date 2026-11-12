
import { useQuery } from '@tanstack/react-query';
import {
  ArrowUpRight,
  ClipboardList,
  Coffee,
  ConciergeBell,
  Home,
  Wallet,
  TrendingUp,
  CircleCheck,
  ArrowRight,
  UtensilsCrossed,
  ShieldCheck
} from 'lucide-react';

import { Link } from 'react-router-dom';
import { PageTitle, ErrorText } from '../components/Layout';
import { api, money } from '../lib/api';
import { isOwner } from '../lib/permissions';

// ================================
// TYPES
// ================================

type DashboardStats = {
  orders: number;
  pending: number;
  revenue: number;
  occupied: number;
  openService: number;
};

// ================================
// DASHBOARD
// ================================

export default function Dashboard() {
  // Luon kiem tra quyen trong component.
  // Khong dat isOwner() ben ngoai Dashboard.
  const owner = isOwner();

  // Chi Owner moi duoc goi API thong ke.
  const {
    data,
    error,
    isPending
  } = useQuery<DashboardStats>({
    queryKey: ['dashboard', 'real', owner],

    queryFn: () =>
      api<DashboardStats>(
        '/staff/dashboard?demo=false'
      ),

    enabled: owner,

    refetchInterval: owner ? 10000 : false,

    refetchOnWindowFocus: true,

    retry: 1
  });

  // ================================
  // DASHBOARD NHAN VIEN
  // ================================

  if (!owner) {
    return (
      <>
        <PageTitle
          eyebrow="KHÔNG GIAN NHÂN VIÊN"
          title="Chào mừng đến Mộc Café!"
          desc="Theo dõi công việc và phục vụ khách hàng mỗi ngày."
          action={
            <span className="date-chip">
              <CircleCheck size={16} />
              Hệ thống đang hoạt động
            </span>
          }
        />

        <div className="welcome-banner">
          <div className="welcome-text">
            <div className="eyebrow light">
              MỘC CAFÉ · STAFF WORKSPACE
            </div>

            <h2>
              Mỗi ly cà phê là
              <br />
              một trải nghiệm tuyệt vời.
            </h2>

            <p>
              Làm việc hiệu quả.
              Phục vụ tận tâm.
            </p>

            <Link
              className="btn btn-light"
              to="/admin/kitchen"
            >
              Xem công việc pha chế
              <ArrowRight size={18} />
            </Link>
          </div>

          <div className="coffee-art">
            <span>☕</span>
            <div className="art-ring art-ring-a" />
            <div className="art-ring art-ring-b" />
          </div>
        </div>

        <div className="section-title">
          <div>
            <h2>Không gian làm việc</h2>
            <p>
              Truy cập các công việc được
              phân quyền trong hệ thống.
            </p>
          </div>
        </div>

        <div className="quick-grid">
          <Link
            to="/admin/kitchen"
            className="quick-card"
          >
            <Coffee size={27} />

            <strong>Quầy pha chế</strong>

            <span>
              Theo dõi món chờ và đang làm
            </span>

            <ArrowUpRight
              size={20}
              className="quick-arrow"
            />
          </Link>

          <Link
            to="/admin/menu"
            className="quick-card"
          >
            <UtensilsCrossed size={27} />

            <strong>Báo hết món</strong>

            <span>
              Cập nhật trạng thái món
              còn bán hoặc hết hàng
            </span>

            <ArrowUpRight
              size={20}
              className="quick-arrow"
            />
          </Link>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            marginTop: 24,
            padding: '16px 20px',
            background: '#edf5ef',
            border: '1px solid #dce9de',
            borderRadius: 16,
            color: '#34664d'
          }}
        >
          <ShieldCheck size={20} />

          <span style={{ fontSize: 14 }}>
            Tài khoản nhân viên chỉ truy cập
            những chức năng được cấp quyền.
            Dữ liệu doanh thu và báo cáo
            được bảo vệ.
          </span>
        </div>
      </>
    );
  }

  // ================================
  // DASHBOARD OWNER
  // ================================

  const display = (
    value: string | number
  ): string | number => {
    if (isPending) return 'Đang tải...';

    if (error) return '—';

    return value;
  };

  const cards = [
    {
      icon: Wallet,
      label: 'Doanh thu hôm nay',
      value: display(
        money(data?.revenue ?? 0)
      ),
      detail: 'Tiền thực thu trong ngày',
      cls: 'green'
    },
    {
      icon: ClipboardList,
      label: 'Đơn hàng hôm nay',
      value: display(data?.orders ?? 0),
      detail: `${
        data?.pending ?? 0
      } đơn chờ tiếp nhận`,
      cls: 'clay'
    },
    {
      icon: Home,
      label: 'Chòi đang phục vụ',
      value: display(data?.occupied ?? 0),
      detail: 'Phiên đang mở',
      cls: 'blue'
    },
    {
      icon: ConciergeBell,
      label: 'Yêu cầu hỗ trợ',
      value: display(
        data?.openService ?? 0
      ),
      detail: 'Cần nhân viên xử lý',
      cls: 'orange'
    }
  ];

  return (
    <>
      {/* HEADER */}

      <PageTitle
        eyebrow="TỔNG QUAN VẬN HÀNH"
        title="Một ngày tốt lành tại Mộc!"
        desc="Theo dõi mọi hoạt động của quán trong thời gian thực."
        action={
          <span className="date-chip">
            <CircleCheck size={16} />
            Hệ thống đang hoạt động
          </span>
        }
      />

      {/* LOI API CHI HIEN VOI OWNER */}

      <ErrorText error={error} />

      {/* BANNER */}

      <div className="welcome-banner">
        <div className="welcome-text">
          <div className="eyebrow light">
            MỘC CAFÉ · GARDEN EXPERIENCE
          </div>

          <h2>
            Mỗi vị khách đều xứng đáng
            <br />
            có một trải nghiệm tuyệt vời.
          </h2>

          <p>
            Quản lý thông minh.
            Phục vụ tận tâm.
          </p>

          <Link
            className="btn btn-light"
            to="/admin/orders"
          >
            Xem đơn hàng
            <ArrowRight size={18} />
          </Link>
        </div>

        <div className="coffee-art">
          <span>☕</span>

          <div className="art-ring art-ring-a" />
          <div className="art-ring art-ring-b" />
        </div>
      </div>

      {/* THONG KE THUC */}

      <div className="metrics-grid">
        {cards.map(card => (
          <div
            className="metric-card"
            key={card.label}
          >
            <div className="metric-head">
              <span>{card.label}</span>

              <span
                className={`metric-icon ${card.cls}`}
              >
                <card.icon size={23} />
              </span>
            </div>

            <strong>
              {card.value}
            </strong>

            <div className="metric-detail">
              <TrendingUp size={14} />
              {card.detail}
            </div>
          </div>
        ))}
      </div>

      {/* TRUY CAP NHANH */}

      <div className="section-title">
        <div>
          <h2>Truy cập nhanh</h2>

          <p>
            Công việc thường xuyên trong ngày
          </p>
        </div>
      </div>

      <div className="quick-grid">
        <Link
          to="/admin/tables"
          className="quick-card"
        >
          <Home size={27} />

          <strong>Quản lý chòi</strong>

          <span>
            Mở phiên & tạo QR bàn
          </span>

          <ArrowUpRight
            size={20}
            className="quick-arrow"
          />
        </Link>

        <Link
          to="/admin/orders"
          className="quick-card"
        >
          <ClipboardList size={27} />

          <strong>Đơn hàng mới</strong>

          <span>
            Tiếp nhận & thanh toán
          </span>

          <ArrowUpRight
            size={20}
            className="quick-arrow"
          />
        </Link>

        <Link
          to="/admin/kitchen"
          className="quick-card"
        >
          <Coffee size={27} />

          <strong>Quầy pha chế</strong>

          <span>
            Theo dõi món và tiến độ
          </span>

          <ArrowUpRight
            size={20}
            className="quick-arrow"
          />
        </Link>

        <Link
          to="/admin/reports"
          className="quick-card"
        >
          <TrendingUp size={27} />

          <strong>Báo cáo</strong>

          <span>
            Thống kê kinh doanh
          </span>

          <ArrowUpRight
            size={20}
            className="quick-arrow"
          />
        </Link>
      </div>
    </>
  );
}
