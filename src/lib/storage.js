"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.storage = exports.LocalStorageProvider = void 0;
exports.resetStorageProviderForTest = resetStorageProviderForTest;
exports.getStorageProvider = getStorageProvider;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const env_1 = require("@/config/env");
const errors_1 = require("@/errors");
const s3_1 = require("./s3");
class LocalStorageProvider {
    baseDir;
    constructor(baseDir) {
        this.baseDir = baseDir || path_1.default.join(process.cwd(), 'storage');
    }
    getAbsolutePath(key) {
        const normalized = path_1.default.normalize(key).replace(/^(\.\.(\/|\\))+/, '');
        return path_1.default.join(this.baseDir, normalized);
    }
    async upload(key, body, _contentType) {
        try {
            const filePath = this.getAbsolutePath(key);
            await fs_1.default.promises.mkdir(path_1.default.dirname(filePath), { recursive: true });
            await fs_1.default.promises.writeFile(filePath, body);
            return key;
        }
        catch (err) {
            throw new errors_1.InfrastructureError('Local Storage Upload', err instanceof Error ? err.message : String(err));
        }
    }
    async download(key) {
        try {
            const filePath = this.getAbsolutePath(key);
            if (!(await this.exists(key))) {
                throw new errors_1.NotFoundError(`Storage object "${key}"`);
            }
            return await fs_1.default.promises.readFile(filePath);
        }
        catch (err) {
            if (err instanceof errors_1.NotFoundError)
                throw err;
            throw new errors_1.InfrastructureError('Local Storage Download', err instanceof Error ? err.message : String(err));
        }
    }
    async exists(key) {
        try {
            const filePath = this.getAbsolutePath(key);
            await fs_1.default.promises.access(filePath, fs_1.default.constants.F_OK);
            return true;
        }
        catch {
            return false;
        }
    }
    async delete(key) {
        try {
            const filePath = this.getAbsolutePath(key);
            if (await this.exists(key)) {
                await fs_1.default.promises.unlink(filePath);
            }
        }
        catch (err) {
            throw new errors_1.InfrastructureError('Local Storage Delete', err instanceof Error ? err.message : String(err));
        }
    }
    async createUploadUrl(key, _expiresInSeconds = 3600) {
        return `/api/documents/upload?storageKey=${encodeURIComponent(key)}`;
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
exports.LocalStorageProvider = LocalStorageProvider;
let storageInstance = null;
function resetStorageProviderForTest() {
    storageInstance = null;
}
function getStorageProvider() {
    if (storageInstance)
        return storageInstance;
    const providerType = process.env.AWS_STORAGE_PROVIDER ||
        process.env.STORAGE_PROVIDER ||
        env_1.env.server?.AWS_STORAGE_PROVIDER ||
        env_1.env.server?.STORAGE_PROVIDER ||
        'local';
    if (providerType === 's3') {
        // Fail fast if S3 configuration is invalid or missing
        storageInstance = new s3_1.S3StorageProvider();
    }
    else {
        storageInstance = new LocalStorageProvider();
    }
    return storageInstance;
}
exports.storage = getStorageProvider();
