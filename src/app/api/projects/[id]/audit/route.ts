import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { projectAuthorizationService } from '@/features/projects/project-authorization.service';
import { auditService } from '@/features/audit/audit.service';
import { AppError } from '@/errors';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authUser = await getAuthUser(req);
    await projectAuthorizationService.authorizeProjectAccess(
      authUser.id,
      params.id,
      'VIEW_AUDIT_LOGS'
    );

    const { searchParams } = new URL(req.url);
    const action = searchParams.get('action') || undefined;
    const actorId = searchParams.get('actorId') || undefined;
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = parseInt(searchParams.get('pageSize') || '20', 10);

    const result = await auditService.getAuditLogs({
      projectId: params.id,
      action,
      actorId,
      page,
      pageSize
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { success: false, error: { code: error.code, message: error.message } },
        { status: error.statusCode }
      );
    }
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to fetch project audit logs' } },
      { status: 500 }
    );
  }
}
