// `dashboard:<slug>` -> dashboard-icons CDN logo (svg). Returns null otherwise,
// so callers fall through to the existing MDI / image-URL / upload handling.
export const dashboardIconUrl = (icon: string): string | null => {
  const m = /^dashboard:([a-z0-9._-]+)$/i.exec((icon || '').trim());
  return m
    ? `https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/svg/${m[1].toLowerCase()}.svg`
    : null;
};
