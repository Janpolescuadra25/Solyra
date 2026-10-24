import { globalBus } from '../../neurobus/neurobus.js';

export interface CacheStats {
  hits: number;
  misses: number;
  size: number;
  maxEntries: number;
  evictions: number;
  bytesUsed: number;
  maxSizeBytes: number;
}

export interface LRUCacheOptions<K, V> {
  maxEntries?: number;
  defaultTtlMs?: number;
  maxSizeBytes?: number;
  sizeCalculator?: (value: V, key: K) => number;
}

interface CacheEntry<V> {
  value: V;
  expiresAt: number | null;
  sizeBytes: number;
}

export class LRUCache<K, V> {
  private readonly maxEntries: number;
  private readonly defaultTtlMs: number;
  private readonly maxSizeBytes: number;
  private readonly sizeCalculator: (value: V, key: K) => number;
  private readonly cache = new Map<K, CacheEntry<V>>();

  private hits = 0;
  private misses = 0;
  private evictions = 0;
  private bytesUsed = 0;

  constructor(options: LRUCacheOptions<K, V> = {}) {
    this.maxEntries = typeof options.maxEntries === 'number' && Number.isFinite(options.maxEntries) && options.maxEntries > 0
      ? Math.trunc(options.maxEntries)
      : 1000;

    this.defaultTtlMs = typeof options.defaultTtlMs === 'number' && Number.isFinite(options.defaultTtlMs) && options.defaultTtlMs > 0
      ? options.defaultTtlMs
      : 0;

    this.maxSizeBytes = typeof options.maxSizeBytes === 'number' && Number.isFinite(options.maxSizeBytes) && options.maxSizeBytes > 0
      ? Math.trunc(options.maxSizeBytes)
      : 0;

    this.sizeCalculator = typeof options.sizeCalculator === 'function'
      ? options.sizeCalculator
      : (value: V, key: K) => this.defaultEstimateSize(value, key);
  }

  public get size(): number {
    return this.cache.size;
  }

  private defaultEstimateSize(value: V, key: K): number {
    try {
      const keySize = typeof key === 'string' ? Buffer.byteLength(key, 'utf8') : 16;
      let valSize = 64;

      if (typeof value === 'string') {
        valSize = Buffer.byteLength(value, 'utf8');
      } else if (typeof value === 'number') {
        valSize = 8;
      } else if (value !== null && typeof value === 'object') {
        valSize = Buffer.byteLength(JSON.stringify(value), 'utf8');
      }

      return keySize + valSize;
    } catch {
      return 128;
    }
  }

  private emitEvent(eventName: string, key: K, metadata: Record<string, unknown> = {}): void {
    globalBus.emit(eventName, { key: String(key), ...metadata });
  }

  public get(key: K): V | undefined {
    const entry = this.cache.get(key);
    if (!entry) {
      this.misses++;
      this.emitEvent('storage:cache_miss', key, { expired: false });
      return undefined;
    }

    if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.bytesUsed = Math.max(0, this.bytesUsed - entry.sizeBytes);
      this.misses++;
      this.emitEvent('storage:cache_miss', key, { expired: true });
      return undefined;
    }

    this.cache.delete(key);
    this.cache.set(key, entry);
    this.hits++;
    this.emitEvent('storage:cache_hit', key);
    return entry.value;
  }

  public set(key: K, value: V, ttlMs?: number): void {
    const sizeBytes = this.sizeCalculator(value, key);

    if (this.cache.has(key)) {
      const existing = this.cache.get(key)!;
      this.bytesUsed = Math.max(0, this.bytesUsed - existing.sizeBytes);
      this.cache.delete(key);
    }

    while (
      (this.maxEntries > 0 && this.cache.size >= this.maxEntries) ||
      (this.maxSizeBytes > 0 && this.bytesUsed + sizeBytes > this.maxSizeBytes && this.cache.size > 0)
    ) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey === undefined) {
        break;
      }

      const evicted = this.cache.get(oldestKey);
      if (evicted) {
        this.bytesUsed = Math.max(0, this.bytesUsed - evicted.sizeBytes);
      }

      this.cache.delete(oldestKey);
      this.evictions++;
      this.emitEvent('storage:cache_evicted', oldestKey, {
        size: this.cache.size,
        evictions: this.evictions,
      });
    }

    const effectiveTtl = typeof ttlMs === 'number' ? ttlMs : this.defaultTtlMs;
    const expiresAt = effectiveTtl > 0 ? Date.now() + effectiveTtl : null;
    this.cache.set(key, { value, expiresAt, sizeBytes });
    this.bytesUsed += sizeBytes;
  }

  public has(key: K): boolean {
    const entry = this.cache.get(key);
    if (!entry) {
      return false;
    }

    if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.bytesUsed = Math.max(0, this.bytesUsed - entry.sizeBytes);
      return false;
    }

    return true;
  }

  public delete(key: K): boolean {
    const entry = this.cache.get(key);
    if (!entry) {
      return false;
    }

    this.bytesUsed = Math.max(0, this.bytesUsed - entry.sizeBytes);
    return this.cache.delete(key);
  }

  public clear(): void {
    this.cache.clear();
    this.bytesUsed = 0;
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
  }

  public getStats(): CacheStats {
    return {
      hits: this.hits,
      misses: this.misses,
      size: this.cache.size,
      maxEntries: this.maxEntries,
      evictions: this.evictions,
      bytesUsed: this.bytesUsed,
      maxSizeBytes: this.maxSizeBytes,
    };
  }
}
