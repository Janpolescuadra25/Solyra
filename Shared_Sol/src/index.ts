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

export interface ReadinessStatus {
  ready: boolean;
  brainstem: 'online' | 'standby' | 'error';
  homeostasis: 'normal' | 'pressure' | 'critical';
  storage: 'connected' | 'disconnected';
  activeSlots: number;
}
