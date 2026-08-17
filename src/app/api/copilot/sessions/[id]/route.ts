import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getAuthUser(req);
    const session = await prisma.copilotSession.findUnique({
      where: { id: params.id },
      include: {
        actions: true,
        events: { orderBy: { createdAt: 'asc' } },
        project: { select: { id: true, name: true } }
      }
    });

    if (!session || session.userId !== user.id) {
      return NextResponse.json({ success: false, error: 'Session not found or unauthorized' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: session });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
