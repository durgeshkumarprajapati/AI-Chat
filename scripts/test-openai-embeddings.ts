import dotenv from 'dotenv';
dotenv.config();

import { openAIEmbeddingProvider } from '../src/features/documents/embeddings/embedding.provider';

async function testRealOpenAIEmbedding() {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey || apiKey === 'sk-mock-key-for-development' || apiKey.includes('mock')) {
    console.log('⚠️  Skipping real OpenAI API test: OPENAI_API_KEY is not set to a valid production key.');
    console.log('To run this test, set OPENAI_API_KEY=sk-... in your environment.');
    process.exit(0);
  }

  console.log('Running Real OpenAI Embedding API Test (text-embedding-3-small)...');

  const testText = 'The Document AI platform extracts text, creates chunks, and generates 1536-dimensional embeddings.';
  const vectors = await openAIEmbeddingProvider.embedTexts([testText]);

  if (!vectors || vectors.length !== 1) {
    throw new Error(`Expected 1 vector response, got ${vectors ? vectors.length : 0}`);
  }

  const vector = vectors[0]!;
  if (vector.length !== 1536) {
    throw new Error(`Expected 1536 dimensions, got ${vector.length}`);
  }

  console.log('✅ Real OpenAI Embedding API Test SUCCESSFUL!');
  console.log(`  Input text: "${testText}"`);
  console.log(`  Returned vector dimensions: ${vector.length}`);
  console.log('  API Key verified and hidden safely.');
}

testRealOpenAIEmbedding()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Real OpenAI API Test FAILED:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
