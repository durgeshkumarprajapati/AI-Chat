import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { duplicateDetectionService } from '@/features/document-management/duplicate-detection/duplicate-detection.service';

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { text, excludeDocumentId } = body;

    const result = await duplicateDetectionService.check({
      userId: user.id,
      text: text || '',
      excludeDocumentId
    });

    return NextResponse.json({ success: true, duplicate: result });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to check document duplicate status' }, { status: 500 });
  }
}
