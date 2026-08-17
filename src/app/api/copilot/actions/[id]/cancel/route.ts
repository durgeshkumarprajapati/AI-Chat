import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getAuthUser(req);
    const action = await prisma.copilotAction.findUnique({
      where: { id: params.id },
      include: { session: true }
    });

    if (!action || action.session.userId !== user.id) {
      return NextResponse.json({ success: false, error: 'Action not found' }, { status: 404 });
    }

    await prisma.copilotAction.update({
      where: { id: params.id },
      data: { status: 'CANCELLED' }
    });

    return NextResponse.json({ success: true, message: 'Action cancelled' });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 403 });
  }
}
