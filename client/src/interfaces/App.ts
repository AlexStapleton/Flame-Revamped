import { Model } from '.';

export interface NewApp {
  name: string;
  url: string;
  icon: string;
  isPublic: boolean;
  description: string;
  statusCheckEnabled: boolean;
  statusCheckUrl: string;
}

export interface App extends Model, NewApp {
  orderId: number;
  isPinned: boolean;
  // Read-only; present only on authenticated responses.
  status?: 'online' | 'offline' | null;
  statusCheckedAt?: string | null;
}
