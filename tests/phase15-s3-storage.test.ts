import dotenv from 'dotenv';
dotenv.config();

import { getStorageProvider, resetStorageProviderForTest } from '../src/lib/storage';
import { S3StorageProvider } from '../src/lib/s3';
import { getWorkerStorageProvider } from '../worker/src/lib/storage';
import { ConfigurationError } from '../src/errors';
import { env } from '../src/config/env';

async function runPhase15Tests() {
  console.log('====================================================');
  console.log('Running Phase 15 Pluggable Document Storage Tests');
  console.log('====================================================\n');

  const origEnv = { ...process.env };

  try {
    // Test 1 & 2: Local Provider Resolution
    console.log('Test 1 & 2: Local Provider Resolution');
    process.env.AWS_STORAGE_PROVIDER = 'local';
    process.env.STORAGE_PROVIDER = 'local';
    resetStorageProviderForTest();

    const localProvider = getStorageProvider();
    if (localProvider.constructor.name !== 'LocalStorageProvider') {
      throw new Error(`Expected AWS_STORAGE_PROVIDER=local to resolve LocalStorageProvider, got ${localProvider.constructor.name}`);
    }
    console.log('  ✅ PASSED: Local configuration resolved LocalStorageProvider correctly.');

    // Test 3 & 4: Fail Fast when S3 Configuration is Missing
    console.log('\nTest 3 & 4: S3 Fail-Fast Configuration Validation');
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

    let failFastThrown = false;
    try {
      getStorageProvider();
    } catch (err) {
      if (err instanceof ConfigurationError || (err instanceof Error && err.message.includes('requires valid AWS_REGION'))) {
        failFastThrown = true;
      }
    }
    if (!failFastThrown) {
      throw new Error('Expected getStorageProvider() to fail fast when S3 region/bucket are missing');
    }
    console.log('  ✅ PASSED: Invalid S3 configuration failed fast with ConfigurationError and did NOT fall back silently to local.');

    // Test 5 & 6: Explicit S3 Provider Resolution & Bucket/Key Preservation
    console.log('\nTest 5 & 6: S3 Provider Resolution & Key Preservation');
    process.env.AWS_STORAGE_PROVIDER = 's3';
    process.env.AWS_REGION = 'us-west-2';
    process.env.AWS_S3_BUCKET = 'my-production-rag-bucket';
    process.env.AWS_ACCESS_KEY_ID = 'test-access-key';
    process.env.AWS_SECRET_ACCESS_KEY = 'test-secret-key';
    resetStorageProviderForTest();

    const s3Provider = getStorageProvider();
    if (s3Provider.constructor.name !== 'S3StorageProvider') {
      throw new Error(`Expected AWS_STORAGE_PROVIDER=s3 to resolve S3StorageProvider, got ${s3Provider.constructor.name}`);
    }

    const s3Typed = s3Provider as S3StorageProvider;
    if (s3Typed.getBucketName() !== 'my-production-rag-bucket') {
      throw new Error(`Expected bucket name "my-production-rag-bucket", got "${s3Typed.getBucketName()}"`);
    }

    const testLogicalKey = 'documents/user-123/doc-456/sample.pdf';
    const presignedUrl = await s3Typed.createUploadUrl(testLogicalKey);
    if (!presignedUrl.includes(encodeURIComponent(testLogicalKey)) && !presignedUrl.includes(testLogicalKey)) {
      throw new Error(`Presigned URL did not contain logical key: ${presignedUrl}`);
    }
    console.log('  ✅ PASSED: S3StorageProvider resolved correctly, used configured bucket, and preserved logical key.');

    // Test 7: Worker Storage Provider Resolver Alignment
    console.log('\nTest 7: Worker Storage Provider Resolver Alignment');
    process.env.AWS_STORAGE_PROVIDER = 'local';
    const workerLocal = getWorkerStorageProvider();
    if (workerLocal.constructor.name !== 'LocalStorageProvider') {
      throw new Error(`Worker failed to resolve LocalStorageProvider, got ${workerLocal.constructor.name}`);
    }

    process.env.AWS_STORAGE_PROVIDER = 's3';
    process.env.AWS_REGION = 'us-west-2';
    process.env.AWS_S3_BUCKET = 'my-production-rag-bucket';
    const workerS3 = getWorkerStorageProvider();
    if (workerS3.constructor.name !== 'S3WorkerStorageProvider') {
      throw new Error(`Worker failed to resolve S3WorkerStorageProvider, got ${workerS3.constructor.name}`);
    }
    console.log('  ✅ PASSED: Background worker resolves identical StorageProvider abstraction for both local and S3.');

    // Test 8: Security Check (No Secret Leakage)
    console.log('\nTest 8: AWS Credentials Security Check');
    const safeStr = JSON.stringify(s3Provider, (key, value) => {
      if (key === 'client') return undefined; // Avoid circular S3Client internals
      return value;
    });
    if (safeStr.includes('test-secret-key')) {
      throw new Error('AWS credentials leaked in stringified object representation');
    }
    console.log('  ✅ PASSED: AWS credentials remain private to server code.');

  } finally {
    process.env = origEnv;
    resetStorageProviderForTest();
  }

  console.log('\n====================================================');
  console.log('🎉 ALL PHASE 15 S3 STORAGE TESTS PASSED!');
  console.log('====================================================\n');
}

runPhase15Tests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n❌ PHASE 15 TEST FAILED:', err);
    process.exit(1);
  });
