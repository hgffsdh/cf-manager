#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Safely enable paid-bank confirmation UI on the Mộc Café guest screen.
Only updates frontend/src/pages/Guest.tsx and creates GuestBankPayment.css.
"""
from pathlib import Path
from datetime import datetime
import argparse
import re
import shutil
import sys

STYLE = r"""/* Mộc Café – bank transfer status (guest) */
.moc-bank-paid-panel {
  padding: 22px 18px;
  border: 1px solid #bbdfc9;
  border-radius: 18px;
  background: linear-gradient(145deg, #ecf8ef 0%, #ffffff 85%);
  color: #194f37;
  text-align: center;
}
.moc-bank-paid-panel svg { color: #259263; }
.moc-bank-paid-panel h3 { margin: 12px 0 8px; color: #165035; font-size: 1.3rem; }
.moc-bank-paid-panel p { margin: 8px 0; line-height: 1.6; }
.moc-bank-paid-panel .moc-bank-paid-subtitle { color: #587365; font-weight: 600; }
.moc-bank-paid-panel .moc-bank-paid-close { margin-top: 14px; }
.moc-order-paid-note {
  border: 1px solid #cfe8d9;
  border-radius: 12px;
  background: #f2faf5;
  padding: 12px 14px;
  color: #1b6748;
  font-size: 13px;
  line-height: 1.6;
  display: flex;
  gap: 9px;
  align-items: flex-start;
  margin: 12px 0;
}
.moc-order-paid-note svg { flex-shrink: 0; margin-top: 2px; }
@media (prefers-reduced-motion: reduce) {
  .moc-bank-paid-panel, .moc-order-paid-note { animation: none !important; }
}
"""

MESSAGE_HELPER = """// MOC_BANK_SUCCESS_PATCH_V1: show the REAL fulfillment state after confirmed payment.
function mocBankFulfillmentMessage(order?: GuestOrder): string {
  if (!order || order.acceptanceStatus === 'Pending') {
    return 'Quán đã được thông báo. Đơn đang chờ nhân viên xác nhận trước khi pha chế.';
  }
  if (order.acceptanceStatus === 'Rejected' || order.fulfillmentStatus === 'Cancelled') {
    return 'Đơn đã bị từ chối hoặc hủy. Vui lòng liên hệ nhân viên để được hỗ trợ.';
  }
  if (order.fulfillmentStatus === 'Served') return 'Các món đã được mang ra bàn. Chúc bạn ngon miệng!';
  if (order.fulfillmentStatus === 'Ready' || order.fulfillmentStatus === 'PartiallyReady') {
    return 'Món đã sẵn sàng một phần hoặc toàn bộ. Nhân viên sẽ mang ra cho bạn.';
  }
  if (order.fulfillmentStatus === 'Preparing') return 'Quán đang pha chế món của bạn.';
  if (order.fulfillmentStatus === 'PartiallyServed') return 'Một phần món đã được phục vụ, quán đang hoàn tất các món còn lại.';
  return 'Đơn đã được xác nhận và đang trong hàng chờ pha chế.';
}

"""

PAID_STATE = """  // Prefer the server-confirmed Paid status from either guest endpoint.
  const trackedBankOrder = orders?.find(o => o.id === bankOrderId);
  const bankConfirmedPaid = Boolean(bankOrderId && (
    trackedBankOrder?.paymentStatus === 'Paid' || bankData?.paymentStatus === 'Paid'
  ));
  const paidNotifiedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!bankOrderId || !bankConfirmedPaid || paidNotifiedRef.current === bankOrderId) return;
    paidNotifiedRef.current = bankOrderId;
    setBanner('✅ Thanh toán chuyển khoản thành công! ' + mocBankFulfillmentMessage(trackedBankOrder));
    setTab('orders');
  }, [bankOrderId, bankConfirmedPaid, trackedBankOrder?.acceptanceStatus, trackedBankOrder?.fulfillmentStatus]);

  // Also notify if the customer closed the QR panel before the cashier confirmed.
  const previouslyObservedPaymentsRef = useRef<Record<string,string>>({});
  useEffect(() => {
    if (!orders) return;
    for (const order of orders) {
      const previous = previouslyObservedPaymentsRef.current[order.id];
      previouslyObservedPaymentsRef.current[order.id] = order.paymentStatus;
      if (order.paymentMethod !== 'BankTransfer' || previous === undefined ||
          previous === 'Paid' || order.paymentStatus !== 'Paid' ||
          paidNotifiedRef.current === order.id) continue;
      paidNotifiedRef.current = order.id;
      setBanner('✅ Thanh toán chuyển khoản thành công! ' + mocBankFulfillmentMessage(order));
      setTab('orders');
    }
  }, [orders]);
"""

BANK_PANEL = """{bankOrderId && <div className="demo-action" style={{textAlign:'center'}}>
      {bankConfirmedPaid ? <div className="moc-bank-paid-panel" role="status" aria-live="polite">
        <CheckCircle2 size={48} aria-hidden="true" />
        <h3>Thanh toán thành công!</h3>
        <p>Quán đã xác nhận nhận tiền chuyển khoản cho đơn <strong>{trackedBankOrder?.orderNumber ?? bankData?.orderNumber ?? ''}</strong>.</p>
        <p className="moc-bank-paid-subtitle">{mocBankFulfillmentMessage(trackedBankOrder)}</p>
        <button type="button" className="btn btn-outline moc-bank-paid-close" onClick={() => setBankOrderId(null)}>Đóng thông báo</button>
      </div> : <>
        <strong>Thông tin chuyển khoản ngân hàng</strong>
        <p>Vui lòng chuyển đúng số tiền và nội dung. Chỉ nhân viên sau khi đối chiếu sao kê mới được xác nhận đã thu.</p>
        <ErrorText error={bankError}/>
        {bankData && <>
          <div className="demo-qr"><img src={bankData.bank.qrImageUrl} alt="VietQR thanh toán" style={{maxWidth:'100%',maxHeight:330,borderRadius:10}}/></div>
          <p><b>{bankData.bank.accountName}</b> · Ngân hàng {bankData.bank.bankId}</p>
          <p>Số tài khoản: <b>{bankData.bank.accountNo}</b> <button type="button" onClick={() => void navigator.clipboard.writeText(bankData.bank.accountNo)}><Copy size={15}/></button></p>
          <p>Chuyển đúng <b>{money(bankData.bank.amount)}</b></p>
          <p>Nội dung chuyển khoản: <b>{bankData.bank.referenceCode}</b> <button type="button" onClick={() => void navigator.clipboard.writeText(bankData.bank.referenceCode)}><Copy size={15}/></button></p>
          <p>Đang chờ nhân viên xác minh tiền đã vào tài khoản của quán.</p>
          <button type="button" className="btn btn-outline" onClick={() => void reportTransfer(bankOrderId)}>Tôi đã chuyển · Yêu cầu nhân viên kiểm tra</button>
        </>}
        <button type="button" className="btn btn-outline" onClick={() => setBankOrderId(null)}>Thu gọn mã chuyển khoản</button>
      </>}
    </div>}"""

ORDER_NOTE = """{o.paymentMethod === 'BankTransfer' && o.paymentStatus === 'Paid' &&
        <div className="moc-order-paid-note" role="status"><CheckCircle2 size={18} aria-hidden="true" />
          <span><strong>Đã thanh toán chuyển khoản.</strong> {mocBankFulfillmentMessage(o)}</span>
        </div>}
        <div className="guest-order-total">Tổng đơn"""


def patch(source: str) -> str:
    if 'MOC_BANK_SUCCESS_PATCH_V1' in source:
        raise ValueError('Guest.tsx đã cài bản vá này rồi; không cần cài lại.')
    if 'GuestBankPayment.css' in source:
        raise ValueError('Guest.tsx đã tham chiếu GuestBankPayment.css; kiểm tra bản vá cũ trước khi cài.')

    lucide = re.search(r"import\s*\{([^}]+)\}\s*from\s*['\"]lucide-react['\"];", source)
    if not lucide:
        raise ValueError('Không tìm thấy import lucide-react; Layout Guest.tsx đã thay đổi.')
    if 'CheckCircle2' not in lucide.group(1):
        new_import = lucide.group(0).replace('} from', ', CheckCircle2 } from').replace(' , CheckCircle2', ', CheckCircle2')
        # Fix double comma if source import ends with comma.
        new_import = new_import.replace(',, CheckCircle2', ', CheckCircle2')
        source = source[:lucide.start()] + new_import + source[lucide.end():]

    import_realtime = re.search(r"(?m)^import\s*\{\s*useRealtime\s*\}\s*from\s*['\"]\.\./lib/realtime['\"];", source)
    if not import_realtime:
        raise ValueError('Không tìm thấy import useRealtime; không sửa để tránh sai file.')
    source = source[:import_realtime.end()] + "\nimport './GuestBankPayment.css';" + source[import_realtime.end():]

    if 'function GuestInside(' not in source:
        raise ValueError('Không tìm thấy GuestInside(); không sửa để tránh sai component.')
    source = source.replace('function GuestInside(', MESSAGE_HELPER + 'function GuestInside(', 1)

    # Avoid fragile regex against generic types; replace just the unique suffix of the existing orders query.
    query_anchor = "api<GuestOrder[]>('/guest/orders',{},'guest')});"
    if source.count(query_anchor) != 1:
        raise ValueError('Không xác định được duy nhất useQuery guest-orders. Cần kiểm tra mã hiện tại.')
    source = source.replace(query_anchor, "api<GuestOrder[]>('/guest/orders',{},'guest'),refetchInterval:10000});", 1)

    # Guest bank query currently polls at 15 seconds. Insert state after its closing line.
    query_end = re.search(r'refetchInterval\s*:\s*15000\s*\}\);', source)
    if not query_end or 'guest-bank-info' not in source[max(0,query_end.start()-250):query_end.start()]:
        raise ValueError('Không tìm thấy cuối useQuery guest-bank-info. Dừng an toàn.')
    source = source[:query_end.end()] + '\n' + PAID_STATE + source[query_end.end():]

    start_mark = '{bankOrderId&&<div className="demo-action"'
    end_mark = '}{orders?.map('
    start = source.find(start_mark)
    end = source.find(end_mark, start if start >= 0 else 0)
    if start < 0 or end < 0 or end < start:
        raise ValueError('Không tìm thấy khối mã QR gốc; không thể thay thế an toàn.')
    source = source[:start] + BANK_PANEL + source[end+1:]

    order_total = '<div className="guest-order-total">Tổng đơn'
    if source.count(order_total) != 1:
        raise ValueError('Không tìm thấy duy nhất phần tổng tiền trong thẻ đơn khách.')
    source = source.replace(order_total, ORDER_NOTE, 1)
    return source


def main():
    ap=argparse.ArgumentParser(description='Kích hoạt UI chuyển khoản thành công Mộc Café OS')
    ap.add_argument('--project',required=True,help=r'Ví dụ A:\MocCafeOS')
    args=ap.parse_args()
    root=Path(args.project).expanduser().resolve()
    guest=root/'frontend'/'src'/'pages'/'Guest.tsx'
    css=root/'frontend'/'src'/'pages'/'GuestBankPayment.css'
    if not guest.is_file():
        sys.exit(f'[ERROR] Không thấy: {guest}')
    if css.exists():
        sys.exit(f'[ERROR] File CSS đã tồn tại: {css}; dừng để tránh ghi đè.')
    try:
        raw=guest.read_bytes()
        encoding='utf-8-sig' if raw.startswith(b'\xef\xbb\xbf') else 'utf-8'
        contents=raw.decode(encoding)
        new_content=patch(contents)
    except Exception as ex:
        sys.exit(f'[ERROR] {ex}')
    stamp=datetime.now().strftime('%Y%m%d-%H%M%S')
    backup=root/f'backup-guest-bank-payment-{stamp}'
    backup.mkdir(exist_ok=False)
    shutil.copy2(guest, backup/'Guest.tsx')
    # Keep newline choice consistent with existing file.
    newline='\r\n' if b'\r\n' in raw else '\n'
    encoded=new_content.replace('\r\n','\n').replace('\n',newline).encode(encoding)
    try:
        css.write_text(STYLE,encoding='utf-8')
        guest.write_bytes(encoded)
    except Exception:
        shutil.copy2(backup/'Guest.tsx',guest)
        if css.exists(): css.unlink()
        raise
    print('[OK] Da cap nhat:',guest)
    print('[OK] CSS:',css)
    print('[OK] Backup:',backup)
    print('[NEXT] cd /d "'+str(root/'frontend')+'"')
    print('[NEXT] npm run build')
    print('Khong can migration SQL hoac thay doi backend.')

if __name__=='__main__':
    main()
