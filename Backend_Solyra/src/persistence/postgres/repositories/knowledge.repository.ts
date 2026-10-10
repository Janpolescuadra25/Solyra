import { Pool } from 'pg';

export interface KnowledgeNode {
  id: string;
  workspaceId: string;
  title: string;
  content: string;
  embedding?: number[];
  tags?: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface IKnowledgeRepository {
  findById(id: string, workspaceId: string): Promise<KnowledgeNode | null>;
  create(node: KnowledgeNode): Promise<KnowledgeNode>;
  update(id: string, workspaceId: string, updates: Partial<KnowledgeNode>): Promise<KnowledgeNode | null>;
  delete(id: string, workspaceId: string): Promise<boolean>;
  listByWorkspace(workspaceId: string): Promise<KnowledgeNode[]>;
}

export class PostgresKnowledgeRepository implements IKnowledgeRepository {
  constructor(private readonly pool: Pool) {}

  private mapRow(row: any): KnowledgeNode {
    return {
      id: row.id,
      workspaceId: row.workspace_id,
      title: row.title,
      content: row.content,
      embedding: row.embedding ? (Array.isArray(row.embedding) ? row.embedding : row.embedding) : undefined,
      tags: Array.isArray(row.tags) ? row.tags : JSON.parse(typeof row.tags === 'string' ? row.tags : '[]'),
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
}
