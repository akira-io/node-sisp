import type { CallbackPipe } from '../../contracts/pipes';
import { runPipes } from '../pipeline';
import type { CallbackContext } from './callback-context';

export class HandleCallbackPipeline {
  constructor(private readonly pipes: readonly CallbackPipe[]) {}

  async run(context: CallbackContext): Promise<CallbackContext> {
    return runPipes(context, this.pipes);
  }
}
