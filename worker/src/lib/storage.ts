import fs from 'fs';
import path from 'path';

export interface StorageProvider {
  download(key: string): Promise<Buffer>;
  exists(key: string): Promise<boolean>;
}

export class LocalStorageProvider implements StorageProvider {
  private baseDir: string;

  constructor(baseDir?: string) {
    // Points to root storage directory
    this.baseDir = baseDir || path.resolve(process.cwd(), '../storage');
    if (!fs.existsSync(this.baseDir)) {
      // Fallback if worker is executed from root directory directly
      this.baseDir = path.resolve(process.cwd(), 'storage');
    }
  }

  private getAbsolutePath(key: string): string {
    const normalized = path.normalize(key).replace(/^(\.\.(\/|\\))+/, '');
    return path.join(this.baseDir, normalized);
  }

  public async exists(key: string): Promise<boolean> {
    try {
      const filePath = this.getAbsolutePath(key);
      await fs.promises.access(filePath, fs.constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  public async download(key: string): Promise<Buffer> {
    const filePath = this.getAbsolutePath(key);
    if (!(await this.exists(key))) {
      throw new Error(`Storage object "${key}" does not exist at ${filePath}`);
    }
    return await fs.promises.readFile(filePath);
  }
}

export const workerStorage: StorageProvider = new LocalStorageProvider();
