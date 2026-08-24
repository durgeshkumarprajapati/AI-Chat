import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { mockTestLibraryService } from '@/features/mock-tests/library/mock-test-library.service';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const status = (searchParams.get('status') as any) || undefined;
    const search = searchParams.get('search') || undefined;
    const topic = searchParams.get('topic') || undefined;

    const result = await mockTestLibraryService.getLibraryTests(user.id, {
      page,
      limit,
      status,
      search,
      topic
    });

    return NextResponse.json({ success: true, ...result }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to fetch mock test library' },
      { status: 400 }
    );
  }
}
