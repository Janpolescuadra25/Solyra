import type { NeuroBusFrame, ThalamusGateDecision } from '@solyra/shared';
import { globalBus } from '../neurobus/index.js';
import { globalHomeostasis } from '../homeostasis/index.js';
import { log } from '../logger.js';

export interface SensoryInput<T = unknown> {
  channel: string;
  source: string;
  payload: T;
}

export class ThalamusRouter {
  public routeInput<T = unknown>(input: SensoryInput<T>): { decision: ThalamusGateDecision; frame?: NeuroBusFrame<T> } {
    const arousal = globalHomeostasis.getArousalLevel();

    if (arousal === 'hyperaroused' && input.channel.startsWith('background.')) {
      log('warn', 'Thalamus sensory gating rejected low-priority input during hyperarousal', {
        channel: input.channel,
        source: input.source,
      });
      return {
        decision: {
          accepted: false,
          reason: 'Sensory gated: Hyperaroused cognitive state',
          assignedPriority: 'IDLE',
          channel: input.channel,
        },
      };
    }

    const frame = globalBus.publish<T>({
      priority: 'USER',
      channel: input.channel,
      source: input.source,
      payload: input.payload,
    });

    return {
      decision: {
        accepted: true,
        assignedPriority: 'USER',
        channel: input.channel,
      },
      frame,
    };
  }
}

export const globalThalamus = new ThalamusRouter();
