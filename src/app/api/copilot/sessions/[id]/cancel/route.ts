import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { copilotExecutionEngine } from '@/features/copilot/execution/copilot-execution.engine';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getAuthUser(req);
    await copilotExecutionEngine.cancelSession(params.id, user.id);
    return NextResponse.json({ success: true, message: 'Session cancelled' });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 403 });
  }
}
