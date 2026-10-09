import type { NeuroBusFrame, NeuroBusMetrics, SystemPriority } from '@solyra/shared';
import { BoundedPriorityQueue, type PriorityQueueOptions } from './priority-queue.js';
import { log } from '../logger.js';

export type FrameHandler<T = unknown> = (frame: NeuroBusFrame<T>) => void | Promise<void>;

export interface PublishInput<T = unknown> {
  priority: SystemPriority;
  channel: string;
  source: string;
  payload: T;
  id?: string;
  timestamp?: number;
}

export class NeuroBus {
  private queue: BoundedPriorityQueue;
  private subscribers = new Map<string, Set<FrameHandler>>();
  private totalPublished = 0;
  private totalProcessed = 0;
  private sequenceCounter = 0;

  constructor(options: PriorityQueueOptions = {}) { this.queue = new BoundedPriorityQueue(options); }

  public publish<T = unknown>(input: PublishInput<T>): NeuroBusFrame<T> {
    this.sequenceCounter++;
    const frame: NeuroBusFrame<T> = {
      id: input.id ?? `frame_${Date.now()}_${this.sequenceCounter}`,
      priority: input.priority,
      channel: input.channel,
      source: input.source,
      timestamp: input.timestamp ?? Date.now(),
      payload: input.payload,
    };

    const accepted = this.queue.enqueue(frame as NeuroBusFrame);
    if (!accepted) {
      log('warn', 'NeuroBus frame dropped under backpressure', { channel: frame.channel, priority: frame.priority, source: frame.source });
      return frame;
    }
    this.totalPublished++;
    if (frame.priority === 'REFLEX') { this.dispatchImmediate(frame); }
    return frame;
  }

  public subscribe<T = unknown>(channel: string, handler: FrameHandler<T>): () => void {
    if (!this.subscribers.has(channel)) { this.subscribers.set(channel, new Set()); }
    const handlers = this.subscribers.get(channel)!;
    handlers.add(handler as FrameHandler);
    return () => {
      handlers.delete(handler as FrameHandler);
      if (handlers.size === 0) { this.subscribers.delete(channel); }
    };
  }

  public async processNext(): Promise<boolean> {
    const frame = this.queue.dequeue();
    if (!frame) { return false; }
    await this.dispatch(frame);
    this.totalProcessed++;
    return true;
  }

  public async drain(maxFrames = 100): Promise<number> {
    let processed = 0;
    while (processed < maxFrames) {
      const hadFrame = await this.processNext();
      if (!hadFrame) break;
      processed++;
    }
    return processed;
  }

  public getMetrics(): NeuroBusMetrics {
    let activeSubscribers = 0;
    for (const handlers of this.subscribers.values()) { activeSubscribers += handlers.size; }
    return {
      totalPublished: this.totalPublished,
      totalProcessed: this.totalProcessed,
      totalDropped: this.queue.getDroppedCount(),
      queueDepth: this.queue.getDepth(),
      capacity: this.queue.getCapacity(),
      highWaterMark: this.queue.getHighWaterMark(),
      activeSubscribers,
    };
  }

  public reset(): void {
    this.queue.clear();
    this.subscribers.clear();
    this.totalPublished = 0;
    this.totalProcessed = 0;
    this.sequenceCounter = 0;
  }

  private dispatchImmediate(frame: NeuroBusFrame): void {
    const handlers = this.subscribers.get(frame.channel);
    if (handlers) {
      for (const handler of handlers) {
        try { handler(frame); } catch (err) { log('error', 'Error in synchronous reflex handler', { error: String(err), channel: frame.channel }); }
      }
    }
  }

  private async dispatch(frame: NeuroBusFrame): Promise<void> {
    const handlers = this.subscribers.get(frame.channel);
    if (!handlers || handlers.size === 0) return;
    for (const handler of handlers) {
      try { await handler(frame); } catch (err) { log('error', 'Error in asynchronous frame handler', { error: String(err), channel: frame.channel }); }
    }
  }
}

export const globalBus = new NeuroBus({ capacity: 1000 });
