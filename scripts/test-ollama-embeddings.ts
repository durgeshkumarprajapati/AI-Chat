import dotenv from 'dotenv';
dotenv.config();

import { ollamaEmbeddingProvider } from '../src/features/documents/embeddings/ollama.embedding.provider';

async function testRealOllamaEmbedding() {
  const baseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
  const model = process.env.OLLAMA_EMBEDDING_MODEL || 'nomic-embed-text';

  console.log(`Checking connection to local Ollama server at ${baseUrl}...`);

  try {
    const healthRes = await fetch(`${baseUrl.replace(/\/+$/, '')}/api/version`);
    if (!healthRes.ok) {
      console.log(`⚠️  Ollama server at ${baseUrl} returned status ${healthRes.status}.`);
      console.log('To run this test, ensure Ollama is installed and running:');
      console.log('  1. Install Ollama: https://ollama.com');
      console.log('  2. Pull model: ollama pull nomic-embed-text');
      console.log('  3. Start service: ollama serve');
      process.exit(0);
    }
  } catch (err) {
    console.log(`⚠️  Unable to connect to local Ollama server at ${baseUrl}.`);
    console.log('To run this test, ensure Ollama is installed and running:');
    console.log('  1. Install Ollama: https://ollama.com');
    console.log('  2. Pull model: ollama pull nomic-embed-text');
    console.log('  3. Start service: ollama serve');
    process.exit(0);
  }

  console.log(`Sending test embedding request to Ollama (model: ${model})...`);
  const testText = 'Testing real local Ollama nomic-embed-text 768-dimensional vector embedding generation.';
  
  try {
    const vectors = await ollamaEmbeddingProvider.embedTexts([testText]);

    if (!vectors || vectors.length !== 1) {
      throw new Error(`Expected 1 vector response, got ${vectors ? vectors.length : 0}`);
    }

    const vector = vectors[0]!;
    if (vector.length !== 768) {
      throw new Error(`Expected 768 dimensions, got ${vector.length}`);
    }

    console.log('✅ Real Ollama Embedding API Test SUCCESSFUL!');
    console.log(`  Model: ${model}`);
    console.log(`  Input text: "${testText}"`);
    console.log(`  Returned vector dimensions: ${vector.length}`);
  } catch (err) {
    console.error('❌ Real Ollama API Test FAILED:', err instanceof Error ? err.message : String(err));
    console.log('\nMake sure you have pulled the model:');
    console.log(`  ollama pull ${model}`);
    process.exit(1);
  }
}

testRealOllamaEmbedding()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Unexpected error during Ollama test:', err);
    process.exit(1);
  });
