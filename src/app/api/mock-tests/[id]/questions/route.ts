import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { mockTestLibraryService } from '@/features/mock-tests/library/mock-test-library.service';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { id: mockTestId } = await params;
    const questionsRes = await mockTestLibraryService.getTestQuestions(mockTestId, user.id);

    return NextResponse.json({ success: true, ...questionsRes }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to fetch test questions' },
      { status: 400 }
    );
  }
}
