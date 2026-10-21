import { globalBus } from '../../neurobus/neurobus.js';

export interface LRUCacheOptions {
  maxEntries?: number;
  defaultTtlMs?: number;
}

export interface CacheStats {
  size: number;
  maxEntries: number;
  hits: number;
  misses: number;
  evictions: number;
}

export class LRUCache<K, V> {
  private readonly map = new Map<K, { value: V; expiresAt?: number }>();
  private readonly maxEntries: number;
  private readonly defaultTtlMs?: number;
  private hits = 0;
  private misses = 0;
  private evictions = 0;

  constructor(options: LRUCacheOptions = {}) {
    this.maxEntries = typeof options.maxEntries === 'number' && Number.isFinite(options.maxEntries) && options.maxEntries > 0
      ? Math.trunc(options.maxEntries)
      : 1000;

    this.defaultTtlMs = typeof options.defaultTtlMs === 'number' && Number.isFinite(options.defaultTtlMs) && options.defaultTtlMs > 0
      ? options.defaultTtlMs
      : undefined;
  }

  public get size(): number {
    return this.map.size;
  }

  private emitEvent(eventName: string, key: K, metadata: Record<string, unknown> = {}): void {
    globalBus.emit(eventName, { key: String(key), ...metadata });
  }

  public get(key: K): V | undefined {
    const entry = this.map.get(key);
    if (!entry) {
      this.misses++;
      this.emitEvent('storage:cache_miss', key, { expired: false });
      return undefined;
    }

    if (entry.expiresAt !== undefined && Date.now() > entry.expiresAt) {
      this.map.delete(key);
      this.misses++;
      this.emitEvent('storage:cache_miss', key, { expired: true });
      return undefined;
    }

    this.map.delete(key);
    this.map.set(key, entry);
    this.hits++;
    this.emitEvent('storage:cache_hit', key);
    return entry.value;
  }

  public set(key: K, value: V, ttlMs?: number): void {
    if (this.map.has(key)) {
      this.map.delete(key);
    } else if (this.map.size >= this.maxEntries) {
      const lruKey = this.map.keys().next().value;
      if (lruKey !== undefined) {
        this.map.delete(lruKey);
        this.evictions++;
        this.emitEvent('storage:cache_evicted', lruKey, {
          size: this.map.size,
          evictions: this.evictions,
        });
      }
    }

    const effectiveTtl = typeof ttlMs === 'number' ? ttlMs : this.defaultTtlMs;
    const expiresAt = typeof effectiveTtl === 'number' && effectiveTtl > 0 ? Date.now() + effectiveTtl : undefined;
    this.map.set(key, { value, expiresAt });
  }

  public has(key: K): boolean {
    const entry = this.map.get(key);
    if (!entry) {
      return false;
    }

    if (entry.expiresAt !== undefined && Date.now() > entry.expiresAt) {
      this.map.delete(key);
      return false;
    }

    return true;
  }

  public delete(key: K): boolean {
    return this.map.delete(key);
  }

  public clear(): void {
    this.map.clear();
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
  }

  public getStats(): CacheStats {
    return {
      size: this.map.size,
      maxEntries: this.maxEntries,
      hits: this.hits,
      misses: this.misses,
      evictions: this.evictions,
    };
  }
}
