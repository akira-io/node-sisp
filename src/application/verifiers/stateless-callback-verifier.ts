import type { CallbackOutcome, CallbackVerifier } from '../../core/contracts/callback-verifier';
import type { CallbackPayload } from '../../domain/value-objects/callback-payload';
import type { SispEventEmitter } from '../events';
import { StatelessCallbackContext } from '../pipelines/callback/stateless/stateless-callback-context';
import type { StatelessCallbackPipeline } from '../pipelines/callback/stateless/stateless-callback-pipeline';

export class StatelessCallbackVerifier implements CallbackVerifier<CallbackOutcome> {
  constructor(
    private readonly pipeline: StatelessCallbackPipeline,
    private readonly events: SispEventEmitter,
  ) {}

  async verify(payload: CallbackPayload): Promise<CallbackOutcome> {
    const context = await this.pipeline.run(new StatelessCallbackContext(payload));
    const outcome = context.toOutcome();

    this.events.emit(outcome.verified ? 'callback:verified' : 'callback:rejected', {
      payload: outcome.payload,
      reason: outcome.reason,
    });

    return outcome;
  }
}
