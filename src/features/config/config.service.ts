import { ConfigDTO, CreateConfigInput, UpdateConfigInput, IntegrationStatusDTO } from './config.types';
import { ConfigCategory } from '@prisma/client';
import { configRepository } from './config.repository';
import { configCacheService } from './config-cache.service';
import { configValidator } from './config-validator';
import { configTelemetryService } from './config-telemetry.service';
import { CONFIG_REGISTRY, validateRegistryKey } from './config.registry';
import { auditService } from '@/features/audit/audit.service';
import { NotFoundError, ValidationError } from '@/errors';
import { env } from '@/config/env';

export class ConfigService {
  /**
   * Resolves a configuration item with multi-level caching (Memory -> Redis -> Database -> Config Registry Fallback).
   */
  public async get(key: string): Promise<ConfigDTO | null> {
    const formattedKey = key.trim().toUpperCase();

    // 1. Memory cache check
    const memCache = configCacheService.getFromMemory(formattedKey);
    if (memCache) {
      return memCache.isActive ? memCache : null;
    }

    // 2. Redis cache check
    const redisCache = await configCacheService.getFromRedis(formattedKey);
    if (redisCache) {
      configCacheService.setToMemory(formattedKey, redisCache);
      return redisCache.isActive ? redisCache : null;
    }

    // 3. Database lookup
    try {
      const dbRecord = await configRepository.findByKey(formattedKey);
      if (dbRecord) {
        const dto: ConfigDTO = {
          id: dbRecord.id,
          key: dbRecord.key,
          value: dbRecord.value,
          valueType: dbRecord.valueType,
          category: dbRecord.category,
          purpose: dbRecord.purpose,
          description: dbRecord.description,
          isActive: dbRecord.isActive,
          isSystem: dbRecord.isSystem,
          createdAt: dbRecord.createdAt,
          updatedAt: dbRecord.updatedAt,
          createdBy: dbRecord.createdBy,
          updatedBy: dbRecord.updatedBy
        };

        configCacheService.setToMemory(formattedKey, dto);
        await configCacheService.setToRedis(formattedKey, dto);

        return dto.isActive ? dto : null;
      }
    } catch (err) {
      configTelemetryService.logEvent({ event: 'config.db_lookup_error', key: formattedKey, error: String(err) });
    }

    // 4. Config Registry Default Fallback
    const registryItem = CONFIG_REGISTRY[formattedKey];
    if (registryItem) {
      return {
        id: `registry-fallback-${formattedKey}`,
        key: formattedKey,
        value: registryItem.defaultValue,
        valueType: registryItem.valueType,
        category: registryItem.category,
        purpose: registryItem.purpose,
        description: registryItem.description || null,
        isActive: true,
        isSystem: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: null,
        updatedBy: null
      };
    }

    return null;
  }

  public async getString(key: string, defaultValue = ''): Promise<string> {
    const item = await this.get(key);
    return item ? item.value : defaultValue;
  }

  public async getNumber(key: string, defaultValue = 0): Promise<number> {
    const item = await this.get(key);
    if (!item) return defaultValue;
    const parsed = Number(item.value);
    return isNaN(parsed) ? defaultValue : parsed;
  }

  public async getBoolean(key: string, defaultValue = false): Promise<boolean> {
    const item = await this.get(key);
    if (!item) return defaultValue;
    return item.value.trim().toLowerCase() === 'true';
  }

  public async getJSON<T>(key: string, defaultValue: T): Promise<T> {
    const item = await this.get(key);
    if (!item) return defaultValue;
    try {
      return JSON.parse(item.value) as T;
    } catch {
      return defaultValue;
    }
  }

  public async listConfigs(opts?: { category?: ConfigCategory; isActive?: boolean }): Promise<ConfigDTO[]> {
    const records = await configRepository.findAll(opts);
    return records.map((r) => ({
      id: r.id,
      key: r.key,
      value: r.value,
      valueType: r.valueType,
      category: r.category,
      purpose: r.purpose,
      description: r.description,
      isActive: r.isActive,
      isSystem: r.isSystem,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      createdBy: r.createdBy,
      updatedBy: r.updatedBy
    }));
  }

  public async getByCategory(category: ConfigCategory): Promise<ConfigDTO[]> {
    return this.listConfigs({ category, isActive: true });
  }

  public async createConfig(input: CreateConfigInput): Promise<ConfigDTO> {
    const formattedKey = input.key.trim().toUpperCase();
    
    // Assert key exists in CONFIG_REGISTRY and is non-secret
    validateRegistryKey(formattedKey);
    configValidator.validateInput({ ...input, key: formattedKey });

    const existing = await configRepository.findByKey(formattedKey);
    if (existing) {
      throw new ValidationError(`Configuration key "${formattedKey}" already exists.`);
    }

    const created = await configRepository.create({
      ...input,
      key: formattedKey
    });

    const dto: ConfigDTO = {
      id: created.id,
      key: created.key,
      value: created.value,
      valueType: created.valueType,
      category: created.category,
      purpose: created.purpose,
      description: created.description,
      isActive: created.isActive,
      isSystem: created.isSystem,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
      createdBy: created.createdBy,
      updatedBy: created.updatedBy
    };

    configCacheService.setToMemory(formattedKey, dto);
    await configCacheService.setToRedis(formattedKey, dto);

    if (input.actorId) {
      await auditService.logEvent({
        actorId: input.actorId,
        action: 'CONFIG_CREATED',
        targetType: 'CONFIG',
        targetId: dto.id,
        details: { key: dto.key, category: dto.category }
      });
    }

    configTelemetryService.logEvent({ event: 'config.created', key: dto.key, actorId: input.actorId });

    return dto;
  }

