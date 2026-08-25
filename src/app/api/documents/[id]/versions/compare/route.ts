import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { documentVersionComparisonService } from '@/features/document-management/comparison/document-version-comparison.service';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getAuthUser(req);
    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { versionA, versionB } = body;

    if (versionA === undefined || versionB === undefined) {
      return NextResponse.json({ error: 'versionA and versionB are required parameters' }, { status: 400 });
    }

    const comparison = await documentVersionComparisonService.compare({
      documentId: params.id,
      versionA: Number(versionA),
      versionB: Number(versionB)
    });

    return NextResponse.json({ success: true, comparison });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to compare document versions' }, { status: 500 });
  }
}
