export const ADMIN_TOKEN = 'moc.staff.token';
export const GUEST_TOKEN = 'moc.guest.token';
export const getStaffToken = () => sessionStorage.getItem(ADMIN_TOKEN);
export const getGuestToken = () => sessionStorage.getItem(GUEST_TOKEN);
export async function api<T = unknown>(path: string, options: RequestInit = {}, type: 'staff' | 'guest' | 'public' = 'staff'): Promise<T> {
  const token = type === 'guest' ? getGuestToken() : type === 'staff' ? getStaffToken() : null;
  const headers = new Headers(options.headers || {});
  if (options.body && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  if (type === 'staff' && token) headers.set('Authorization', `Bearer ${token}`);
  if (type === 'guest' && token) headers.set('X-Guest-Token', token);
  const resp = await fetch(`/api/v1${path}`, { ...options, headers });
  if (resp.status === 204) return undefined as T;
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(json.message || json.detail || `Lỗi ${resp.status}`);
  return json as T;
}
export const post = <T = unknown>(path: string, payload: unknown, type: 'staff' | 'guest' | 'public' = 'staff') => api<T>(path, { method: 'POST', body: JSON.stringify(payload) }, type);
export const money = (n: number) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(n);
export const when = (s: string) => new Date(s).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
export type Order = { id: string; orderNumber: string; createdAt: string; table: string; visitSessionId: string; acceptanceStatus: string; fulfillmentStatus: string; paymentStatus: string; paymentMethod: string; bankReference?: string | null; totalAmount: number; isDemo: boolean; items: { id: string; productName: string; variantName: string; quantity: number; readyQuantity: number; servedQuantity: number; lineTotal: number; note: string }[] };
export type Table = { id: string; code: string; name: string; area: string; capacity: number; operationalStatus: string; visit: null | { id: string; isDemo: boolean; openedAt: string } };
export type ItemOption = { id: string; name: string; price: number };
export type MenuProduct = { id: string; name: string; description: string; imageUrl: string; isSoldOut: boolean; isFeatured: boolean; variants: ItemOption[]; modifierGroups: { id: string; name: string; minSelections: number; maxSelections: number; options: ItemOption[] }[] };
export type MenuCategory = { id: string; name: string; products: MenuProduct[] };
