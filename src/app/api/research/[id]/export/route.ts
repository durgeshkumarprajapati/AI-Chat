import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { researchSessionService } from '@/features/research';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthUser(req);
    const body = await req.json();
    const format = (body.format || 'markdown').toLowerCase();

    const session = await researchSessionService.getSessionDetails(user.id, params.id);
    const latestReport = session.reports?.[0];

    if (!latestReport) {
      return NextResponse.json({ success: false, error: 'No research report available for export' }, { status: 404 });
    }

    if (format === 'json') {
      return NextResponse.json({
        success: true,
        data: {
          title: session.title,
          question: session.question,
          status: session.status,
          report: latestReport.reportContent,
          sources: session.sources,
          claims: session.claims,
          conflicts: session.conflicts,
          createdAt: session.createdAt
        }
      });
    }

    // Default Markdown format
    return new NextResponse(latestReport.reportContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Content-Disposition': `attachment; filename="Research_Report_${params.id.slice(0, 8)}.md"`
      }
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
