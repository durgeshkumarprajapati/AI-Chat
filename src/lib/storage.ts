import fs from 'fs';
import path from 'path';
import { env } from '@/config/env';
import { InfrastructureError, NotFoundError } from '@/errors';
import { S3StorageProvider } from './s3';

export interface StorageProvider {
  upload(_key: string, _body: Buffer | Uint8Array, _contentType?: string): Promise<string>;
  download(_key: string): Promise<Buffer>;
  exists(_key: string): Promise<boolean>;
  delete(_key: string): Promise<void>;
  createUploadUrl(_key: string, _expiresInSeconds?: number): Promise<string>;

  // Backward compatibility alias methods
  uploadObject(_key: string, _body: Buffer | Uint8Array, _contentType?: string): Promise<string>;
  downloadObject(_key: string): Promise<Buffer>;
  deleteObject(_key: string): Promise<void>;
  generatePresignedUrl(_key: string, _expiresInSeconds?: number): Promise<string>;
}

export class LocalStorageProvider implements StorageProvider {
  private baseDir: string;

  constructor(baseDir?: string) {
    if (baseDir) {
      this.baseDir = baseDir;
    } else if (process.env.STORAGE_BASE_DIR) {
      this.baseDir = process.env.STORAGE_BASE_DIR;
    } else {
      const cwd = process.cwd();
      const projectRoot = path.basename(cwd) === 'worker' ? path.resolve(cwd, '..') : cwd;
      this.baseDir = path.join(projectRoot, 'storage');
    }
  }

  private getAbsolutePath(key: string): string {
    const normalized = path.normalize(key).replace(/^(\.\.(\/|\\))+/, '');
    return path.join(this.baseDir, normalized);
  }

  public async upload(key: string, body: Buffer | Uint8Array, _contentType?: string): Promise<string> {
    try {
      const filePath = this.getAbsolutePath(key);
      await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
      await fs.promises.writeFile(filePath, body);
      return key;
    } catch (err) {
      throw new InfrastructureError('Local Storage Upload', err instanceof Error ? err.message : String(err));
    }
  }

  public async download(key: string): Promise<Buffer> {
    try {
      const filePath = this.getAbsolutePath(key);
      if (!(await this.exists(key))) {
        throw new NotFoundError(`Storage object "${key}"`);
      }
      return await fs.promises.readFile(filePath);
    } catch (err) {
      if (err instanceof NotFoundError) throw err;
      throw new InfrastructureError('Local Storage Download', err instanceof Error ? err.message : String(err));
    }
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

  public async delete(key: string): Promise<void> {
    try {
      const filePath = this.getAbsolutePath(key);
      if (await this.exists(key)) {
        await fs.promises.unlink(filePath);
      }
    } catch (err) {
      throw new InfrastructureError('Local Storage Delete', err instanceof Error ? err.message : String(err));
    }
  }

  public async createUploadUrl(key: string, _expiresInSeconds = 3600): Promise<string> {
    return `/api/documents/upload?storageKey=${encodeURIComponent(key)}`;
  }

  // Alias methods for backward compatibility
  public async uploadObject(key: string, body: Buffer | Uint8Array, contentType?: string): Promise<string> {
    return this.upload(key, body, contentType);
  }

  public async downloadObject(key: string): Promise<Buffer> {
    return this.download(key);
  }

  public async deleteObject(key: string): Promise<void> {
    return this.delete(key);
  }

  public async generatePresignedUrl(key: string, expiresInSeconds?: number): Promise<string> {
    return this.createUploadUrl(key, expiresInSeconds);
  }
}

let storageInstance: StorageProvider | null = null;

export function resetStorageProviderForTest(): void {
  storageInstance = null;
}

export function getStorageProvider(): StorageProvider {
  if (storageInstance) return storageInstance;

  const providerType =
    process.env.STORAGE_PROVIDER ||
    env.server?.STORAGE_PROVIDER ||
    process.env.AWS_STORAGE_PROVIDER ||
    env.server?.AWS_STORAGE_PROVIDER ||
    'local';

  if (providerType === 's3') {
    try {
      storageInstance = new S3StorageProvider();
    } catch (err) {
      console.warn('[StorageProvider] S3 configuration invalid or incomplete, falling back to LocalStorageProvider:', err);
      storageInstance = new LocalStorageProvider();
    }
  } else {
    storageInstance = new LocalStorageProvider();
  }

  return storageInstance!;
}

export const storage: StorageProvider = new Proxy({} as StorageProvider, {
  get(_target, prop, receiver) {
    const instance = getStorageProvider();
    const value = Reflect.get(instance, prop, receiver);
    return typeof value === 'function' ? value.bind(instance) : value;
  },
});
