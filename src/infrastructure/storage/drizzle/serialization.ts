import { AsyncLocalStorage } from 'node:async_hooks';

interface Section {
  active: boolean;
  queue: StatementQueue;
}

const held = new AsyncLocalStorage<Section>();

export class StatementQueue {
  private tail: Promise<unknown> = Promise.resolve();

  get entered(): boolean {
    const section = held.getStore();

    return section?.active === true && section.queue === this;
  }

  run<T>(work: () => Promise<T>): Promise<T> {
    if (this.entered) {
      return work();
    }

    const section: Section = { active: true, queue: this };
    const result = this.tail.then(async () => {
      try {
        return await held.run(section, work);
      } finally {
        section.active = false;
      }
    });

    this.tail = result.then(ignore, ignore);

    return result;
  }
}

function ignore(): void {
  return;
}
