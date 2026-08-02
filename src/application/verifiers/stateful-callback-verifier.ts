import type {
  CallbackVerifier,
  StoredCallbackOutcome,
} from '../../core/contracts/callback-verifier';
import { isCallbackRejectionReason } from '../../domain/enums/callback-rejection-reason';
import type { CallbackPayload } from '../../domain/value-objects/callback-payload';
import type { SispEventEmitter } from '../events';
import { CallbackContext } from '../pipelines/callback/callback-context';
import type { HandleCallbackPipeline } from '../pipelines/callback/handle-callback-pipeline';

export class StatefulCallbackVerifier implements CallbackVerifier<StoredCallbackOutcome> {
  constructor(
    private readonly pipeline: HandleCallbackPipeline,
    private readonly events: SispEventEmitter,
  ) {}

  async verify(payload: CallbackPayload): Promise<StoredCallbackOutcome> {
    const context = await this.pipeline.run(new CallbackContext(payload));
    const reason = isCallbackRejectionReason(context.failureReason) ? context.failureReason : null;
    const outcome: StoredCallbackOutcome = {
      verified: !context.failed(),
      reason,
      payload,
      transaction: context.requireTransaction(),
      replay: context.replay,
    };

    this.events.emit(outcome.verified ? 'callback:verified' : 'callback:rejected', {
      payload: outcome.payload,
      reason: outcome.reason,
    });

    return outcome;
  }
}
