import type { ServiceToken } from '../types/plugin.types';
import type { EventBus } from '../core/EventBus';
import type { SyncService } from '../features/sync/services/SyncService';

function createToken<T>(name: string): ServiceToken<T> {
  return { name };
}

export const SERVICE_TOKENS = {
  EventBus: createToken<EventBus>('EventBus'),
  SyncService: createToken<SyncService>('SyncService'),
};
