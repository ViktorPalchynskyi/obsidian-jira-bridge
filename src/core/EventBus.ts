import type { EventHandler, EventBus as EventBusType, EventName, EventMap } from '../types';

type HandlersStore = {
  [K in EventName]?: Set<EventHandler<K>>;
};

export class EventBus implements EventBusType {
  private handlers: HandlersStore = {};

  private setHandlers<K extends EventName>(event: K, handlers: Set<EventHandler<K>>): void {
    (this.handlers as Record<K, Set<EventHandler<K>>>)[event] = handlers;
  }

  private getOrCreateHandlers<K extends EventName>(event: K): Set<EventHandler<K>> {
    const existing = this.handlers[event];
    if (existing) {
      return existing;
    }
    const newSet = new Set<EventHandler<K>>();
    this.setHandlers(event, newSet);
    return newSet;
  }

  on<K extends EventName>(event: K, handler: EventHandler<K>): () => void {
    const eventHandlers = this.getOrCreateHandlers(event);
    eventHandlers.add(handler);
    return () => this.off(event, handler);
  }

  off<K extends EventName>(event: K, handler: EventHandler<K>): void {
    this.handlers[event]?.delete(handler);
  }

  async emit<K extends EventName>(event: K, payload: EventMap[K]): Promise<void> {
    const eventHandlers = this.handlers[event];
    if (!eventHandlers) return;

    for (const handler of eventHandlers) {
      await handler(payload);
    }
  }

  once<K extends EventName>(event: K, handler: EventHandler<K>): void {
    const wrapper: EventHandler<K> = async payload => {
      this.off(event, wrapper);
      await handler(payload);
    };
    this.on(event, wrapper);
  }

  clear(): void {
    this.handlers = {};
  }
}
