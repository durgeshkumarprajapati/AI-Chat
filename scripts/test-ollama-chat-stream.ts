import dotenv from 'dotenv';
dotenv.config();

import { OllamaLLMProvider } from '../src/features/rag/llm/ollama.llm.provider';

async function testRealOllamaStream() {
  console.log('====================================================');
  console.log('Testing Real Ollama Streaming LLM Provider');
  console.log('====================================================\n');

  const provider = new OllamaLLMProvider();

  const mockInput = {
    question: 'What is the deployment procedure for the Document AI platform?',
    context: `[Document: architecture.pdf | Page: 3]
The deployment procedure for the Document AI platform runs automatically via CI/CD when commits are merged into the main branch. Production containers are rebuilt and deployed to the Kubernetes cluster without downtime.`
  };

  console.log('Sending question to Ollama streaming provider...\n');
  console.log(`Question: ${mockInput.question}\n`);
  console.log('--- STREAMING RESPONSE START ---');

  let fullAnswer = '';
  const startTime = Date.now();

  try {
    const stream = provider.streamAnswer(mockInput);
    for await (const chunk of stream) {
      process.stdout.write(chunk);
      fullAnswer += chunk;
    }
    const duration = Date.now() - startTime;
    console.log('\n--- STREAMING RESPONSE END ---');
    console.log(`\nStream completed in ${duration}ms (${fullAnswer.length} characters).`);
  } catch (error) {
    console.error('\n❌ Ollama Streaming Failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

testRealOllamaStream();
