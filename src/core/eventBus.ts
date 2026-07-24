export type Unsubscribe = () => void;

export interface EventBus<EventMap extends object> {
  emit<Key extends keyof EventMap>(key: Key, event: EventMap[Key]): void;
  on<Key extends keyof EventMap>(
    key: Key,
    listener: (event: EventMap[Key]) => void,
  ): Unsubscribe;
  clear(): void;
}

export function createEventBus<EventMap extends object>(): EventBus<EventMap> {
  const listeners = new Map<keyof EventMap, Set<(event: unknown) => void>>();

  return {
    emit(key, event) {
      listeners.get(key)?.forEach((listener) => listener(event));
    },
    on(key, listener) {
      const bucket = listeners.get(key) ?? new Set();
      bucket.add(listener as (event: unknown) => void);
      listeners.set(key, bucket);
      return () => bucket.delete(listener as (event: unknown) => void);
    },
    clear() {
      listeners.clear();
    },
  };
}
