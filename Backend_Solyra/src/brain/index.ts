import { DiskStorageEngine } from '../persistence/disk/disk-storage.js';
import { BrainPackageLoader } from './loader.js';

export { BrainPackageLoader };
export const globalBrainLoader = new BrainPackageLoader(undefined, new DiskStorageEngine());
