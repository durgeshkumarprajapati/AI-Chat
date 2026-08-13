"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.S3StorageProvider = void 0;
const client_s3_1 = require("@aws-sdk/client-s3");
const s3_request_presigner_1 = require("@aws-sdk/s3-request-presigner");
const env_1 = require("@/config/env");
const errors_1 = require("@/errors");
class S3StorageProvider {
    client;
    bucketName;
    constructor() {
        const region = process.env.AWS_REGION || env_1.env.server?.AWS_REGION;
        const bucket = process.env.AWS_S3_BUCKET ||
            env_1.env.server?.AWS_S3_BUCKET ||
            process.env.AWS_S3_BUCKET_NAME ||
            env_1.env.server?.AWS_S3_BUCKET_NAME;
        if (!region || !bucket) {
            throw new errors_1.ConfigurationError('AWS S3 Storage Provider requires valid AWS_REGION and AWS_S3_BUCKET (or AWS_S3_BUCKET_NAME) environment variables.');
        }
        this.bucketName = bucket;
        const accessKeyId = process.env.AWS_ACCESS_KEY_ID || env_1.env.server?.AWS_ACCESS_KEY_ID;
        const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY || env_1.env.server?.AWS_SECRET_ACCESS_KEY;
        const sessionToken = process.env.AWS_SESSION_TOKEN || env_1.env.server?.AWS_SESSION_TOKEN;
        if (accessKeyId && secretAccessKey) {
            this.client = new client_s3_1.S3Client({
                region,
                credentials: {
                    accessKeyId,
                    secretAccessKey,
                    ...(sessionToken ? { sessionToken } : {})
                }
            });
        }
        else {
            // Use default SDK credential provider chain (IAM role, environment, metadata service)
            this.client = new client_s3_1.S3Client({ region });
        }
    }
    getBucketName() {
        return this.bucketName;
    }
    getS3Client() {
        return this.client;
    }
    async upload(key, body, contentType = 'application/octet-stream') {
        try {
            const command = new client_s3_1.PutObjectCommand({
                Bucket: this.bucketName,
                Key: key,
                Body: body,
                ContentType: contentType
            });
            await this.client.send(command);
            return key;
        }
        catch (err) {
            throw new errors_1.InfrastructureError('AWS S3 Upload', err instanceof Error ? err.message : String(err));
        }
    }
    async download(key) {
        try {
            const command = new client_s3_1.GetObjectCommand({
                Bucket: this.bucketName,
                Key: key
            });
            const response = await this.client.send(command);
            if (!response.Body) {
                throw new errors_1.NotFoundError(`S3 object "${key}"`);
            }
            const chunks = [];
            for await (const chunk of response.Body) {
                chunks.push(chunk);
            }
            return Buffer.concat(chunks);
        }
        catch (err) {
            if (err instanceof errors_1.NotFoundError)
                throw err;
            throw new errors_1.InfrastructureError('AWS S3 Download', err instanceof Error ? err.message : String(err));
        }
    }
    async exists(key) {
        try {
            const command = new client_s3_1.HeadObjectCommand({
                Bucket: this.bucketName,
                Key: key
            });
            await this.client.send(command);
            return true;
        }
        catch {
            return false;
        }
    }
    async delete(key) {
        try {
            const command = new client_s3_1.DeleteObjectCommand({
                Bucket: this.bucketName,
                Key: key
            });
            await this.client.send(command);
        }
        catch (err) {
            throw new errors_1.InfrastructureError('AWS S3 Delete', err instanceof Error ? err.message : String(err));
        }
    }
    async createUploadUrl(key, expiresInSeconds = 3600) {
        try {
            const command = new client_s3_1.PutObjectCommand({
                Bucket: this.bucketName,
                Key: key
            });
            return await (0, s3_request_presigner_1.getSignedUrl)(this.client, command, { expiresIn: expiresInSeconds });
        }
        catch (err) {
            throw new errors_1.InfrastructureError('AWS S3 Presigned URL', err instanceof Error ? err.message : String(err));
        }
    }
    // Alias methods for backward compatibility
    async uploadObject(key, body, contentType) {
        return this.upload(key, body, contentType);
    }
    async downloadObject(key) {
        return this.download(key);
    }
    async deleteObject(key) {
        return this.delete(key);
    }
    async generatePresignedUrl(key, expiresInSeconds) {
        return this.createUploadUrl(key, expiresInSeconds);
    }
}
exports.S3StorageProvider = S3StorageProvider;
