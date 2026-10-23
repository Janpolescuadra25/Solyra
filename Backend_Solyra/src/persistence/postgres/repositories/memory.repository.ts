import { Pool } from 'pg';
import type { MemoryRecord, MemoryTier, RepositoryResult } from '@solyra/shared';

export type { MemoryRecord, MemoryTier, RepositoryResult } from '@solyra/shared';

export interface IMemoryRepository {
  store(record: MemoryRecord): Promise<RepositoryResult<void>>;
  retrieve(tenantId: string, tier: MemoryTier, key: string): Promise<RepositoryResult<MemoryRecord | null>>;
  searchBySalience(tenantId: string, tier: MemoryTier, minSalience: number): Promise<RepositoryResult<MemoryRecord[]>>;
  searchBySemanticSimilarity(
    tenantId: string,
    queryEmbedding: number[],
    minSimilarity?: number,
    limit?: number,
  ): Promise<RepositoryResult<MemoryRecord[]>>;
  delete(tenantId: string, tier: MemoryTier, key: string): Promise<RepositoryResult<boolean>>;
}

export class PostgresMemoryRepository implements IMemoryRepository {
  constructor(private readonly pool: Pool) {}

  private mapRow(row: any): MemoryRecord {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      tier: row.tier,
      key: row.key,
      content: row.content,
      embedding: Array.isArray(row.embedding) ? row.embedding.map((value: unknown) => Number(value)) : undefined,
      salience: Number(row.salience ?? 0),
      metadata: this.parseMetadata(row.metadata),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  private parseMetadata(value: unknown): Record<string, unknown> | undefined {
    if (value == null) {
      return undefined;
    }

    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : undefined;
      } catch {
        return undefined;
      }
    }

    return typeof value === 'object' ? (value as Record<string, unknown>) : undefined;
  }

  async store(record: MemoryRecord): Promise<RepositoryResult<void>> {
    const now = new Date();
    const createdAt = record.createdAt ?? now;
    const updatedAt = record.updatedAt ?? now;

    try {
      await this.pool.query(
        `
          INSERT INTO memory_records (id, tenant_id, tier, key, content, embedding, salience, metadata, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          ON CONFLICT (tenant_id, tier, key)
          DO UPDATE SET
            content = EXCLUDED.content,
            embedding = EXCLUDED.embedding,
            salience = EXCLUDED.salience,
            metadata = EXCLUDED.metadata,
            updated_at = EXCLUDED.updated_at
        `,
        [
          record.id,
          record.tenantId,
          record.tier,
          record.key,
          record.content,
          record.embedding ? JSON.stringify(record.embedding) : null,
          Number(record.salience ?? 0),
          JSON.stringify(record.metadata ?? {}),
          createdAt,
          updatedAt,
        ],
      );

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown memory storage failure',
        code: 'MEMORY_STORE_FAILED',
      };
    }
  }

  async retrieve(tenantId: string, tier: MemoryTier, key: string): Promise<RepositoryResult<MemoryRecord | null>> {
    try {
      const res = await this.pool.query(
        'SELECT * FROM memory_records WHERE tenant_id = $1 AND tier = $2 AND key = $3',
        [tenantId, tier, key],
      );

      if (res.rows.length === 0) {
        return { success: true, data: null };
      }

      return { success: true, data: this.mapRow(res.rows[0]) };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown memory retrieval failure',
        code: 'MEMORY_RETRIEVE_FAILED',
        data: null,
      };
    }
  }

  async searchBySalience(tenantId: string, tier: MemoryTier, minSalience: number): Promise<RepositoryResult<MemoryRecord[]>> {
    try {
      const res = await this.pool.query(
        `
          SELECT *
          FROM memory_records
          WHERE tenant_id = $1 AND tier = $2 AND salience >= $3
          ORDER BY salience DESC, updated_at DESC
        `,
        [tenantId, tier, Number(minSalience ?? 0)],
      );

      return { success: true, data: res.rows.map((row) => this.mapRow(row)) };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown salience search failure',
        code: 'MEMORY_SEARCH_FAILED',
        data: [],
      };
    }
  }

  async searchBySemanticSimilarity(
    tenantId: string,
    queryEmbedding: number[],
    minSimilarity: number = 0.7,
    limit: number = 10,
  ): Promise<RepositoryResult<MemoryRecord[]>> {
    try {
      if (!Array.isArray(queryEmbedding) || queryEmbedding.length === 0 || queryEmbedding.some((entry) => typeof entry !== 'number' || Number.isNaN(entry))) {
        throw new Error('queryEmbedding must be a non-empty array of numbers');
      }

      if (typeof minSimilarity !== 'number' || Number.isNaN(minSimilarity) || minSimilarity < 0 || minSimilarity > 1) {
        throw new Error('minSimilarity must be a number between 0.0 and 1.0');
      }

      if (!Number.isInteger(limit) || limit <= 0 || limit > 100) {
        throw new Error('limit must be a positive integer between 1 and 100');
      }

      const res = await this.pool.query(
        `
          SELECT *, cosine_similarity(embedding, $2::jsonb) AS similarity
          FROM memory_records
          WHERE tenant_id = $1
            AND embedding IS NOT NULL
            AND cosine_similarity(embedding, $2::jsonb) >= $3
          ORDER BY similarity DESC
          LIMIT $4
        `,
        [tenantId, JSON.stringify(queryEmbedding), Number(minSimilarity), Number(limit)],
      );

      return { success: true, data: res.rows.map((row) => this.mapRow(row)) };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown semantic similarity search failure',
        code: 'MEMORY_SEARCH_FAILED',
        data: [],
      };
    }
  }

  async delete(tenantId: string, tier: MemoryTier, key: string): Promise<RepositoryResult<boolean>> {
    try {
      const res = await this.pool.query(
        'DELETE FROM memory_records WHERE tenant_id = $1 AND tier = $2 AND key = $3',
        [tenantId, tier, key],
      );

      return { success: true, data: (res.rowCount ?? 0) > 0 };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown memory delete failure',
        code: 'MEMORY_DELETE_FAILED',
        data: false,
      };
    }
  }
}
