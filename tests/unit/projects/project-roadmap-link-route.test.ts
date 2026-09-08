jest.mock('@/lib/auth', () => ({ getAuthUser: jest.fn() }));

const mockCreateLink = jest.fn();
const mockCreateRoadmapAndLink = jest.fn();
const mockListLinks = jest.fn();
const mockSetPrimaryRoadmap = jest.fn();
const mockUnlink = jest.fn();
jest.mock('@/features/projects/roadmap-links/project-roadmap-link.service', () => ({
  projectRoadmapLinkService: {
    createLink: (...args: unknown[]) => mockCreateLink(...args),
    createRoadmapAndLink: (...args: unknown[]) => mockCreateRoadmapAndLink(...args),
    listLinks: (...args: unknown[]) => mockListLinks(...args),
    setPrimaryRoadmap: (...args: unknown[]) => mockSetPrimaryRoadmap(...args),
    unlink: (...args: unknown[]) => mockUnlink(...args)
  }
}));

import { NextRequest } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { AuthorizationError, ConflictError } from '@/errors';
import { GET, POST } from '@/app/api/projects/[id]/roadmaps/route';
import { PATCH, DELETE } from '@/app/api/projects/[id]/roadmaps/[roadmapId]/route';

function postRequest(body: unknown) {
  return new NextRequest('http://localhost:3000/api/projects/project-1/roadmaps', {
    method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' }
  });
}
function patchRequest(body: unknown) {
  return new NextRequest('http://localhost:3000/api/projects/project-1/roadmaps/roadmap-1', {
    method: 'PATCH', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' }
  });
}
function getRequest() {
  return new NextRequest('http://localhost:3000/api/projects/project-1/roadmaps', { method: 'GET' });
}
function deleteRequest() {
  return new NextRequest('http://localhost:3000/api/projects/project-1/roadmaps/roadmap-1', { method: 'DELETE' });
}

describe('GET /api/projects/[id]/roadmaps', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns the link list for an authorized user', async () => {
    (getAuthUser as jest.Mock).mockResolvedValue({ id: 'user-1' });
    mockListLinks.mockResolvedValue({ links: [{ roadmapId: 'r1', title: 'X', isPrimary: false, linkedAt: new Date(), roadmapPermission: 'OWNER' }], inaccessibleRoadmapCount: 0 });

    const res = await GET(getRequest(), { params: { id: 'project-1' } });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.links).toHaveLength(1);
    expect(mockListLinks).toHaveBeenCalledWith('user-1', 'project-1');
  });

  it('rejects an unauthorized user', async () => {
    (getAuthUser as jest.Mock).mockResolvedValue({ id: 'stranger' });
    mockListLinks.mockRejectedValue(new AuthorizationError('denied'));

    const res = await GET(getRequest(), { params: { id: 'project-1' } });

    expect(res.status).toBe(403);
  });
});

