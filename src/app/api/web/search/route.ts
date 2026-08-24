import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { z } from 'zod';
import { webIntelligenceService } from '@/features/web-intelligence/web-intelligence.service';
import { AppError } from '@/errors';

const webSearchSchema = z.object({
  query: z.string().min(1, 'Search query is required').max(500),
  maxResults: z.number().int().min(1).max(20).optional(),
  topic: z.enum(['general', 'news']).optional()
});

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const parseResult = webSearchSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parseResult.error.errors },
        { status: 400 }
      );
    }

    const { query, maxResults, topic } = parseResult.data;

    const { response, evidence } = await webIntelligenceService.searchWeb({
      query,
      maxResults,
      topic
    });

    return NextResponse.json({
      success: true,
      query: response.query,
      resultsCount: response.results.length,
      provider: response.provider,
      totalMs: response.totalMs,
      cached: response.cached || false,
      evidence
    });
  } catch (error: any) {
    if (error instanceof AppError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    return NextResponse.json(
      { error: error.message || 'Failed to execute web search' },
      { status: 500 }
    );
  }
}
