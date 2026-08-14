import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { roadmapSharingService } from '@/features/roadmap/sharing/roadmap-sharing.service';
import { SharePermission } from '@prisma/client';
import { AppError } from '@/errors';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: { id: string };
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const user = await getAuthUser(req);
    const shares = await roadmapSharingService.getRoadmapShares(params.id, user.id);

    return NextResponse.json({
      success: true,
      data: shares
    });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { success: false, error: { code: error.code, message: error.message } },
        { status: error.statusCode }
      );
    }
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch shares.' } },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const user = await getAuthUser(req);
    const body = await req.json();

    const targetEmail = String(body.targetUserEmail || body.email || '').trim();
    const permission = body.permission === 'EDIT' ? SharePermission.EDIT : SharePermission.VIEW;
    const expiresInDays = body.expiresInDays ? Number(body.expiresInDays) : undefined;

    if (!targetEmail) {
      return NextResponse.json(
        { success: false, error: { code: 'UNPROCESSABLE_ENTITY', message: 'Target user email is required.' } },
        { status: 422 }
      );
    }

    const share = await roadmapSharingService.shareRoadmap(params.id, user.id, targetEmail, permission, expiresInDays);

    return NextResponse.json({
      success: true,
      data: share
    });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { success: false, error: { code: error.code, message: error.message } },
        { status: error.statusCode }
      );
    }
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to share roadmap.' } },
      { status: 500 }
    );
  }
}
