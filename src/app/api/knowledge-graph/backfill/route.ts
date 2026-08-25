import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { knowledgeGraphService } from '@/features/knowledge-graph/knowledge-graph.service';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    const result = await knowledgeGraphService.backfillUserDocuments(user.id);

    return NextResponse.json({
      success: true,
      message: `Queued graph extraction for ${result.queuedJobsCount} of ${result.totalCompletedDocuments} completed documents.`,
      data: result
    });
  } catch (err: any) {
    console.error('POST /api/knowledge-graph/backfill error:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to trigger Knowledge Graph backfill.' },
      { status: err.status || 500 }
    );
  }
}
