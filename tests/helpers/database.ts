import { prisma } from '@/lib/prisma';

export function assertTestDatabaseSafety(): void {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error(`[SAFETY GUARD] Attempting to run test database operations outside NODE_ENV=test! Current: ${process.env.NODE_ENV}`);
  }

  const dbUrl = process.env.DATABASE_URL || '';
  if (dbUrl.includes('production') || dbUrl.includes('prod-db')) {
    throw new Error(`[SAFETY GUARD] Refusing to run tests against production database URL: ${dbUrl}`);
  }
}

export async function cleanupTestData(userIds: string[] = []): Promise<void> {
  assertTestDatabaseSafety();

  if (userIds.length === 0) return;

  try {
    await prisma.userFeedback.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.ragEvaluation.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.message.deleteMany({ where: { conversation: { userId: { in: userIds } } } });
    await prisma.conversation.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.documentChunk.deleteMany({ where: { document: { userId: { in: userIds } } } });
    await prisma.document.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.knowledgeBase.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  } catch (err) {
    // Log warning if database is offline during pure unit testing
    console.warn('[CleanupTestData] Database cleanup notice:', err instanceof Error ? err.message : String(err));
  }
}
