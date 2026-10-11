import { Pool } from 'pg';
import type { KnowledgeNode, IKnowledgeRepository, SemanticSearchResult } from '@solyra/shared';

export class PostgresKnowledgeRepository implements IKnowledgeRepository {
  constructor(private readonly pool: Pool) {}

  private parseTags(value: unknown): string[] {
    if (Array.isArray(value)) {
      return value.map((entry) => String(entry));
    }

    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed.map((entry) => String(entry)) : [];
      } catch {
        return [];
      }
    }

    return [];
  }

  private parseEmbedding(value: unknown): number[] | undefined {
    if (value == null) {
      return undefined;
    }

    if (Array.isArray(value)) {
      return value.map((entry) => Number(entry));
    }

    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) {
          return parsed.map((entry) => Number(entry));
        }
      } catch {
        return undefined;
      }
    }

    return undefined;
  }

  private mapRow(row: any): KnowledgeNode {
    return {
      id: row.id,
      workspaceId: row.workspace_id,
      title: row.title,
      content: row.content,
      embedding: this.parseEmbedding(row.embedding),
      tags: this.parseTags(row.tags),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  async findById(id: string, workspaceId: string): Promise<KnowledgeNode | null> {
    const res = await this.pool.query('SELECT * FROM knowledge_nodes WHERE id = $1 AND workspace_id = $2', [id, workspaceId]);
    return res.rows.length > 0 ? this.mapRow(res.rows[0]) : null;
  }

  async create(node: KnowledgeNode): Promise<KnowledgeNode> {
    const now = new Date();
    const query = `
      INSERT INTO knowledge_nodes (id, workspace_id, title, content, embedding, tags, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *;
    `;

    const res = await this.pool.query(query, [
      node.id,
      node.workspaceId,
      node.title,
      node.content,
      node.embedding ? JSON.stringify(node.embedding) : null,
      JSON.stringify(node.tags ?? []),
      node.createdAt ?? now,
      node.updatedAt ?? now,
    ]);

    return this.mapRow(res.rows[0]);
  }

  async update(id: string, workspaceId: string, updates: Partial<KnowledgeNode>): Promise<KnowledgeNode | null> {
    const existing = await this.findById(id, workspaceId);
    if (!existing) {
      return null;
    }

    const merged: KnowledgeNode = {
      ...existing,
      ...updates,
      updatedAt: new Date(),
    };

    const query = `
      UPDATE knowledge_nodes
      SET title = $1,
          content = $2,
          embedding = $3,
          tags = $4,
          updated_at = $5
      WHERE id = $6 AND workspace_id = $7
      RETURNING *;
    `;

    const res = await this.pool.query(query, [
      merged.title,
      merged.content,
      merged.embedding ? JSON.stringify(merged.embedding) : null,
      JSON.stringify(merged.tags ?? []),
      merged.updatedAt,
      id,
      workspaceId,
    ]);

    return res.rows.length > 0 ? this.mapRow(res.rows[0]) : null;
  }

  async delete(id: string, workspaceId: string): Promise<boolean> {
    const res = await this.pool.query('DELETE FROM knowledge_nodes WHERE id = $1 AND workspace_id = $2', [id, workspaceId]);
    return (res.rowCount ?? 0) > 0;
  }

  async listByWorkspace(workspaceId: string): Promise<KnowledgeNode[]> {
    const res = await this.pool.query('SELECT * FROM knowledge_nodes WHERE workspace_id = $1 ORDER BY created_at DESC', [workspaceId]);
    return res.rows.map((row) => this.mapRow(row));
  }

  async searchBySemanticSimilarity(
    workspaceId: string,
    queryEmbedding: number[],
    minSimilarity: number = 0.7,
    limit: number = 10,
  ): Promise<SemanticSearchResult[]> {
    if (typeof workspaceId !== 'string' || workspaceId.trim().length === 0) {
      throw new Error('workspaceId must be a non-empty string');
    }

    if (!Array.isArray(queryEmbedding) || queryEmbedding.length === 0 || queryEmbedding.some((entry) => typeof entry !== 'number' || Number.isNaN(entry))) {
      throw new Error('queryEmbedding must be a non-empty array of numbers');
    }

    if (typeof minSimilarity !== 'number' || Number.isNaN(minSimilarity) || minSimilarity < -1 || minSimilarity > 1) {
      throw new Error('minSimilarity must be a number between -1.0 and 1.0');
    }

    if (!Number.isInteger(limit) || limit <= 0) {
      throw new Error('limit must be a positive integer');
    }

    const query = `
      SELECT id, workspace_id, title, content, embedding, tags, created_at, updated_at,
             cosine_similarity(embedding, $2::jsonb) AS similarity
      FROM knowledge_nodes
      WHERE workspace_id = $1
        AND embedding IS NOT NULL
        AND cosine_similarity(embedding, $2::jsonb) >= $3
      ORDER BY similarity DESC
      LIMIT $4;
    `;

    const res = await this.pool.query(query, [workspaceId, JSON.stringify(queryEmbedding), minSimilarity, limit]);

    return res.rows.map((row: any) => ({
      node: this.mapRow(row),
      similarity: Number(row.similarity),
    }));
  }
}
