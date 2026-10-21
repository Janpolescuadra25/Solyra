import type { MemoryRecord, MemoryTier, RepositoryResult } from '@solyra/shared';

import { globalBus } from '../../neurobus/neurobus.js';
import { DiskStorageEngine } from '../disk/disk-storage.js';
import type { IMemoryRepository } from '../postgres/repositories/memory.repository.js';
import { LRUCache } from './lru-cache.js';

export interface TieredMemoryRepositoryOptions {
  primaryRepository: IMemoryRepository;
  cache: LRUCache<string, MemoryRecord>;
  disk?: DiskStorageEngine;
}

export class TieredMemoryRepository implements IMemoryRepository {
  private readonly primaryRepository: IMemoryRepository;
  private readonly cache: LRUCache<string, MemoryRecord>;
  private readonly disk?: DiskStorageEngine;

  constructor(
    primaryRepositoryOrOptions: IMemoryRepository | TieredMemoryRepositoryOptions,
    cache?: LRUCache<string, MemoryRecord>,
    disk?: DiskStorageEngine,
  ) {
    if (primaryRepositoryOrOptions && typeof primaryRepositoryOrOptions === 'object' && 'primaryRepository' in primaryRepositoryOrOptions) {
      const options = primaryRepositoryOrOptions as TieredMemoryRepositoryOptions;
      this.primaryRepository = options.primaryRepository;
      this.cache = options.cache;
      this.disk = options.disk;
      return;
    }

    this.primaryRepository = primaryRepositoryOrOptions as IMemoryRepository;
    this.cache = cache ?? new LRUCache<string, MemoryRecord>({ maxEntries: 1000 });
    this.disk = disk;
  }

  private makeCacheKey(tenantId: string, tier: MemoryTier, key: string): string {
    return `${tenantId}:::${tier}:::${key}`;
  }

  public async store(record: MemoryRecord): Promise<RepositoryResult<void>> {
    const result = await this.primaryRepository.store(record);

    if (!result.success) {
      return result;
    }

    const cacheKey = this.makeCacheKey(record.tenantId, record.tier, record.key);
    this.cache.set(cacheKey, record);

    if (this.disk) {
      try {
        await this.disk.writeRecord(record.tenantId, record.tier, record.key, record);
      } catch (error) {
        globalBus.emit('storage:disk_write_failed', {
          tenantId: record.tenantId,
          tier: record.tier,
          key: record.key,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return { success: true, data: (result.data ?? record) as never };
  }

  public async retrieve(tenantId: string, tier: MemoryTier, key: string): Promise<RepositoryResult<MemoryRecord | null>> {
    const cacheKey = this.makeCacheKey(tenantId, tier, key);
    const cached = this.cache.get(cacheKey);

    if (cached) {
      if (cached.tenantId !== tenantId) {
        this.cache.delete(cacheKey);
      } else {
        return { success: true, data: cached };
      }
    }

    const primaryResult = await this.primaryRepository.retrieve(tenantId, tier, key);
    if (primaryResult.success && primaryResult.data) {
      this.cache.set(cacheKey, primaryResult.data);
      return { success: true, data: primaryResult.data };
    }

    if (this.disk) {
      try {
        const diskRecord = await this.disk.readRecord<MemoryRecord>(tenantId, tier, key);
        if (diskRecord && diskRecord.tenantId === tenantId) {
          this.cache.set(cacheKey, diskRecord);
          return { success: true, data: diskRecord };
        }
      } catch (error) {
        globalBus.emit('storage:disk_read_failed', {
          tenantId,
          tier,
          key,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return { success: true, data: null };
  }

  public async delete(tenantId: string, tier: MemoryTier, key: string): Promise<RepositoryResult<boolean>> {
    const cacheKey = this.makeCacheKey(tenantId, tier, key);
    this.cache.delete(cacheKey);

    if (this.disk) {
      try {
        await this.disk.deleteRecord(tenantId, tier, key);
      } catch (error) {
        globalBus.emit('storage:disk_delete_failed', {
          tenantId,
          tier,
          key,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return this.primaryRepository.delete(tenantId, tier, key);
  }

  public async searchBySalience(
    tenantId: string,
    tier: MemoryTier,
    minSalience: number,
    limit?: number,
  ): Promise<RepositoryResult<MemoryRecord[]>> {
    const result = await this.primaryRepository.searchBySalience(tenantId, tier, minSalience);

    if (result.success && Array.isArray(result.data)) {
      for (const record of result.data) {
        if (record.tenantId === tenantId) {
          this.cache.set(this.makeCacheKey(record.tenantId, record.tier, record.key), record);
        }
      }
    }

    return result;
  }

  public async searchBySemanticSimilarity(
    tenantId: string,
    queryEmbedding: number[],
    minSimilarity?: number,
    limit?: number,
  ): Promise<RepositoryResult<MemoryRecord[]>> {
    const result = await this.primaryRepository.searchBySemanticSimilarity(tenantId, queryEmbedding, minSimilarity, limit);

    if (result.success && Array.isArray(result.data)) {
      for (const record of result.data) {
        if (record.tenantId === tenantId) {
          this.cache.set(this.makeCacheKey(record.tenantId, record.tier, record.key), record);
        }
      }
    }

    return result;
  }

  public getCacheStats() {
    return this.cache.getStats();
  }
}
