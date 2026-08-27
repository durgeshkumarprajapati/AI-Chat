import { prisma } from '@/lib/prisma';
import { ConfigCategory } from '@prisma/client';
import { CreateConfigInput, UpdateConfigInput } from './config.types';
import { ConflictError } from '@/errors';

export class ConfigRepository {
  public async findByKey(key: string) {
    return prisma.config.findUnique({
      where: { key }
    });
  }

  public async findAllActive() {
    return prisma.config.findMany({
      where: { isActive: true },
      orderBy: { key: 'asc' }
    });
  }

  public async findAll(opts?: { category?: ConfigCategory; isActive?: boolean }) {
    return prisma.config.findMany({
      where: {
        ...(opts?.category ? { category: opts.category } : {}),
        ...(opts?.isActive !== undefined ? { isActive: opts.isActive } : {})
      },
      orderBy: { key: 'asc' }
    });
  }

  public async findByCategory(category: ConfigCategory) {
    return prisma.config.findMany({
      where: { category, isActive: true },
      orderBy: { key: 'asc' }
    });
  }

  public async create(input: CreateConfigInput) {
    return prisma.config.create({
      data: {
        key: input.key,
        value: input.value,
        valueType: input.valueType,
        category: input.category,
        purpose: input.purpose,
        description: input.description || null,
        isActive: input.isActive ?? true,
        isSystem: input.isSystem ?? false,
        version: 1,
        createdBy: input.actorId || null,
        updatedBy: input.actorId || null
      }
    });
  }

  public async update(key: string, input: UpdateConfigInput) {
    // Perform Optimistic Concurrency Check if expectedVersion is supplied
    const existing = await prisma.config.findUnique({ where: { key } });
    if (!existing) {
      throw new Error(`Configuration with key "${key}" not found.`);
    }

    if (input.expectedVersion !== undefined && existing.version !== input.expectedVersion) {
      throw new ConflictError(
        `Optimistic Concurrency Conflict for configuration "${key}". Expected version ${input.expectedVersion}, but current database version is ${existing.version}. Please refresh latest settings and try again.`
      );
    }

    return prisma.config.update({
      where: { key },
      data: {
        ...(input.value !== undefined ? { value: input.value } : {}),
        ...(input.valueType ? { valueType: input.valueType } : {}),
        ...(input.category ? { category: input.category } : {}),
        ...(input.purpose ? { purpose: input.purpose } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        version: { increment: 1 },
        ...(input.actorId ? { updatedBy: input.actorId } : {})
      }
    });
  }

  public async updateStatus(key: string, isActive: boolean, actorId?: string, expectedVersion?: number) {
    const existing = await prisma.config.findUnique({ where: { key } });
    if (!existing) {
      throw new Error(`Configuration with key "${key}" not found.`);
    }

    if (expectedVersion !== undefined && existing.version !== expectedVersion) {
      throw new ConflictError(
        `Optimistic Concurrency Conflict for configuration "${key}". Expected version ${expectedVersion}, but current database version is ${existing.version}.`
      );
    }

    return prisma.config.update({
      where: { key },
      data: {
        isActive,
        version: { increment: 1 },
        ...(actorId ? { updatedBy: actorId } : {})
      }
    });
  }
}

export const configRepository = new ConfigRepository();
