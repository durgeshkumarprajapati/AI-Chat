import { storage } from '@/lib/storage';

export class DocumentStorageService {
  public async upload(key: string, buffer: Buffer, contentType = 'application/pdf'): Promise<string> {
    return storage.upload(key, buffer, contentType);
  }

  public async fetch(key: string): Promise<Buffer> {
    return storage.download(key);
  }

  public async delete(key: string): Promise<void> {
    return storage.delete(key);
  }

  public async getDownloadUrl(key: string): Promise<string> {
    return storage.createUploadUrl(key, 3600);
  }
}

export const documentStorageService = new DocumentStorageService();
