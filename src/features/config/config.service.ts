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
   * Helper to map database record or fallback to ConfigDTO enriched with governance metadata.
   */
  private enrichDTO(dbRecord: any): ConfigDTO {
    const registryItem = CONFIG_REGISTRY[dbRecord.key];

    return {
      id: dbRecord.id,
      key: dbRecord.key,
      value: dbRecord.value,
      valueType: dbRecord.valueType,
      category: dbRecord.category,
      purpose: dbRecord.purpose,
      description: dbRecord.description,
      isActive: dbRecord.isActive,
      isSystem: dbRecord.isSystem,
      version: dbRecord.version ?? 1,
      isEditable: registryItem ? registryItem.isEditable : true,
      isHighImpact: registryItem ? registryItem.isHighImpact : false,
      requiresRestart: registryItem ? registryItem.requiresRestart : false,
      createdAt: dbRecord.createdAt,
      updatedAt: dbRecord.updatedAt,
      createdBy: dbRecord.createdBy,
      updatedBy: dbRecord.updatedBy
    };
  }

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
        const dto = this.enrichDTO(dbRecord);
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
        version: 1,
        isEditable: registryItem.isEditable,
        isHighImpact: registryItem.isHighImpact,
        requiresRestart: registryItem.requiresRestart,
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
    return records.map((r) => this.enrichDTO(r));
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

    const dto = this.enrichDTO(created);

    configCacheService.setToMemory(formattedKey, dto);
    await configCacheService.setToRedis(formattedKey, dto);

    if (input.actorId) {
      await auditService.logEvent({
        actorId: input.actorId,
        action: 'CONFIG_CREATED',
        targetType: 'CONFIG',
        targetId: dto.id,
        details: { key: dto.key, category: dto.category, version: dto.version }
      });
    }

    configTelemetryService.logEvent({ event: 'config.created', key: dto.key, actorId: input.actorId });

    return dto;
  }

  public async updateConfig(key: string, input: UpdateConfigInput): Promise<ConfigDTO> {
    const formattedKey = key.trim().toUpperCase();
    
    // Assert key exists in CONFIG_REGISTRY and is non-secret & editable
    const registryItem = validateRegistryKey(formattedKey);
    if (!registryItem.isEditable) {
      throw new ValidationError(`Configuration key "${formattedKey}" is marked as non-editable.`);
    }

    const existing = await configRepository.findByKey(formattedKey);
    if (!existing) {
      throw new NotFoundError(`Configuration with key "${formattedKey}" not found.`);
    }

    configValidator.validateInput({
      key: formattedKey,
      value: input.value !== undefined ? input.value : existing.value,
      valueType: input.valueType || existing.valueType,
      purpose: input.purpose || existing.purpose
    });

    const previousValue = existing.value;

    // Database transaction execution with optimistic concurrency check
    const updated = await configRepository.update(formattedKey, input);
    const dto = this.enrichDTO(updated);

    // Commit-First: Trigger cache invalidation and PubSub AFTER DB commit succeeds
    await configCacheService.invalidateKey(formattedKey, true);
    configCacheService.setToMemory(formattedKey, dto);
    await configCacheService.setToRedis(formattedKey, dto);

    if (input.actorId) {
      await auditService.logEvent({
        actorId: input.actorId,
        action: 'CONFIG_UPDATED',
        targetType: 'CONFIG',
        targetId: dto.id,
        details: { key: dto.key, previousValue, newValue: dto.value, version: dto.version }
      });
    }

    configTelemetryService.logEvent({ event: 'config.updated', key: dto.key, version: dto.version, actorId: input.actorId });

    return dto;
  }

  public async activateConfig(key: string, actorId?: string, expectedVersion?: number): Promise<ConfigDTO> {
    return this.setActivationStatus(key, true, actorId, expectedVersion);
  }

  public async deactivateConfig(key: string, actorId?: string, expectedVersion?: number): Promise<ConfigDTO> {
    return this.setActivationStatus(key, false, actorId, expectedVersion);
  }

  private async setActivationStatus(key: string, isActive: boolean, actorId?: string, expectedVersion?: number): Promise<ConfigDTO> {
    const formattedKey = key.trim().toUpperCase();
    validateRegistryKey(formattedKey);

    const existing = await configRepository.findByKey(formattedKey);
    if (!existing) {
      throw new NotFoundError(`Configuration with key "${formattedKey}" not found.`);
    }

    const updated = await configRepository.updateStatus(formattedKey, isActive, actorId, expectedVersion);
    const dto = this.enrichDTO(updated);

    // Commit-First invalidation
    await configCacheService.invalidateKey(formattedKey, true);

    if (actorId) {
      await auditService.logEvent({
        actorId,
        action: isActive ? 'CONFIG_ACTIVATED' : 'CONFIG_DEACTIVATED',
        targetType: 'CONFIG',
        targetId: dto.id,
        details: { key: dto.key, isActive, version: dto.version }
      });
    }

    configTelemetryService.logEvent({
      event: isActive ? 'config.activated' : 'config.deactivated',
      key: dto.key,
      version: dto.version,
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
        providerName: 'Google Gemini LLM',
        purpose: 'Primary multi-modal LLM reasoning & fast path provider',
        configured: Boolean(env.server?.GEMINI_API_KEY || process.env.GEMINI_API_KEY),
        enabled: await this.getBoolean('GEMINI_ENABLED', true),
        connectionStatus: Boolean(env.server?.GEMINI_API_KEY || process.env.GEMINI_API_KEY) ? 'HEALTHY' : 'NOT_CONFIGURED',
        managedBy: 'ENVIRONMENT_SECRET_MANAGER'
      },
      {
        providerName: 'DeepSeek LLM',
        purpose: 'High-efficiency deep reasoning fallback provider',
        configured: Boolean(env.server?.DEEPSEEK_API_KEY || process.env.DEEPSEEK_API_KEY),
        enabled: await this.getBoolean('DEEPSEEK_ENABLED', true),
        connectionStatus: Boolean(env.server?.DEEPSEEK_API_KEY || process.env.DEEPSEEK_API_KEY) ? 'HEALTHY' : 'NOT_CONFIGURED',
        managedBy: 'ENVIRONMENT_SECRET_MANAGER'
      },
      {
        providerName: 'Groq LLM',
        purpose: 'Ultra-low-latency Llama-3.3 inference engine',
        configured: Boolean(env.server?.GROQ_API_KEY || process.env.GROQ_API_KEY),
        enabled: await this.getBoolean('GROQ_ENABLED', true),
        connectionStatus: Boolean(env.server?.GROQ_API_KEY || process.env.GROQ_API_KEY) ? 'HEALTHY' : 'NOT_CONFIGURED',
        managedBy: 'ENVIRONMENT_SECRET_MANAGER'
      },
      {
        providerName: 'ClickUp Integration',
        purpose: 'Automated ClickUp task suggestion & creation pipeline',
        configured: Boolean(env.server?.CLICKUP_CLIENT_ID && env.server?.CLICKUP_CLIENT_SECRET),
        enabled: await this.getBoolean('CLICKUP_ENABLED', true),
        connectionStatus: Boolean(env.server?.CLICKUP_CLIENT_ID && env.server?.CLICKUP_CLIENT_SECRET) ? 'HEALTHY' : 'NOT_CONFIGURED',
        managedBy: 'ENVIRONMENT_SECRET_MANAGER'
      },
      {
        providerName: 'Web Intelligence (Tavily)',
        purpose: 'Real-time agentic web retrieval & page synthesis',
        configured: Boolean(env.server?.TAVILY_API_KEY || process.env.TAVILY_API_KEY),
        enabled: await this.getBoolean('WEB_SEARCH_ENABLED', true),
        connectionStatus: Boolean(env.server?.TAVILY_API_KEY || process.env.TAVILY_API_KEY) ? 'HEALTHY' : 'NOT_CONFIGURED',
        managedBy: 'ENVIRONMENT_SECRET_MANAGER'
      }
    ];
  }
}

export const configService = new ConfigService();
