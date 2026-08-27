import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser } from '@/lib/auth';
import { transactionRepository } from '@/features/billing/repositories/transaction.repository';
import { AppError } from '@/errors';

export const dynamic = 'force-dynamic';

/** Own billing history only — never accepts a userId param (tenant isolation). */
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(req);
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, Number(searchParams.get('page')) || 1);
    const pageSize = Math.min(50, Math.max(1, Number(searchParams.get('pageSize')) || 20));

    const result = await transactionRepository.listByUser(user.id, { page, pageSize });
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json({ success: false, error: { code: error.code, message: error.message } }, { status: error.statusCode });
    }
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to load billing history' } },
      { status: 500 }
    );
  }
}
