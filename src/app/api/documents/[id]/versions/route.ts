import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { documentVersionService } from '@/features/document-management/versioning/document-version.service';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getAuthUser(req);
    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const versions = await documentVersionService.listVersions(params.id);
    return NextResponse.json({ success: true, versions });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to list document versions' }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getAuthUser(req);
    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { storageKey, contentHash, fileSize, pageCount, setActive } = body;

    if (!storageKey || !fileSize) {
      return NextResponse.json({ error: 'storageKey and fileSize are required' }, { status: 400 });
    }

    const version = await documentVersionService.createNextVersion({
      documentId: params.id,
      storageKey,
      contentHash: contentHash || 'sha256-hash',
      fileSize,
      pageCount: pageCount || 0,
      uploadedByUserId: user.id,
      isActive: setActive !== false
    });

    return NextResponse.json({ success: true, version });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to create document version' }, { status: 500 });
  }
}
