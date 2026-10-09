/**
 * Solyra Core Types & System Contracts
 */

export type SystemPriority = 'REFLEX' | 'SURVIVAL' | 'USER' | 'LEARNING' | 'IDLE';

export interface HealthStatus {
  status: 'ok' | 'degraded' | 'unhealthy';
  uptimeSeconds: number;
  timestamp: string;
  version: string;
  service: string;
}

export type BrainstemState = 'OFFLINE' | 'BOOTING' | 'STANDBY' | 'ONLINE' | 'DEGRADED' | 'SHUTTING_DOWN';

export interface ReadinessStatus {
  ready: boolean;
  brainstem: 'online' | 'standby' | 'error' | BrainstemState;
  homeostasis: 'normal' | 'pressure' | 'critical';
  storage: 'connected' | 'disconnected';
  activeSlots: number;
  neurobus?: 'online' | 'offline' | 'degraded';
  arousal?: ArousalLevel;
}

export interface NeuroBusFrame<T = unknown> {
  id: string;
  priority: SystemPriority;
  channel: string;
  source: string;
  timestamp: number;
  payload: T;
}

export interface PriorityQueueDepth {
  REFLEX: number;
  SURVIVAL: number;
  USER: number;
  LEARNING: number;
  IDLE: number;
  total: number;
}

export interface NeuroBusMetrics {
  totalPublished: number;
  totalProcessed: number;
  totalDropped: number;
  queueDepth: PriorityQueueDepth;
  capacity: number;
  highWaterMark: number;
  activeSubscribers: number;
}

export type ArousalLevel = 'sleep' | 'drowsy' | 'alert' | 'hyperaroused';

export interface ArousalState {
  level: ArousalLevel;
  metabolicPressure: number;
  memoryPressure: number;
  timestamp: string;
}

export interface HomeostasisTelemetry {
  arousal: ArousalState;
  memory: {
    heapUsedBytes: number;
    heapTotalBytes: number;
    rssBytes: number;
    heapPercent: number;
  };
  sampleTimestamp: string;
}

export interface ThalamusGateDecision {
  accepted: boolean;
  reason?: string;
  assignedPriority: SystemPriority;
  channel: string;
}
