import { AsyncLocalStorage } from 'node:async_hooks';

const storage = new AsyncLocalStorage<string>();

export function runWithLogSource<T>(source: string, callback: () => T): T {
  return storage.run(source, callback);
}

export function currentLogSource(): string {
  const source = storage.getStore();

  return source === undefined || source === '' ? 'model' : source;
}
