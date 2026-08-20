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
    const details = await mockTestLibraryService.getTestDetails(mockTestId, user.id);

    if (!details) {
      return NextResponse.json({ success: false, error: 'Mock test not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, ...details }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to fetch test details' },
      { status: 400 }
    );
  }
}
