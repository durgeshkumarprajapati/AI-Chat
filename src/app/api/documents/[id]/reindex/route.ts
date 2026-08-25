import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { documentReindexService } from '@/features/document-management/reindex/document-reindex.service';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getAuthUser(req);
    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));

    const result = await documentReindexService.requestReindex({
      documentId: params.id,
      userId: user.id,
      options: {
        reembed: body.reembed ?? true,
        reextractMetadata: body.reextractMetadata ?? true,
        reclassifyDoctype: body.reclassifyDoctype ?? true
      }
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error || 'Re-indexing failed' }, { status: 400 });
    }

    return NextResponse.json({ success: true, jobId: result.jobId, queued: result.queued });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to initiate re-indexing' }, { status: 500 });
  }
}
