export const loginPath = '/auth/login.html';
export const pendingPath = '/auth/access-pending';
export const zonesPath = '/zones';

export function normalizeEmail(email) {
  return String(email ?? '').trim().toLowerCase();
}

export function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function validateUrl(url) {
  try {
    const parsed = new URL(String(url));
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

export function getTeacherAccessDecision(user, profile) {
  if (!user) return loginPath;
  if (!profile?.active) return pendingPath;
  if (profile.role === 'student') return zonesPath;
  if (profile.role === 'admin' || profile.role === 'teacher') return null;
  return pendingPath;
}
