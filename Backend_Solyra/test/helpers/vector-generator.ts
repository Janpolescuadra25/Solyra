import type { MemoryRecord, MemoryTier } from '@solyra/shared';

export interface GenerateVectorOptions {
  dimensions?: number;
  tier?: MemoryTier;
  tenantId?: string;
}

export function generateSyntheticMemoryRecord(
  index: number,
  options: GenerateVectorOptions = {},
): MemoryRecord {
  const dimensions = options.dimensions ?? 64;
  const tier: MemoryTier = options.tier ?? 'working';
  const tenantId = options.tenantId ?? 'tenant-bench-1';
  const key = `bench-vec-${index.toString().padStart(6, '0')}`;
  const embedding: number[] = new Array(dimensions);

  for (let d = 0; d < dimensions; d++) {
    embedding[d] = Number(Math.sin(index * 0.1 + d * 0.05).toFixed(8));
  }

  const now = new Date();

  return {
    id: key,
    tenantId,
    tier,
    key,
    content: `Synthetic memory record ${index} payload for scalability benchmarking. Content vector metadata item #${index}.`,
    embedding,
    salience: Number(((index % 100) / 100).toFixed(2)),
    metadata: {
      source: 'benchmark',
      batchIndex: index,
      tier,
      dimensionCount: dimensions,
      timestamp: now.toISOString(),
    },
    createdAt: now,
    updatedAt: now,
  };
}

export function generateSyntheticBatch(
  count: number,
  options: GenerateVectorOptions = {},
): MemoryRecord[] {
  const records = new Array<MemoryRecord>(count);
  for (let index = 0; index < count; index++) {
    records[index] = generateSyntheticMemoryRecord(index, options);
  }
  return records;
}
