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
