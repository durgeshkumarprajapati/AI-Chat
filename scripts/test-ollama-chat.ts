import dotenv from 'dotenv';
dotenv.config();

import { ollamaLLMProvider } from '../src/features/rag/llm/ollama.llm.provider';

async function testOllamaChat() {
  console.log('====================================================');
  console.log('Testing Local Ollama LLM Chat Model Connection');
  console.log('====================================================\n');

  const baseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
  const model = process.env.OLLAMA_CHAT_MODEL || 'llama3.2';

  console.log(`Base URL:   ${baseUrl}`);
  console.log(`Chat Model: ${model}\n`);

  try {
    // 1. Check Ollama API version endpoint
    const versionRes = await fetch(`${baseUrl.replace(/\/+$/, '')}/api/version`, {
      signal: AbortSignal.timeout(3000)
    });

    if (!versionRes.ok) {
      throw new Error(`Ollama version endpoint returned HTTP ${versionRes.status}`);
    }

    const versionData = await versionRes.json();
    console.log(`✅ Ollama Server Connected! Version: ${versionData.version || 'OK'}`);

    // 2. Send test prompt using OllamaLLMProvider
    console.log('\nSending test query to Ollama LLM provider...');
    const startTime = Date.now();

    const answer = await ollamaLLMProvider.generateAnswer({
      question: 'What is Retrieval-Augmented Generation (RAG) in 2 short sentences?',
      context: 'Retrieval-Augmented Generation (RAG) is an AI architecture that enhances LLM responses by fetching relevant document chunks from a vector database before generating an answer. It ensures grounded, accurate answers backed by source citations.'
    });

    const duration = Date.now() - startTime;

    console.log('\n----------------------------------------------------');
    console.log('Ollama Response:');
    console.log('----------------------------------------------------');
    console.log(answer);
    console.log('----------------------------------------------------');
    console.log(`Response Time: ${duration} ms\n`);

    console.log('====================================================');
    console.log('🎉 OLLAMA LOCAL LLM CHAT TEST PASSED!');
    console.log('====================================================\n');
  } catch (err) {
    console.error('\n❌ OLLAMA CHAT TEST FAILED:', err instanceof Error ? err.message : String(err));
    console.error('\nMake sure Ollama is running and the model is installed:');
    console.error(`  1. ollama serve`);
    console.error(`  2. ollama pull ${model}\n`);
    process.exit(1);
  }
}

testOllamaChat();
