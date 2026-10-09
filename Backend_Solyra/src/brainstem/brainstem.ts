import type { BrainstemState } from '@solyra/shared';
import { globalBus } from '../neurobus/index.js';
import { log } from '../logger.js';

export class Brainstem {
  private state: BrainstemState = 'OFFLINE';
  private heartbeatIntervalMs: number;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private lastWatchdogTick = 0;
  private heartbeatCount = 0;

  constructor(heartbeatIntervalMs = 5000) {
    this.heartbeatIntervalMs = heartbeatIntervalMs;
  }

  public async boot(): Promise<BrainstemState> {
    if (this.state === 'ONLINE' || this.state === 'BOOTING') {
      return this.state;
    }

    this.state = 'BOOTING';
    log('info', 'Brainstem boot sequence initiated');

    const busMetrics = globalBus.getMetrics();
    if (!busMetrics) {
      this.state = 'DEGRADED';
      log('error', 'Brainstem boot failed: NeuroBus unreachable');
      return this.state;
    }

    this.state = 'STANDBY';
    this.lastWatchdogTick = Date.now();
    this.startHeartbeat();

    this.state = 'ONLINE';
    log('info', 'Brainstem online and autonomous heartbeat engaged', {
      state: this.state,
      heartbeatIntervalMs: this.heartbeatIntervalMs,
    });

    return this.state;
  }

  public startHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }

    this.heartbeatTimer = setInterval(() => {
      this.emitHeartbeat();
    }, this.heartbeatIntervalMs);

    if (this.heartbeatTimer.unref) {
      this.heartbeatTimer.unref();
    }
  }

  public feedWatchdog(): void {
    this.lastWatchdogTick = Date.now();
  }

  public checkWatchdogLiveness(thresholdMs = 15000): boolean {
    const elapsed = Date.now() - this.lastWatchdogTick;
    return elapsed <= thresholdMs;
  }

  public async shutdown(reason = 'normal'): Promise<BrainstemState> {
    this.state = 'SHUTTING_DOWN';
    log('info', 'Brainstem shutdown sequence initiated', { reason });

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    globalBus.publish({
      priority: 'REFLEX',
      channel: 'system.shutdown',
      source: 'brainstem',
      payload: { reason, timestamp: Date.now() },
    });

    this.state = 'OFFLINE';
    log('info', 'Brainstem reached OFFLINE state');
    return this.state;
  }

  public getState(): BrainstemState {
    return this.state;
  }

  public getHeartbeatCount(): number {
    return this.heartbeatCount;
  }

  private emitHeartbeat(): void {
    this.heartbeatCount++;
    this.feedWatchdog();

    globalBus.publish({
      priority: 'SURVIVAL',
      channel: 'system.heartbeat',
      source: 'brainstem',
      payload: {
        tick: this.heartbeatCount,
        state: this.state,
        timestamp: Date.now(),
      },
    });
  }
}

export const globalBrainstem = new Brainstem(5000);
