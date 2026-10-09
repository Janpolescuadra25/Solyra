import type { ArousalLevel, ArousalState, HomeostasisTelemetry } from '@solyra/shared';
import { globalBus } from '../neurobus/index.js';
import { log } from '../logger.js';

export class HomeostasisMonitor {
  private currentArousal: ArousalLevel = 'alert';
  private lowRamCeilingBytes: number;

  constructor(lowRamCeilingBytes = 256 * 1024 * 1024) {
    this.lowRamCeilingBytes = lowRamCeilingBytes;
  }

  public sampleTelemetry(): HomeostasisTelemetry {
    const mem = process.memoryUsage();
    const heapPercent = mem.heapTotal > 0 ? mem.heapUsed / mem.heapTotal : 0;
    const memoryPressure = Math.min(1.0, mem.heapUsed / this.lowRamCeilingBytes);

    const busMetrics = globalBus.getMetrics();
    const queueDepth = busMetrics.queueDepth.total;
    const metabolicPressure = Math.min(1.0, queueDepth / 100);

    let computedArousal: ArousalLevel = 'alert';
    if (memoryPressure > 0.85 || metabolicPressure > 0.8) {
      computedArousal = 'hyperaroused';
    } else if (memoryPressure > 0.6 || metabolicPressure > 0.4) {
      computedArousal = 'alert';
    } else if (queueDepth === 0) {
      computedArousal = 'drowsy';
    }

    if (computedArousal !== this.currentArousal) {
      log('info', 'Arousal state modulated', {
        previous: this.currentArousal,
        current: computedArousal,
        memoryPressure: memoryPressure.toFixed(3),
        metabolicPressure: metabolicPressure.toFixed(3),
      });
      this.currentArousal = computedArousal;

      globalBus.publish({
        priority: 'SURVIVAL',
        channel: 'system.arousal',
        source: 'homeostasis',
        payload: { arousal: this.currentArousal, memoryPressure, metabolicPressure },
      });
    }

    const arousalState: ArousalState = {
      level: this.currentArousal,
      metabolicPressure,
      memoryPressure,
      timestamp: new Date().toISOString(),
    };

    return {
      arousal: arousalState,
      memory: {
        heapUsedBytes: mem.heapUsed,
        heapTotalBytes: mem.heapTotal,
        rssBytes: mem.rss,
        heapPercent,
      },
      sampleTimestamp: new Date().toISOString(),
    };
  }

  public getArousalLevel(): ArousalLevel {
    return this.currentArousal;
  }
}

export const globalHomeostasis = new HomeostasisMonitor();
