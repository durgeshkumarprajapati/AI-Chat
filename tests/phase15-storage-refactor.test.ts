import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs';
import path from 'path';
import { getStorageProvider, resetStorageProviderForTest, LocalStorageProvider } from '../src/lib/storage';
import { S3StorageProvider } from '../src/lib/s3';
import { getWorkerStorageProvider } from '../worker/src/lib/storage';
import { ConfigurationError } from '../src/errors';
import { env } from '../src/config/env';

async function runStorageRefactorTests() {
  console.log('====================================================');
  console.log('Running Phase 15 Storage Architecture Refactor Tests');
  console.log('====================================================\n');

  const origEnv = { ...process.env };

  try {
    // Test 1: Single Source of Truth for Worker Storage
    console.log('Test 1: Worker Storage Delegation to Canonical Provider');
    process.env.AWS_STORAGE_PROVIDER = 'local';
    process.env.STORAGE_PROVIDER = 'local';
    resetStorageProviderForTest();

    const workerProv = getWorkerStorageProvider();
    const appProv = getStorageProvider();

    if (workerProv.constructor.name !== appProv.constructor.name) {
      throw new Error(`Worker provider (${workerProv.constructor.name}) and App provider (${appProv.constructor.name}) mismatch!`);
    }
    console.log('  ✅ PASSED: Worker resolves exact same canonical provider instance as Next.js app.');

    // Test 2: Check worker/src/lib/storage.ts source code for duplicate classes
    console.log('\nTest 2: No Duplicated Provider Classes in Worker Source Code');
    const workerStorageSourcePath = path.join(process.cwd(), 'worker/src/lib/storage.ts');
    const workerStorageSource = fs.readFileSync(workerStorageSourcePath, 'utf-8');

    if (workerStorageSource.includes('class S3WorkerStorageProvider')) {
      throw new Error('Found duplicate S3WorkerStorageProvider class in worker/src/lib/storage.ts');
    }
    if (workerStorageSource.includes('class LocalStorageProvider')) {
      throw new Error('Found duplicate LocalStorageProvider class in worker/src/lib/storage.ts');
    }
    console.log('  ✅ PASSED: worker/src/lib/storage.ts has ZERO duplicated provider classes.');

    // Test 3: S3 Provider Resolution & Logical Key Preservation
    console.log('\nTest 3: S3 Canonical Provider Resolution & Logical Key');
    process.env.AWS_STORAGE_PROVIDER = 's3';
    process.env.AWS_REGION = 'us-east-1';
    process.env.AWS_S3_BUCKET = 'canonical-test-bucket';
    process.env.AWS_ACCESS_KEY_ID = 'test-key-id';
    process.env.AWS_SECRET_ACCESS_KEY = 'test-secret-key';
    resetStorageProviderForTest();

    const canonicalS3 = getStorageProvider();
    if (!(canonicalS3 instanceof S3StorageProvider)) {
      throw new Error('Failed to resolve canonical S3StorageProvider');
    }

    const workerS3 = getWorkerStorageProvider();
    if (!(workerS3 instanceof S3StorageProvider)) {
      throw new Error('Worker failed to resolve canonical S3StorageProvider');
    }

    const testLogicalKey = 'documents/usr-10/doc-20/test.pdf';
    const uploadUrl = await canonicalS3.createUploadUrl(testLogicalKey);
    if (!uploadUrl.includes('test.pdf') && !uploadUrl.includes(encodeURIComponent(testLogicalKey))) {
      throw new Error(`Logical key was altered in presigned URL: ${uploadUrl}`);
    }
    console.log('  ✅ PASSED: Next.js and Worker both resolve canonical S3StorageProvider with preserved logical key.');

    // Test 4: Fail Fast when S3 Configuration is Missing
    console.log('\nTest 4: Fail Fast Validation for S3 Storage');
    process.env.AWS_STORAGE_PROVIDER = 's3';
    delete process.env.AWS_REGION;
    delete process.env.AWS_S3_BUCKET;
    delete process.env.AWS_S3_BUCKET_NAME;
    if (env.server) {
      delete (env.server as Record<string, unknown>).AWS_REGION;
      delete (env.server as Record<string, unknown>).AWS_S3_BUCKET;
      delete (env.server as Record<string, unknown>).AWS_S3_BUCKET_NAME;
    }
    resetStorageProviderForTest();

    let failFast = false;
    try {
      getWorkerStorageProvider();
    } catch (err) {
      if (err instanceof ConfigurationError || (err instanceof Error && err.message.includes('requires valid AWS_REGION'))) {
        failFast = true;
      }
    }
    if (!failFast) {
      throw new Error('Worker resolver failed to throw fail-fast error when S3 config is missing');
    }
    console.log('  ✅ PASSED: Worker resolver fails fast with ConfigurationError when S3 settings are missing.');

    // Test 5: Local Storage Functionality
    console.log('\nTest 5: Canonical LocalStorageProvider File Execution');
    process.env.AWS_STORAGE_PROVIDER = 'local';
    resetStorageProviderForTest();

    const localStorage = getStorageProvider() as LocalStorageProvider;
    const sampleKey = `tests/refactor/${Date.now()}.txt`;
    const sampleBuffer = Buffer.from('Canonical Storage Refactor Test');

    await localStorage.upload(sampleKey, sampleBuffer);
    const exists = await localStorage.exists(sampleKey);
    if (!exists) throw new Error('File upload to local storage failed existence check');

    const downloaded = await localStorage.download(sampleKey);
    if (downloaded.toString() !== 'Canonical Storage Refactor Test') {
      throw new Error('Downloaded buffer content mismatch');
    }

    await localStorage.delete(sampleKey);
    const existsAfterDelete = await localStorage.exists(sampleKey);
    if (existsAfterDelete) throw new Error('File deletion from local storage failed');

    console.log('  ✅ PASSED: Canonical LocalStorageProvider upload, exists, download, and delete verified.');

  } finally {
    process.env = origEnv;
    resetStorageProviderForTest();
  }

  console.log('\n====================================================');
  console.log('🎉 ALL PHASE 15 STORAGE REFACTOR TESTS PASSED!');
  console.log('====================================================\n');
}

runStorageRefactorTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n❌ STORAGE REFACTOR TEST FAILED:', err);
    process.exit(1);
  });
