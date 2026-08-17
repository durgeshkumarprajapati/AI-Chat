import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { projectService } from '@/features/projects/project.service';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    const projects = await projectService.getUserProjects(user.id);
    return NextResponse.json({ success: true, data: projects });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to fetch projects' },
      { status: err.message?.includes('Unauthorized') ? 401 : 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    const body = await req.json();

    if (!body.name) {
      return NextResponse.json({ success: false, error: 'Project name is required' }, { status: 400 });
    }

    const project = await projectService.createProject(user.id, body);
    return NextResponse.json({ success: true, data: project }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to create project' },
      { status: 500 }
    );
  }
}
