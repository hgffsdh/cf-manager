import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { Coffee, CreditCard, Minus, Plus, ShoppingBag, Sparkles, X, ConciergeBell, ArrowRight, BellRing, Copy, Wallet } from 'lucide-react';
import { api, getGuestToken, GUEST_TOKEN, MenuCategory, MenuProduct, money, post, when } from '../lib/api';
import { Empty, ErrorText, Status } from '../components/Layout';
import { useRealtime } from '../lib/realtime';
type CartItem = {variantId:string;modifierOptionIds:string[];quantity:number;note:string;name:string;variantName:string;unitPrice:number;optionNames:string[];imageUrl?:string};
type GuestInfo = {tableName:string;isDemo:boolean;visitId:string};
type BankInfo = {orderNumber:string;paymentStatus:string;bank:{bankId:string;accountNo:string;accountName:string;amount:number;referenceCode:string;qrImageUrl:string;instruction:string}};
type GuestOrder = {id:string;orderNumber:string;createdAt:string;acceptanceStatus:string;fulfillmentStatus:string;paymentStatus:string;paymentMethod:string;totalAmount:number;items:{id:string;productName:string;quantity:number;readyQuantity:number;servedQuantity:number}[]};
function GuestInside({info,qr}:{info:GuestInfo;qr:string}) {
  const [cart,setCart]=useState<CartItem[]>(()=>{try{return JSON.parse(localStorage.getItem('moc.cart.'+qr)||'[]');}catch{return [];}}); const [product,setProduct]=useState<MenuProduct|null>(null); const [variant,setVariant]=useState('');const [options,setOptions]=useState<string[]>([]);const [qty,setQty]=useState(1);const [note,setNote]=useState(''); const [tab,setTab]=useState('menu');const [payMethod,setPayMethod]=useState<'Cash'|'BankTransfer'>('Cash');const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [banner,setBanner]=useState('');const [bankOrderId,setBankOrderId]=useState<string|null>(null); const keyRef=useRef<string|null>(null); const client=useQueryClient();
  const {data:menu,error:menuError}=useQuery({queryKey:['menu'],queryFn:()=>api<MenuCategory[]>('/guest/menu',{},'public')});
  const {data:payOptions}=useQuery({queryKey:['guest-payment-options',info.visitId],queryFn:()=>api<{cash:boolean;bankTransfer:boolean}>('/guest/payment-options',{},'guest')});
  const {data:orders}=useQuery({queryKey:['guest-orders',info.visitId],queryFn:()=>api<GuestOrder[]>('/guest/orders',{},'guest')});
  useRealtime(true,(type,event)=>{
    if (type==='OrderReady'||type==='OrderItemReady') {
      const k='moc.seen.'+event.eventId;
      if(!sessionStorage.getItem(k)) {
        sessionStorage.setItem(k,'yes');setBanner(type==='OrderReady'?'☕ Đơn của bạn đã làm xong!':'☕ Một phần món đã sẵn sàng!');
        if ('vibrate' in navigator) navigator.vibrate([200,120,200,120,200]);
      }
    }
    client.invalidateQueries();
  });
  useEffect(()=>{localStorage.setItem('moc.cart.'+qr,JSON.stringify(cart));},[cart,qr]);
  const subtotal=cart.reduce((s,x)=>s+x.unitPrice*x.quantity,0);const count=cart.reduce((s,x)=>s+x.quantity,0);
  const choose=(p:MenuProduct)=>{if(p.isSoldOut)return;setProduct(p);setVariant(p.variants[0]?.id??'');setOptions([]);setQty(1);setNote('');};
  const add=()=>{
    if(!product||!variant)return;
    for(const g of product.modifierGroups) { const n=g.options.filter(o=>options.includes(o.id)).length;if(n<g.minSelections||n>g.maxSelections){setError(`Chọn từ ${g.minSelections} đến ${g.maxSelections} lựa chọn cho ${g.name}`);return;} }
    const v=product.variants.find(x=>x.id===variant)!;const selected=product.modifierGroups.flatMap(g=>g.options.filter(o=>options.includes(o.id)));
    setCart(prev=>[...prev,{variantId:v.id,modifierOptionIds:options,quantity:qty,note,name:product.name,variantName:v.name,unitPrice:v.price+selected.reduce((s,x)=>s+x.price,0),optionNames:selected.map(x=>x.name),imageUrl:product.imageUrl}]);keyRef.current=null;setProduct(null);setError('');
  };
  const place=async()=>{
    if(!cart.length)return;setError('');setBusy(true);
    const items=cart.map(({variantId,modifierOptionIds,quantity,note})=>({variantId,modifierOptionIds,quantity,note}));
    try {
      const quote=await post<{total:number}>('/guest/quote',{items},'guest');
      if(quote.total!==subtotal&&!window.confirm(`Giá món đã thay đổi. Tổng mới: ${money(quote.total)}. Tiếp tục đặt?`))return;
      if(!keyRef.current)keyRef.current=crypto.randomUUID();
      const result=await post<{orderId:string;orderNumber:string;total:number;bankReference?:string}>('/guest/orders',{items,paymentMethod:payMethod,idempotencyKey:keyRef.current},'guest');
      setCart([]);keyRef.current=null;if(payMethod==='BankTransfer') setBankOrderId(result.orderId);setTab('orders');setBanner(`Đã gửi đơn ${result.orderNumber} thành công`);client.invalidateQueries();
    }catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}
  };
  const {data:bankData,error:bankError}=useQuery({queryKey:['guest-bank-info',bankOrderId],
    queryFn:()=>api<BankInfo>(`/guest/orders/${bankOrderId}/bank-details`,{},'guest'),enabled:!!bankOrderId,refetchInterval:15000});
  const reportTransfer=async(orderId:string)=>{setError('');try{
    const result=await post<{message:string}>(`/guest/orders/${orderId}/notify-transfer`,{},'guest');
    setBanner(result.message);void client.invalidateQueries({queryKey:['guest-orders',info.visitId]});
  }catch(e){setError(e instanceof Error?e.message:String(e));}};
  const requestSupport=async(type:string)=>{setError('');try{await post('/guest/support',{type},'guest');setBanner('Đã gửi yêu cầu đến nhân viên');}catch(e){setError(e instanceof Error?e.message:String(e));}};
  return <div className="guest-screen"><header className="guest-header"><div className="guest-logo"><Coffee size={25}/><strong>Mộc Café</strong></div><div className="guest-table">ĐANG PHỤC VỤ · {info.tableName}</div></header><div className="guest-hero"><div className="eyebrow light">WELCOME TO MỘC GARDEN</div><h1>Một chút cà phê,<br/><i>một chút bình yên.</i></h1><p>Chọn món bạn thích. Mộc sẽ chăm chút phần còn lại.</p><span className="guest-hero-icon">☕</span></div><div className="guest-tabs"><button className={tab==='menu'?'active':''} onClick={()=>setTab('menu')}>Thực đơn</button><button className={tab==='cart'?'active':''} onClick={()=>setTab('cart')}>Giỏ hàng {count>0&&<b>{count}</b>}</button><button className={tab==='orders'?'active':''} onClick={()=>setTab('orders')}>Đơn của tôi {orders?.length?`(${orders.length})`:''}</button></div><div className="guest-content">{banner&&<div className="guest-alert"><BellRing className="bell-shake" size={22}/><span>{banner}</span><button onClick={()=>setBanner('')}><X size={17}/></button></div>}{info.isDemo&&<div className="demo-notice">Đây là phiên thử nghiệm cũ. Hãy yêu cầu nhân viên đóng phiên và mở một phiên phục vụ thật để gọi món mới.</div>}<ErrorText error={error||menuError}/>
    {tab==='menu'&&<><div className="guest-title"><span>KHÁM PHÁ HƯƠNG VỊ</span><h2>Thực đơn của Mộc</h2></div>{menu?.map((cat,index)=><section className="menu-category" key={cat.id}><h3>{cat.name} <small>{cat.products.length} món</small></h3><div className="menu-grid">{cat.products.map((p,i)=><button className="menu-item" disabled={p.isSoldOut} key={p.id} onClick={()=>choose(p)}><span className={`menu-visual visual-${index}`}>{p.imageUrl?<img src={p.imageUrl} alt={p.name} className="menu-photo" loading="lazy"/>:index===2?['🥐','🍰','🍪'][i%3]:index===1?['🍑','🍹','🍵','🥭'][i%4]:['☕','🧋','🥛','☕'][i%4]}</span><div><strong>{p.name}</strong><span>{p.description}</span><b>{money(Math.min(...p.variants.map(v=>v.price)))}</b></div><span className="menu-add">{p.isSoldOut?'Hết món':<Plus size={19}/>}</span></button>)}</div></section>)}</>}
    {tab==='cart'&&<><div className="guest-title"><span>MÓN BẠN ĐÃ CHỌN</span><h2>Giỏ hàng của bạn</h2></div>{cart.length? <><div className="cart-list">{cart.map((x,i)=><div className="cart-line" key={i}><div className="cart-icon">{x.imageUrl?<img src={x.imageUrl} alt={x.name} className="menu-photo"/>:'☕'}</div><div className="grow"><strong>{x.name}</strong><span>Size {x.variantName}{x.optionNames.length?' · '+x.optionNames.join(', '):''}</span>{x.note&&<small>{x.note}</small>}<b>{money(x.unitPrice*x.quantity)}</b></div><div className="qty-control"><button onClick={()=>{setCart(old=>old.filter((_,idx)=>idx!==i));keyRef.current=null;}}><X size={15}/></button><span>x{x.quantity}</span></div></div>)}</div><div className="checkout-panel"><div className="checkout-total"><span>Tạm tính</span><b>{money(subtotal)}</b></div><div className="checkout-total grand"><span>Tổng thanh toán</span><b>{money(subtotal)}</b></div><h3>Phương thức thanh toán</h3><div className="pay-choices"><button className={payMethod==='Cash'?'selected':''} onClick={()=>{setPayMethod('Cash');keyRef.current=null;}}><Wallet size={21}/><b>Tiền mặt</b><small>Thanh toán tại quán</small></button>{payOptions?.bankTransfer&&<button className={payMethod==='BankTransfer'?'selected':''} onClick={()=>{setPayMethod('BankTransfer');keyRef.current=null;}}><CreditCard size={21}/><b>Chuyển khoản ngân hàng</b><small>Thanh toán thật · chờ đối soát</small></button>}</div>{!payOptions?.bankTransfer&&<p className="fine-print">Chuyển khoản sẽ xuất hiện khi quản lý cấu hình tài khoản nhận tiền thật. Bạn vẫn có thể thanh toán tiền mặt.</p>}<button className="btn btn-primary full checkout-button" disabled={busy||info.isDemo} onClick={place}>{busy?'Đang gửi đơn...':'Gửi đơn đến quán'} <ArrowRight size={20}/></button></div></>:<Empty message="Giỏ hàng đang trống. Hãy chọn một món thật ngon nhé!"/>}</>}
    {tab==='orders'&&<><div className="guest-title"><span>THEO DÕI PHỤC VỤ</span><h2>Đơn của bạn</h2></div>{bankOrderId&&<div className="demo-action" style={{textAlign:'center'}}>
      <strong>Thông tin chuyển khoản ngân hàng</strong>
      <p>Đây là giao dịch THẬT. Chỉ chuyển tiền tới tài khoản của quán và giữ lại chứng từ.</p>
      <ErrorText error={bankError}/>
      {bankData&&<>
        <div className="demo-qr"><img src={bankData.bank.qrImageUrl} alt="VietQR chuyển khoản thật tới tài khoản của quán" style={{maxWidth:'100%',maxHeight:330,borderRadius:10}}/></div>
        <p><b>{bankData.bank.accountName}</b> · Ngân hàng {bankData.bank.bankId}</p>
        <p>Số tài khoản: <b>{bankData.bank.accountNo}</b> <button type="button" onClick={()=>void navigator.clipboard.writeText(bankData.bank.accountNo)}><Copy size={15}/></button></p>
        <p>Chuyển đúng <b>{money(bankData.bank.amount)}</b></p>
        <p>Nội dung chuyển khoản: <b>{bankData.bank.referenceCode}</b> <button type="button" onClick={()=>void navigator.clipboard.writeText(bankData.bank.referenceCode)}><Copy size={15}/></button></p>
        <p style={{fontWeight:600}}>QR KHÔNG tự xác nhận đã nhận tiền. Quán sẽ đối chiếu sao kê trước khi cập nhật Paid.</p>
        {bankData.paymentStatus!=='Paid'&&<button className="btn btn-outline" onClick={()=>void reportTransfer(bankOrderId)}>Tôi đã chuyển · Yêu cầu nhân viên kiểm tra</button>}
        {bankData.paymentStatus==='Paid'&&<p>Đã được thu ngân xác nhận nhận tiền.</p>}
      </>}
      <button className="btn btn-outline" onClick={()=>setBankOrderId(null)}>Thu gọn thông tin thanh toán</button>
    </div>}{orders?.map(o=><div className="guest-order" key={o.id}><div className="guest-order-head"><strong>{o.orderNumber}</strong><span>{when(o.createdAt)}</span></div><div className="guest-order-tags"><Status value={o.acceptanceStatus}/><Status value={o.fulfillmentStatus}/><Status value={o.paymentStatus}/></div>{o.items.map(i=><div className="guest-item-status" key={i.id}><span>{i.quantity}× {i.productName}</span><span>Xong {i.readyQuantity}/{i.quantity} · Đã mang {i.servedQuantity}</span></div>)}<div className="guest-order-total">Tổng đơn <strong>{money(o.totalAmount)}</strong></div></div>)}{orders?.filter(o=>o.paymentMethod==='BankTransfer'&&o.paymentStatus!=='Paid'&&o.acceptanceStatus!=='Rejected').map(o=><button className="btn btn-outline" key={'bank-'+o.id} onClick={()=>setBankOrderId(o.id)}>Xem mã chuyển khoản thật cho {o.orderNumber}</button>)}{!orders?.length&&<Empty message="Bạn chưa gửi đơn nào trong phiên này."/>}</>}
    <div className="guest-support"><h3>Cần thêm hỗ trợ?</h3><p>Nhân viên của Mộc luôn sẵn sàng giúp bạn.</p><div><button onClick={()=>requestSupport('CallStaff')}><ConciergeBell size={20}/> Gọi nhân viên</button><button onClick={()=>requestSupport('Water')}>💧 Xin thêm nước</button><button onClick={()=>requestSupport('Payment')}><CreditCard size={20}/> Yêu cầu thanh toán</button></div></div></div>{tab==='menu'&&count>0&&<button className="floating-cart" onClick={()=>setTab('cart')}><ShoppingBag size={21}/> Giỏ hàng · {count} món <strong>{money(subtotal)}</strong><ArrowRight size={20}/></button>}
    {product&&<div className="overlay" onClick={()=>setProduct(null)}><div className="dialog product-dialog" onClick={e=>e.stopPropagation()}><button className="close" onClick={()=>setProduct(null)}><X size={20}/></button><div className="product-art">{product.imageUrl?<img src={product.imageUrl} alt={product.name} className="menu-photo"/>:'☕'}</div><h2>{product.name}</h2><p>{product.description}</p><label>Chọn size</label><div className="size-choice">{product.variants.map(v=><button className={v.id===variant?'on':''} key={v.id} onClick={()=>setVariant(v.id)}>{v.name}<small>{money(v.price)}</small></button>)}</div>{product.modifierGroups.map(g=><div key={g.id}><label>{g.name} <small>(tối đa {g.maxSelections})</small></label><div className="topping-options">{g.options.map(o=><label key={o.id}><input type="checkbox" checked={options.includes(o.id)} onChange={e=>setOptions(old=>e.target.checked?[...old,o.id]:old.filter(x=>x!==o.id))}/><span>{o.name}</span><b>+{money(o.price)}</b></label>)}</div></div>)}<label>Ghi chú cho quán</label><input value={note} onChange={e=>setNote(e.target.value)} placeholder="Ít đá, ít ngọt..."/><div className="add-product-footer"><div className="quantity"><button onClick={()=>setQty(v=>Math.max(1,v-1))}><Minus size={17}/></button><strong>{qty}</strong><button onClick={()=>setQty(v=>Math.min(30,v+1))}><Plus size={17}/></button></div><button className="btn btn-primary" onClick={add}><Plus size={18}/> Thêm vào giỏ</button></div></div></div>}
    <footer className="guest-footer"><Sparkles size={16}/> Made with care by Mộc Café</footer></div>;
}
export default function Guest() {
  const {qr=''}=useParams(); const [info,setInfo]=useState<GuestInfo|null>(null);const [error,setError]=useState('');
  useEffect(()=>{let live=true;const load=async()=>{try{const cached=sessionStorage.getItem('moc.visit.'+qr);if(cached&&getGuestToken()){try{await api('/guest/me',{},'guest');if(live)setInfo(JSON.parse(cached));return;}catch{sessionStorage.removeItem(GUEST_TOKEN);sessionStorage.removeItem('moc.visit.'+qr);}}const result=await post<GuestInfo&{guestToken:string}>('/guest/join',{qrToken:qr},'public');sessionStorage.setItem(GUEST_TOKEN,result.guestToken);sessionStorage.setItem('moc.visit.'+qr,JSON.stringify({tableName:result.tableName,isDemo:result.isDemo,visitId:result.visitId}));if(live)setInfo(result);}catch(e){if(live)setError(e instanceof Error?e.message:String(e));}};void load();return()=>{live=false;};},[qr]);
  if(error)return <div className="guest-loading"><Coffee size={42}/><h2>Chưa thể vào bàn</h2><ErrorText error={error}/><p>Hãy nhờ nhân viên mở phiên và tạo QR mới.</p></div>;
  if(!info)return <div className="guest-loading"><Coffee size={42}/><p>Đang mở thực đơn Mộc Café...</p></div>;
  return <GuestInside info={info} qr={qr}/>;
}
