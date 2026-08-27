import { ConfigValueType, ConfigCategory } from '@prisma/client';

export { ConfigValueType, ConfigCategory };

export interface ConfigDTO {
  id: string;
  key: string;
  value: string;
  valueType: ConfigValueType;
  category: ConfigCategory;
  purpose: string;
  description: string | null;
  isActive: boolean;
  isSystem: boolean;
  version: number;
  isEditable: boolean;
  isHighImpact: boolean;
  requiresRestart: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
}

export interface CreateConfigInput {
  key: string;
  value: string;
  valueType: ConfigValueType;
  category: ConfigCategory;
  purpose: string;
  description?: string | null;
  isActive?: boolean;
  isSystem?: boolean;
  actorId?: string;
}

export interface UpdateConfigInput {
  value?: string;
  valueType?: ConfigValueType;
  category?: ConfigCategory;
  purpose?: string;
  description?: string | null;
  isActive?: boolean;
  expectedVersion?: number;
  actorId?: string;
}

export interface IntegrationStatusDTO {
  providerName: string;
  purpose: string;
  configured: boolean;
  enabled: boolean;
  connectionStatus: 'HEALTHY' | 'UNAVAILABLE' | 'NOT_CONFIGURED';
  managedBy: 'ENVIRONMENT_SECRET_MANAGER' | 'DATABASE_CONFIG';
}
