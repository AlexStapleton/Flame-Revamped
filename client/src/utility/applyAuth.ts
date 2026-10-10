export const applyAuth = () => {
  const token = localStorage.getItem('token') || '';
  return { 'Authorization-Flame': `Bearer ${token}` };
};

// True when a login token is stored. It may still turn out to be invalid; use
// this only for speculative work such as prefetching admin-only code.
export const hasStoredToken = (): boolean => {
  try {
    return Boolean(localStorage.getItem('token'));
  } catch {
    return false;
  }
};
