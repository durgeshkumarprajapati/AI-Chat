import { ConversationContextService } from '../src/features/rag/chat/conversation-context.service';

const assertEqual = (actual: unknown, expected: unknown, message: string) => {
  if (actual !== expected) throw new Error(`${message}: expected ${String(expected)}, received ${String(actual)}`);
};

async function run() {
  const service = new ConversationContextService({} as any);
  assertEqual(service.classifyQuery('all machine learning libraries', true), 'STANDALONE', 'Topic-only query must skip rewrite');
  assertEqual(service.classifyQuery('explain Python decorators', true), 'STANDALONE', 'Standalone question must skip rewrite');
  assertEqual(service.classifyQuery('explain the second one', true), 'FOLLOW_UP', 'Ordinal reference must contextualize');
  assertEqual(service.classifyQuery('tell me more about that', true), 'FOLLOW_UP', 'Demonstrative reference must contextualize');
  assertEqual(service.classifyQuery('Explain it', true), 'AMBIGUOUS', 'Generic pronoun query must not use global cache');
  assertEqual(service.classifyQuery('why?', true), 'AMBIGUOUS', 'Context-dependent short query must be conservative');
  assertEqual(service.classifyQuery('vector databases', false), 'STANDALONE', 'Short topic query is not automatically a follow-up');
  console.log('✅ Phase 22 deterministic query-context classifier contracts passed.');
}

run().catch((error) => { console.error(error); process.exit(1); });
