import type { MemoryRecord, MemoryTier, RepositoryResult } from '@solyra/shared';

export class InMemoryMemoryRepository {
  private records = new Map<string, MemoryRecord>();

  private buildKey(tenantId: string, tier: MemoryTier, key: string): string {
    return `${tenantId}:::${tier}:::${key}`;
  }

  async store(record: MemoryRecord): Promise<RepositoryResult<void>> {
    const indexKey = this.buildKey(record.tenantId, record.tier, record.key);
    this.records.set(indexKey, structuredClone(record));
    return { success: true };
  }

  async retrieve(tenantId: string, tier: MemoryTier, key: string): Promise<RepositoryResult<MemoryRecord | null>> {
    const indexKey = this.buildKey(tenantId, tier, key);
    const record = this.records.get(indexKey);
    if (!record) {
      return { success: true, data: null };
    }
    return { success: true, data: structuredClone(record) };
  }

  async searchBySalience(tenantId: string, tier: MemoryTier, minSalience: number): Promise<RepositoryResult<MemoryRecord[]>> {
    const results: MemoryRecord[] = [];
    for (const record of this.records.values()) {
      if (record.tenantId === tenantId && record.tier === tier && record.salience >= minSalience) {
        results.push(structuredClone(record));
      }
    }
    return { success: true, data: results.sort((a, b) => b.salience - a.salience) };
  }

  async delete(tenantId: string, tier: MemoryTier, key: string): Promise<RepositoryResult<boolean>> {
    const indexKey = this.buildKey(tenantId, tier, key);
    return { success: true, data: this.records.delete(indexKey) };
  }
}
