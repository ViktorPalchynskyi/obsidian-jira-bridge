import type { ServiceToken } from '../types';

function assertServiceInstance<T>(_token: ServiceToken<T>, value: unknown): asserts value is T {
  if (value === undefined) {
    throw new Error('Service instance is undefined');
  }
}

export class ServiceContainer {
  private instances = new Map<string, unknown>();
  private factories = new Map<string, () => unknown>();
  private singletons = new Set<string>();

  register<T>(token: ServiceToken<T>, instance: T): void {
    this.instances.set(token.name, instance);
  }

  registerSingleton<T>(token: ServiceToken<T>, factory: () => T): void {
    this.factories.set(token.name, factory);
    this.singletons.add(token.name);
  }

  registerTransient<T>(token: ServiceToken<T>, factory: () => T): void {
    this.factories.set(token.name, factory);
  }

  get<T>(token: ServiceToken<T>): T {
    if (this.instances.has(token.name)) {
      const cached = this.instances.get(token.name);
      assertServiceInstance(token, cached);
      return cached;
    }

    const factory = this.factories.get(token.name);
    if (!factory) {
      throw new Error(`Service not registered: ${token.name}`);
    }

    const instance = factory();
    assertServiceInstance(token, instance);

    if (this.singletons.has(token.name)) {
      this.instances.set(token.name, instance);
    }

    return instance;
  }

  has<T>(token: ServiceToken<T>): boolean {
    return this.instances.has(token.name) || this.factories.has(token.name);
  }

  dispose(): void {
    this.instances.clear();
    this.factories.clear();
    this.singletons.clear();
  }
}
