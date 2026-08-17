import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { workflowValidatorService } from '@/features/workflow';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  _params: { params: { id: string } }
) {
  try {
    await getAuthUser(req);
    const body = await req.json();
    const result = workflowValidatorService.validateWorkflowDefinition(body.definition);
    return NextResponse.json({ success: true, data: result });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