  public async updateConfig(key: string, input: UpdateConfigInput): Promise<ConfigDTO> {
    const formattedKey = key.trim().toUpperCase();
    
    // Assert key exists in CONFIG_REGISTRY and is non-secret
    validateRegistryKey(formattedKey);
    configValidator.validateInput({ ...input, key: formattedKey });

    const existing = await configRepository.findByKey(formattedKey);
    if (!existing) {
      throw new NotFoundError(`Configuration with key "${formattedKey}" not found.`);
    }

    const previousValue = existing.value;
    const updated = await configRepository.update(formattedKey, input);

    const dto: ConfigDTO = {
      id: updated.id,
      key: updated.key,
      value: updated.value,
      valueType: updated.valueType,
      category: updated.category,
      purpose: updated.purpose,
      description: updated.description,
      isActive: updated.isActive,
      isSystem: updated.isSystem,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
      createdBy: updated.createdBy,
      updatedBy: updated.updatedBy
    };

    await configCacheService.invalidateKey(formattedKey, true);
    configCacheService.setToMemory(formattedKey, dto);
    await configCacheService.setToRedis(formattedKey, dto);

    if (input.actorId) {
      await auditService.logEvent({
        actorId: input.actorId,
        action: 'CONFIG_UPDATED',
        targetType: 'CONFIG',
        targetId: dto.id,
        details: { key: dto.key, previousValue, newValue: dto.value }
      });
    }

    configTelemetryService.logEvent({ event: 'config.updated', key: dto.key, actorId: input.actorId });

    return dto;
  }

  public async activateConfig(key: string, actorId?: string): Promise<ConfigDTO> {
    return this.setActivationStatus(key, true, actorId);
  }

  public async deactivateConfig(key: string, actorId?: string): Promise<ConfigDTO> {
    return this.setActivationStatus(key, false, actorId);
  }

  private async setActivationStatus(key: string, isActive: boolean, actorId?: string): Promise<ConfigDTO> {
    const formattedKey = key.trim().toUpperCase();
    validateRegistryKey(formattedKey);

    const existing = await configRepository.findByKey(formattedKey);
    if (!existing) {
      throw new NotFoundError(`Configuration with key "${formattedKey}" not found.`);
    }

    const updated = await configRepository.updateStatus(formattedKey, isActive, actorId);

    const dto: ConfigDTO = {
      id: updated.id,
      key: updated.key,
      value: updated.value,
      valueType: updated.valueType,
      category: updated.category,
      purpose: updated.purpose,
      description: updated.description,
      isActive: updated.isActive,
      isSystem: updated.isSystem,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
      createdBy: updated.createdBy,
      updatedBy: updated.updatedBy
    };

    await configCacheService.invalidateKey(formattedKey, true);

    if (actorId) {
      await auditService.logEvent({
        actorId,
        action: isActive ? 'CONFIG_ACTIVATED' : 'CONFIG_DEACTIVATED',
        targetType: 'CONFIG',
        targetId: dto.id,
        details: { key: dto.key, isActive }
      });
    }

    configTelemetryService.logEvent({
      event: isActive ? 'config.activated' : 'config.deactivated',
      key: dto.key,
      actorId
    });

    return dto;
  }

  /**
   * Returns external provider integration status (configured & enabled), NEVER exposing secret API keys or strings.
   */
  public async getIntegrationStatus(): Promise<IntegrationStatusDTO[]> {
    return [
      {
        providerName: 'Google Gemini',
        configured: Boolean(env.server?.GEMINI_API_KEY || process.env.GEMINI_API_KEY),
        enabled: await this.getBoolean('GEMINI_ENABLED', true)
      },
      {
        providerName: 'DeepSeek',
        configured: Boolean(env.server?.DEEPSEEK_API_KEY || process.env.DEEPSEEK_API_KEY),
        enabled: await this.getBoolean('DEEPSEEK_ENABLED', true)
      },
      {
        providerName: 'Groq',
        configured: Boolean(env.server?.GROQ_API_KEY || process.env.GROQ_API_KEY),
        enabled: await this.getBoolean('GROQ_ENABLED', true)
      },
      {
        providerName: 'ClickUp Integration',
        configured: Boolean(env.server?.CLICKUP_CLIENT_ID && env.server?.CLICKUP_CLIENT_SECRET),
        enabled: await this.getBoolean('CLICKUP_ENABLED', true)
      },
      {
        providerName: 'Web Intelligence (Tavily)',
        configured: Boolean(env.server?.TAVILY_API_KEY || process.env.TAVILY_API_KEY),
        enabled: await this.getBoolean('WEB_SEARCH_ENABLED', true)
      }
    ];
  }
}

export const configService = new ConfigService();
