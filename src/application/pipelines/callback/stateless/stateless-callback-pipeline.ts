import type { Pipe } from '../../pipeline';
import { runPipes } from '../../pipeline';
import type { StatelessCallbackContext } from './stateless-callback-context';

export type StatelessCallbackPipe = Pipe<StatelessCallbackContext>;

export class StatelessCallbackPipeline {
  constructor(private readonly pipes: readonly StatelessCallbackPipe[]) {}

  async run(context: StatelessCallbackContext): Promise<StatelessCallbackContext> {
    return runPipes(context, this.pipes);
  }
}
