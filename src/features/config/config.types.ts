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
  actorId?: string;
}

export interface IntegrationStatusDTO {
  providerName: string;
  configured: boolean;
  enabled: boolean;
}
