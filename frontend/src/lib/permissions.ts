import { getStaffToken } from './api';

// Frontend checks improve UX; the ASP.NET API is the actual security boundary.
const EMAIL = 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress';
const ROLE = 'http://schemas.microsoft.com/ws/2008/06/identity/claims/role';

export function isOwner(): boolean {
  const token = getStaffToken();
  if (!token) return false;
  try {
    const payload64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(payload64)) as Record<string, unknown>;
    const rawRoles = payload[ROLE] ?? payload.role ?? payload.roles;
    const roles: unknown[] = Array.isArray(rawRoles) ? rawRoles : [rawRoles];
    const email = payload[EMAIL] ?? payload.email;
    return roles.includes('Owner') && typeof email === 'string' &&
      email.toLowerCase() === 'owner@moccafe.local';
  } catch {
    return false;
  }
}
