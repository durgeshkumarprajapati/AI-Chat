import { getStorageProvider, StorageProvider } from '../../../src/lib/storage.js';

export type { StorageProvider };

export function getWorkerStorageProvider(): StorageProvider {
  return getStorageProvider();
}

export const workerStorage: StorageProvider = getStorageProvider();
