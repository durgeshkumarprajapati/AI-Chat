export interface ClickUpWorkspaceDTO {
  id: string;
  name: string;
  color?: string;
  avatar?: string;
}

export interface ClickUpListDTO {
  id: string;
  name: string;
  spaceName?: string;
  folderName?: string;
}

export interface CreateClickUpTaskPayload {
  name: string;
  description?: string;
  assignees?: number[];
  dueDate?: number;
  status?: string;
  priority?: number;
}

export interface ClickUpTaskResponseDTO {
  id: string;
  name: string;
  url: string;
  status: { status: string };
}

// Phase 78 additions — reuse the existing ClickUpClient/auth infrastructure, do not duplicate it.
export interface ClickUpTaskDTO {
  id: string;
  name: string;
  url: string;
  status: string;
  dueDate: number | null; // epoch ms, ClickUp's native format
  dateUpdated: number | null;
  listId: string;
  listName?: string;
}

export interface UpdateClickUpTaskPayload {
  name?: string;
  description?: string;
  status?: string;
  dueDate?: number;
  priority?: number;
}
