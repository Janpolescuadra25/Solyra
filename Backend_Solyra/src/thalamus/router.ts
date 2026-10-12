import { ArousalLevel, SystemPriority } from '@solyra/shared';
import type { ArousalState, NeuroBusFrame, ThalamusGateDecision } from '@solyra/shared';
import { globalBus } from '../neurobus/neurobus.js';
import { globalHomeostasis } from '../homeostasis/monitor.js';
import { log } from '../logger.js';

export interface SensoryInput<T = unknown> {
  channel: string;
  source: string;
  payload: T;
}

export interface RouteRule {
  pattern: RegExp | string;
  priority: SystemPriority;
  minArousal?: ArousalLevel;
}

export interface RoutingResult {
  routed: boolean;
  channel: string;
  priority: SystemPriority;
  suppressed?: boolean;
  reason?: string;
}

const AROUSAL_ORDER: Record<ArousalLevel, number> = {
  sleep: 0,
  drowsy: 1,
  alert: 2,
  hyperaroused: 3,
};

function matchesPattern(pattern: RegExp | string, channel: string): boolean {
  if (pattern instanceof RegExp) {
    return pattern.test(channel);
  }

  if (pattern.includes('*')) {
    const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    return new RegExp(`^${escaped}$`).test(channel);
  }

  return channel === pattern || channel.startsWith(pattern);
}

export class ThalamusRouter {
  private bus: typeof globalBus;
  private homeostasis: typeof globalHomeostasis;
  private routes: RouteRule[] = [];
  private routedCount = 0;
  private suppressedCount = 0;

  constructor(bus = globalBus, homeostasis = globalHomeostasis) {
    this.bus = bus;
    this.homeostasis = homeostasis;
  }

  public registerRoute(pattern: RegExp | string, priority: SystemPriority, minArousal?: ArousalLevel): void {
    this.routes.push({ pattern, priority, minArousal });
  }

  private evaluateRoute(input: {
    channel: string;
    source: string;
    priority?: SystemPriority;
    payload: unknown;
  }): RoutingResult {
    const matchedRule = this.routes.find((rule) => matchesPattern(rule.pattern, input.channel));
    const targetPriority = matchedRule ? matchedRule.priority : (input.priority ?? SystemPriority.USER);
    const minArousal = matchedRule?.minArousal;
    const currentArousal = this.homeostasis.getArousalLevel();

    if (targetPriority === SystemPriority.REFLEX) {
      const publishResult = this.bus.publish({
        channel: input.channel,
        source: input.source,
        priority: targetPriority,
        payload: input.payload,
      });

      if (!publishResult.accepted) {
        this.suppressedCount++;
        return {
          routed: false,
          channel: input.channel,
          priority: targetPriority,
          suppressed: true,
          reason: 'Queue backpressure: frame dropped',
        };
      }

      this.routedCount++;
      return { routed: true, channel: input.channel, priority: targetPriority };
    }

    if (currentArousal === ArousalLevel.HYPERAROUSED && targetPriority !== SystemPriority.SURVIVAL) {
      this.suppressedCount++;
      log('warn', 'Thalamus sensory gating rejected low-priority input during hyperarousal', {
        channel: input.channel,
        source: input.source,
      });
      return {
        routed: false,
        channel: input.channel,
        priority: targetPriority,
        suppressed: true,
        reason: 'Hyperarousal protective suppression active',
      };
    }

    if (minArousal) {
      const currentRank = AROUSAL_ORDER[currentArousal];
      const requiredRank = AROUSAL_ORDER[minArousal];
      if (currentRank < requiredRank) {
        this.suppressedCount++;
        return {
          routed: false,
          channel: input.channel,
          priority: targetPriority,
          suppressed: true,
          reason: `Arousal level ${currentArousal} is below required threshold ${minArousal}`,
        };
      }
    }

    const publishResult = this.bus.publish({
      channel: input.channel,
      source: input.source,
      priority: targetPriority,
      payload: input.payload,
    });

    if (!publishResult.accepted) {
      this.suppressedCount++;
      return {
        routed: false,
        channel: input.channel,
        priority: targetPriority,
        suppressed: true,
        reason: 'Queue backpressure: frame dropped',
      };
    }

    this.routedCount++;
    return { routed: true, channel: input.channel, priority: targetPriority };
  }

  public async routeFrame(input: {
    channel: string;
    source: string;
    priority?: SystemPriority;
    payload: unknown;
  }): Promise<RoutingResult> {
    return this.evaluateRoute(input);
  }

  public routeInput<T = unknown>(source: string, payload: unknown): RoutingResult;
  public routeInput<T = unknown>(input: SensoryInput<T>): { decision: ThalamusGateDecision; frame?: NeuroBusFrame<T> };
  public routeInput<T = unknown>(
    sourceOrInput: string | SensoryInput<T>,
    payload?: unknown,
  ): RoutingResult | { decision: ThalamusGateDecision; frame?: NeuroBusFrame<T> } {
    if (typeof sourceOrInput === 'string') {
      return this.evaluateRoute({
        channel: 'sensory.input',
        source: sourceOrInput,
        priority: SystemPriority.USER,
        payload: payload ?? null,
      });
    }

    const input = sourceOrInput;
    const result = this.evaluateRoute({
      channel: input.channel,
      source: input.source,
      priority: SystemPriority.USER,
      payload: input.payload,
    });

    if (!result.routed) {
      return {
        decision: {
          accepted: false,
          reason: result.reason ?? 'Route suppressed',
          assignedPriority: result.priority,
          channel: input.channel,
        },
      };
    }

    return {
      decision: {
        accepted: true,
        assignedPriority: result.priority,
        channel: input.channel,
      },
      frame: undefined,
    };
  }

  public getRoutingStats(): { routedCount: number; suppressedCount: number; activeRoutes: number } {
    return {
      routedCount: this.routedCount,
      suppressedCount: this.suppressedCount,
      activeRoutes: this.routes.length,
    };
  }
}

export const globalThalamus = new ThalamusRouter();
