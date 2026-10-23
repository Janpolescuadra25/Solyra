import { DiskStorageEngine } from '../persistence/disk/disk-storage.js';
import type { IMemoryRepository } from '../persistence/postgres/repositories/memory.repository.js';
import { BrainPackageLoader } from './loader.js';

export { BrainPackageLoader };
export const globalBrainLoader = new BrainPackageLoader(undefined, new DiskStorageEngine());

export function createBrainPackageLoader(
  options?: { maxHistoryLength?: number },
  diskStorage?: DiskStorageEngine,
  persistence?: IMemoryRepository,
): BrainPackageLoader {
  return new BrainPackageLoader(options, diskStorage ?? new DiskStorageEngine(), persistence);
}

export * from './loader.js';
