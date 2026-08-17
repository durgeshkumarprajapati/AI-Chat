import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { aiWorkflowGeneratorService } from '@/features/workflow';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  _params: { params: { id: string } }
) {
  try {
    await getAuthUser(req);
    const body = await req.json();
    if (!body.prompt) {
      return NextResponse.json({ success: false, error: 'Prompt is required' }, { status: 400 });
    }
    const definition = await aiWorkflowGeneratorService.generateWorkflowFromPrompt(body.prompt);
    return NextResponse.json({ success: true, data: definition });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
