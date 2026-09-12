import { AsyncLocalStorage } from 'node:async_hooks';

const held = new AsyncLocalStorage<true>();

export class StatementQueue {
  private tail: Promise<unknown> = Promise.resolve();

  run<T>(work: () => Promise<T>): Promise<T> {
    if (held.getStore() === true) {
      return work();
    }

    const result = this.tail.then(() => held.run(true, work));

    this.tail = result.then(ignore, ignore);

    return result;
  }
}

function ignore(): void {
  return;
}
