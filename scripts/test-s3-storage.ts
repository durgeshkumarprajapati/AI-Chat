import dotenv from 'dotenv';
dotenv.config();

import { S3StorageProvider } from '../src/lib/s3';

async function testS3Storage() {
  console.log('====================================================');
  console.log('Running Real AWS S3 Storage Integration Test');
  console.log('====================================================\n');

  const providerType = process.env.AWS_STORAGE_PROVIDER || process.env.STORAGE_PROVIDER || 'local';

  if (providerType !== 's3') {
    console.log('ℹ️ S3 integration test skipped because AWS_STORAGE_PROVIDER is not s3.');
    process.exit(0);
  }

  try {
    const s3 = new S3StorageProvider();
    console.log(`[S3 Test] Using S3 Bucket: "${s3.getBucketName()}"`);

    const timestamp = Date.now();
    const testKey = `tests/s3-connectivity/${timestamp}.txt`;
    const testContent = `Document AI S3 Connectivity Test Timestamp: ${timestamp}`;

    console.log(`[S3 Test] Uploading temporary object: "${testKey}"...`);
    await s3.upload(testKey, Buffer.from(testContent), 'text/plain');

    console.log(`[S3 Test] Verifying object existence...`);
    const exists = await s3.exists(testKey);
    if (!exists) {
      throw new Error(`S3 object "${testKey}" was uploaded but head check returned false.`);
    }

    console.log(`[S3 Test] Downloading object...`);
    const downloadedBuffer = await s3.download(testKey);
    const downloadedContent = downloadedBuffer.toString('utf-8');

    if (downloadedContent !== testContent) {
      throw new Error(`Content mismatch! Expected "${testContent}", got "${downloadedContent}"`);
    }

    console.log(`[S3 Test] Deleting temporary test object...`);
    await s3.delete(testKey);

    const existsAfterDelete = await s3.exists(testKey);
    if (existsAfterDelete) {
      throw new Error(`S3 object "${testKey}" still exists after delete call.`);
    }

    console.log('\n====================================================');
    console.log('✅ S3 integration verification succeeded.');
    console.log('====================================================\n');
  } catch (err) {
    console.error('\n❌ S3 INTEGRATION TEST FAILED:', err);
    process.exit(1);
  }
}

testS3Storage();
