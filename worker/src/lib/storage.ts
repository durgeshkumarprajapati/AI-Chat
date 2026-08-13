import fs from 'fs';
import path from 'path';
import {
  S3Client,
  GetObjectCommand,
  HeadObjectCommand
} from '@aws-sdk/client-s3';

export interface StorageProvider {
  download(key: string): Promise<Buffer>;
  exists(key: string): Promise<boolean>;
}

export class LocalStorageProvider implements StorageProvider {
  private baseDir: string;

  constructor(baseDir?: string) {
    this.baseDir = baseDir || path.resolve(process.cwd(), '../storage');
    if (!fs.existsSync(this.baseDir)) {
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

export class S3WorkerStorageProvider implements StorageProvider {
  private client: S3Client;
  private bucketName: string;

  constructor() {
    const region = process.env.AWS_REGION;
    const bucket = process.env.AWS_S3_BUCKET || process.env.AWS_S3_BUCKET_NAME;

    if (!region || !bucket) {
      throw new Error(
        'AWS S3 Worker Storage Provider requires valid AWS_REGION and AWS_S3_BUCKET (or AWS_S3_BUCKET_NAME) environment variables.'
      );
    }

    this.bucketName = bucket;

    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
    const sessionToken = process.env.AWS_SESSION_TOKEN;

    if (accessKeyId && secretAccessKey) {
      this.client = new S3Client({
        region,
        credentials: {
          accessKeyId,
          secretAccessKey,
          ...(sessionToken ? { sessionToken } : {})
        }
      });
    } else {
      this.client = new S3Client({ region });
    }
  }

  public async exists(key: string): Promise<boolean> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: key
      });
      await this.client.send(command);
      return true;
    } catch {
      return false;
    }
  }

  public async download(key: string): Promise<Buffer> {
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: key
    });
    const response = await this.client.send(command);
    if (!response.Body) {
      throw new Error(`S3 object "${key}" body empty`);
    }

    const chunks: Uint8Array[] = [];
    for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }
}

export function getWorkerStorageProvider(): StorageProvider {
  const providerType = process.env.AWS_STORAGE_PROVIDER || process.env.STORAGE_PROVIDER || 'local';
  if (providerType === 's3') {
    return new S3WorkerStorageProvider();
  }
  return new LocalStorageProvider();
}

export const workerStorage: StorageProvider = getWorkerStorageProvider();
