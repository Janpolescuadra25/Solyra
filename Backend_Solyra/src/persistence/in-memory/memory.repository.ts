import type { IMemoryRepository, MemoryRecord, RepositoryResult } from '../postgres/repositories/memory.repository.js';

export class InMemoryMemoryRepository implements IMemoryRepository {
  private records = new Map<string, MemoryRecord>();

  private buildKey(tenantId: string, tier: MemoryRecord['tier'], key: string): string {
    return `${tenantId}:::${tier}:::${key}`;
  }

  async store(record: MemoryRecord): Promise<RepositoryResult<void>> {
    const indexKey = this.buildKey(record.tenantId, record.tier, record.key);
    this.records.set(indexKey, structuredClone(record));
    return { success: true };
  }

  async retrieve(tenantId: string, tier: MemoryRecord['tier'], key: string): Promise<RepositoryResult<MemoryRecord | null>> {
    const indexKey = this.buildKey(tenantId, tier, key);
    const record = this.records.get(indexKey);
    if (!record) {
      return { success: true, data: null };
    }
    return { success: true, data: structuredClone(record) };
  }

  async searchBySalience(tenantId: string, tier: MemoryRecord['tier'], minSalience: number): Promise<RepositoryResult<MemoryRecord[]>> {
    const results: MemoryRecord[] = [];
    for (const record of this.records.values()) {
      if (record.tenantId === tenantId && record.tier === tier && record.salience >= minSalience) {
        results.push(structuredClone(record));
      }
    }
    return { success: true, data: results.sort((a, b) => b.salience - a.salience) };
  }

  async searchBySemanticSimilarity(
    tenantId: string,
    queryEmbedding: number[],
    minSimilarity?: number,
    limit?: number,
  ): Promise<RepositoryResult<MemoryRecord[]>> {
    if (!queryEmbedding || !Array.isArray(queryEmbedding) || queryEmbedding.length === 0) {
      return {
        success: false,
        error: 'Query embedding must be a non-empty array of numbers',
        data: [],
      };
    }

    const finalLimit = limit ?? 10;
    void tenantId;
    void minSimilarity;
    void finalLimit;

    return {
      success: true,
      data: [],
    };
  }

  async delete(tenantId: string, tier: MemoryRecord['tier'], key: string): Promise<RepositoryResult<boolean>> {
    const indexKey = this.buildKey(tenantId, tier, key);
    return { success: true, data: this.records.delete(indexKey) };
  }
}
