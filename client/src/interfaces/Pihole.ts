// One configured Pi-hole (config.piholes). Guests only receive id and name.
export interface PiholeInstance {
  id: string;
  name: string;
  url?: string;
  version?: 5 | 6;
  skipTlsVerify?: boolean;
}

export interface PiholeStats {
  queries: number;
  blocked: number;
  percentBlocked: number;
  domainsBlocked: number;
  blocking: 'enabled' | 'disabled' | 'failed' | 'unknown';
  // Seconds until blocking switches back (v6 only), or null.
  timer: number | null;
}

// One entry of GET /api/pihole, per configured Pi-hole, in settings order.
export type PiholeResult =
  | ({ id: string; name: string; ok: true } & PiholeStats)
  | { id: string; name: string; ok: false; error: string };
