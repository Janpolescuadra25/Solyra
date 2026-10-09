import type { SystemPriority, NeuroBusFrame, PriorityQueueDepth } from '@solyra/shared';

const PRIORITY_ORDER: Record<SystemPriority, number> = {
  REFLEX: 0,
  SURVIVAL: 1,
  USER: 2,
  LEARNING: 3,
  IDLE: 4,
};

export interface PriorityQueueOptions { capacity?: number; }

export class BoundedPriorityQueue {
  private buckets: Record<SystemPriority, NeuroBusFrame[]> = {
    REFLEX: [],
    SURVIVAL: [],
    USER: [],
    LEARNING: [],
    IDLE: [],
  };

  private readonly capacity: number;
  private highWaterMark = 0;
  private droppedCount = 0;

  constructor(options: PriorityQueueOptions = {}) {
    this.capacity = options.capacity ?? 1000;
  }

  public enqueue(frame: NeuroBusFrame): boolean {
    const currentTotal = this.getTotalDepth();
    if (currentTotal >= this.capacity) {
      if (!this.shedLowPriority(frame.priority)) {
        this.droppedCount++;
        return false;
      }
    }
    this.buckets[frame.priority].push(frame);
    const newTotal = this.getTotalDepth();
    if (newTotal > this.highWaterMark) { this.highWaterMark = newTotal; }
    return true;
  }

  public dequeue(): NeuroBusFrame | undefined {
    for (const priority of ['REFLEX','SURVIVAL','USER','LEARNING','IDLE'] as SystemPriority[]) {
      const bucket = this.buckets[priority];
      if (bucket.length > 0) { return bucket.shift(); }
    }
    return undefined;
  }

  public peek(): NeuroBusFrame | undefined {
    for (const priority of ['REFLEX','SURVIVAL','USER','LEARNING','IDLE'] as SystemPriority[]) {
      const bucket = this.buckets[priority];
      if (bucket.length > 0) { return bucket[0]; }
    }
    return undefined;
  }

  public getDepth(): PriorityQueueDepth {
    const depth: PriorityQueueDepth = {
      REFLEX: this.buckets.REFLEX.length,
      SURVIVAL: this.buckets.SURVIVAL.length,
      USER: this.buckets.USER.length,
      LEARNING: this.buckets.LEARNING.length,
      IDLE: this.buckets.IDLE.length,
      total: this.getTotalDepth(),
    };
    return depth;
  }

  public getCapacity(): number { return this.capacity; }
  public getHighWaterMark(): number { return this.highWaterMark; }
  public getDroppedCount(): number { return this.droppedCount; }
  public clear(): void { for (const p of Object.keys(this.buckets) as SystemPriority[]) { this.buckets[p] = []; } }

  private getTotalDepth(): number {
    return this.buckets.REFLEX.length + this.buckets.SURVIVAL.length + this.buckets.USER.length + this.buckets.LEARNING.length + this.buckets.IDLE.length;
  }

  private shedLowPriority(incomingPriority: SystemPriority): boolean {
    const incomingWeight = PRIORITY_ORDER[incomingPriority];
    if (this.buckets.IDLE.length > 0 && incomingWeight < PRIORITY_ORDER.IDLE) { this.buckets.IDLE.shift(); this.droppedCount++; return true; }
    if (this.buckets.LEARNING.length > 0 && incomingWeight < PRIORITY_ORDER.LEARNING) { this.buckets.LEARNING.shift(); this.droppedCount++; return true; }
    if (this.buckets.USER.length > 0 && incomingWeight < PRIORITY_ORDER.USER) { this.buckets.USER.shift(); this.droppedCount++; return true; }
    return false;
  }
}
