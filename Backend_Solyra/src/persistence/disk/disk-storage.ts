import * as crypto from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { globalBus } from '../../neurobus/neurobus.js';

export interface DiskStorageOptions {
  baseDir?: string;
  maxFileSizeBytes?: number;
}

export interface DiskStorageEnvelope<T = unknown> {
  sha256: string;
  tenantId: string;
  tier: string;
  key: string;
  updatedAt: string;
  data: T;
}

export class DiskStorageEngine {
  readonly baseDir: string;
  readonly maxFileSizeBytes: number;
  private readonly safeIdentifierRegex = /^[a-zA-Z0-9_\-\.]+$/;

  constructor(options: DiskStorageOptions = {}) {
    this.baseDir = options.baseDir ?? process.env.SOLYRA_STORAGE_DIR ?? path.join(process.cwd(), '.solyra-storage');
    this.maxFileSizeBytes = options.maxFileSizeBytes && options.maxFileSizeBytes > 0
      ? options.maxFileSizeBytes
      : 10 * 1024 * 1024;
  }

  private validateIdentifier(name: string, value: string): void {
    if (typeof value !== 'string' || value.length === 0) {
      throw new Error(`INVALID_IDENTIFIER: invalid ${name}; must be a non-empty string`);
    }

    if (value.includes('..') || value.includes('/') || value.includes('\\') || value.includes('\0') || !this.safeIdentifierRegex.test(value)) {
      throw new Error(`INVALID_IDENTIFIER: invalid ${name}; contains illegal or path-traversal characters`);
    }
  }

  public getFilePath(tenantId: string, tier: string, key: string): string {
    this.validateIdentifier('tenantId', tenantId);
    this.validateIdentifier('tier', tier);
    this.validateIdentifier('key', key);
    return path.join(this.baseDir, tenantId, tier, `${key}.json`);
  }

  public async writeRecord<T = unknown>(tenantId: string, tier: string, key: string, data: T): Promise<{ bytesWritten: number; sha256: string }> {
    const targetPath = this.getFilePath(tenantId, tier, key);
    const targetDir = path.dirname(targetPath);
    const serializedData = JSON.stringify(data);

    if (serializedData === undefined) {
      throw new Error('INVALID_RECORD: payload must be JSON-serializable');
    }

    const sha256 = crypto.createHash('sha256').update(serializedData, 'utf8').digest('hex');
    const envelope: DiskStorageEnvelope<T> = {
      sha256,
      tenantId,
      tier,
      key,
      updatedAt: new Date().toISOString(),
      data,
    };

    const envelopeContent = JSON.stringify(envelope, null, 2);
    const byteLength = Buffer.byteLength(envelopeContent, 'utf8');

    if (byteLength > this.maxFileSizeBytes) {
      throw new Error(`PAYLOAD_TOO_LARGE: Record size ${byteLength} exceeds maximum allowed ${this.maxFileSizeBytes}`);
    }

    await fs.mkdir(targetDir, { recursive: true });
    const tempPath = `${targetPath}.${process.pid}.${Date.now()}.${crypto.randomBytes(4).toString('hex')}.tmp`;

    try {
      await fs.writeFile(tempPath, envelopeContent, 'utf8');
      await fs.rename(tempPath, targetPath);
    } catch (error) {
      await fs.unlink(tempPath).catch(() => undefined);
      throw error;
    }

    globalBus.emit('storage:disk_written', {
      tenantId,
      tier,
      key,
      bytesWritten: byteLength,
      sha256,
    });

    return { bytesWritten: byteLength, sha256 };
  }

  public async readRecord<T = unknown>(tenantId: string, tier: string, key: string): Promise<T | null> {
    const targetPath = this.getFilePath(tenantId, tier, key);

    try {
      const raw = await fs.readFile(targetPath, 'utf8');
      const envelope = JSON.parse(raw) as DiskStorageEnvelope<T>;

      if (!envelope || typeof envelope !== 'object' || !envelope.sha256 || envelope.data === undefined) {
        throw new Error(`CORRUPTED_RECORD: Invalid envelope format in ${targetPath}`);
      }

      const computedHash = crypto.createHash('sha256').update(JSON.stringify(envelope.data), 'utf8').digest('hex');
      if (computedHash !== envelope.sha256) {
        throw new Error(`INTEGRITY_CHECK_FAILED: SHA-256 mismatch for ${targetPath}. Expected ${envelope.sha256}, computed ${computedHash}`);
      }

      if (envelope.tenantId !== tenantId) {
        throw new Error(`TENANT_ISOLATION_VIOLATION: Record tenant ${envelope.tenantId} does not match requested tenant ${tenantId}`);
      }

      globalBus.emit('storage:disk_read', {
        tenantId,
        tier,
        key,
        sha256: envelope.sha256,
      });

      return envelope.data;
    } catch (error: unknown) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError && nodeError.code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  public async deleteRecord(tenantId: string, tier: string, key: string): Promise<boolean> {
    const targetPath = this.getFilePath(tenantId, tier, key);

    try {
      await fs.unlink(targetPath);
      globalBus.emit('storage:disk_deleted', { tenantId, tier, key });
      return true;
    } catch (error: unknown) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError && nodeError.code === 'ENOENT') {
        return false;
      }
      throw error;
    }
  }

  public async listKeys(tenantId: string, tier: string): Promise<string[]> {
    this.validateIdentifier('tenantId', tenantId);
    this.validateIdentifier('tier', tier);

    const targetDir = path.join(this.baseDir, tenantId, tier);

    try {
      const files = await fs.readdir(targetDir);
      return files.filter((file) => file.endsWith('.json')).map((file) => file.slice(0, -5));
    } catch (error: unknown) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError && nodeError.code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }
}
