import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '@/config/env';
import { InfrastructureError, NotFoundError } from '@/errors';
import { StorageProvider } from './storage';

export class S3StorageProvider implements StorageProvider {
  private client: S3Client;
  private bucketName: string;

  constructor() {
    const region = env.server?.AWS_REGION || process.env.AWS_REGION || 'us-east-1';
    const accessKeyId = env.server?.AWS_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID || 'mock-key';
    const secretAccessKey = env.server?.AWS_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY || 'mock-secret';

    this.bucketName = env.server?.AWS_S3_BUCKET_NAME || process.env.AWS_S3_BUCKET_NAME || 'document-ai-bucket';

    this.client = new S3Client({
      region,
      credentials: {
        accessKeyId,
        secretAccessKey
      }
    });
  }

  public async upload(
    key: string,
    body: Buffer | Uint8Array,
    contentType = 'application/octet-stream'
  ): Promise<string> {
    try {
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: body as Buffer,
        ContentType: contentType
      });
      await this.client.send(command);
      return key;
    } catch (err) {
      throw new InfrastructureError('AWS S3 Upload', err instanceof Error ? err.message : String(err));
    }
  }

  public async download(key: string): Promise<Buffer> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key
      });
      const response = await this.client.send(command);
      if (!response.Body) {
        throw new NotFoundError(`S3 object "${key}"`);
      }

      const chunks: Uint8Array[] = [];
      for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
        chunks.push(chunk);
      }
      return Buffer.concat(chunks);
    } catch (err) {
      if (err instanceof NotFoundError) throw err;
      throw new InfrastructureError('AWS S3 Download', err instanceof Error ? err.message : String(err));
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

  public async delete(key: string): Promise<void> {
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: key
      });
      await this.client.send(command);
    } catch (err) {
      throw new InfrastructureError('AWS S3 Delete', err instanceof Error ? err.message : String(err));
    }
  }

  public async createUploadUrl(key: string, expiresInSeconds = 3600): Promise<string> {
    try {
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key
      });
      return await getSignedUrl(this.client, command, { expiresIn: expiresInSeconds });
    } catch (err) {
      throw new InfrastructureError('AWS S3 Presigned URL', err instanceof Error ? err.message : String(err));
    }
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
