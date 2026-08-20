import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { mockTestLibraryService } from '@/features/mock-tests/library/mock-test-library.service';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { id: mockTestId } = await params;
    const results = await mockTestLibraryService.getTestResults(mockTestId, user.id);

    return NextResponse.json({ success: true, ...results }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to fetch test results' },
      { status: 400 }
    );
  }
}