describe('POST /api/projects/[id]/roadmaps', () => {
  beforeEach(() => jest.clearAllMocks());

  it('links an existing roadmap when roadmapId is provided', async () => {
    (getAuthUser as jest.Mock).mockResolvedValue({ id: 'user-1' });
    mockCreateLink.mockResolvedValue(undefined);

    const res = await POST(postRequest({ roadmapId: 'roadmap-1' }), { params: { id: 'project-1' } });

    expect(res.status).toBe(201);
    expect(mockCreateLink).toHaveBeenCalledWith('user-1', 'project-1', 'roadmap-1');
    expect(mockCreateRoadmapAndLink).not.toHaveBeenCalled();
  });

  it('generates and links a new roadmap when create is provided', async () => {
    (getAuthUser as jest.Mock).mockResolvedValue({ id: 'user-1' });
    mockCreateRoadmapAndLink.mockResolvedValue({ id: 'new-roadmap' });

    const res = await POST(postRequest({ create: { goal: 'Learn Rust' } }), { params: { id: 'project-1' } });
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.data.id).toBe('new-roadmap');
    expect(mockCreateRoadmapAndLink).toHaveBeenCalledWith('user-1', 'project-1', { goal: 'Learn Rust' });
    expect(mockCreateLink).not.toHaveBeenCalled();
  });

  it('rejects a request providing neither roadmapId nor create', async () => {
    (getAuthUser as jest.Mock).mockResolvedValue({ id: 'user-1' });

    const res = await POST(postRequest({}), { params: { id: 'project-1' } });

    expect(res.status).toBe(400);
    expect(mockCreateLink).not.toHaveBeenCalled();
    expect(mockCreateRoadmapAndLink).not.toHaveBeenCalled();
  });

  it('rejects a request providing both roadmapId and create', async () => {
    (getAuthUser as jest.Mock).mockResolvedValue({ id: 'user-1' });

    const res = await POST(postRequest({ roadmapId: 'r1', create: {} }), { params: { id: 'project-1' } });

    expect(res.status).toBe(400);
  });

  it('surfaces a duplicate-link conflict as 409', async () => {
    (getAuthUser as jest.Mock).mockResolvedValue({ id: 'user-1' });
    mockCreateLink.mockRejectedValue(new ConflictError('This roadmap is already linked to this project.'));

    const res = await POST(postRequest({ roadmapId: 'roadmap-1' }), { params: { id: 'project-1' } });

    expect(res.status).toBe(409);
  });

  it('surfaces an unauthorized link attempt as 403', async () => {
    (getAuthUser as jest.Mock).mockResolvedValue({ id: 'user-1' });
    mockCreateLink.mockRejectedValue(new AuthorizationError('denied'));

    const res = await POST(postRequest({ roadmapId: 'roadmap-1' }), { params: { id: 'project-1' } });

    expect(res.status).toBe(403);
  });
});

describe('PATCH /api/projects/[id]/roadmaps/[roadmapId]', () => {
  beforeEach(() => jest.clearAllMocks());

  it('sets the roadmap as primary', async () => {
    (getAuthUser as jest.Mock).mockResolvedValue({ id: 'user-1' });
    mockSetPrimaryRoadmap.mockResolvedValue(undefined);

    const res = await PATCH(patchRequest({ isPrimary: true }), { params: { id: 'project-1', roadmapId: 'roadmap-1' } });

    expect(res.status).toBe(200);
    expect(mockSetPrimaryRoadmap).toHaveBeenCalledWith('user-1', 'project-1', 'roadmap-1');
  });

  it('rejects a body without isPrimary: true', async () => {
    (getAuthUser as jest.Mock).mockResolvedValue({ id: 'user-1' });

    const res = await PATCH(patchRequest({ isPrimary: false }), { params: { id: 'project-1', roadmapId: 'roadmap-1' } });

    expect(res.status).toBe(400);
    expect(mockSetPrimaryRoadmap).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/projects/[id]/roadmaps/[roadmapId]', () => {
  beforeEach(() => jest.clearAllMocks());

  it('unlinks the roadmap', async () => {
    (getAuthUser as jest.Mock).mockResolvedValue({ id: 'user-1' });
    mockUnlink.mockResolvedValue(undefined);

    const res = await DELETE(deleteRequest(), { params: { id: 'project-1', roadmapId: 'roadmap-1' } });

    expect(res.status).toBe(200);
    expect(mockUnlink).toHaveBeenCalledWith('user-1', 'project-1', 'roadmap-1');
  });

  it('rejects an unauthorized unlink attempt', async () => {
    (getAuthUser as jest.Mock).mockResolvedValue({ id: 'stranger' });
    mockUnlink.mockRejectedValue(new AuthorizationError('denied'));

    const res = await DELETE(deleteRequest(), { params: { id: 'project-1', roadmapId: 'roadmap-1' } });

    expect(res.status).toBe(403);
  });
});
