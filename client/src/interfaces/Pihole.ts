// GET /api/pihole data (null when Pi-hole isn't configured).
export interface PiholeStats {
  configured: true;
  queries: number;
  blocked: number;
  percentBlocked: number;
  domainsBlocked: number;
  blocking: 'enabled' | 'disabled' | 'failed' | 'unknown';
}
