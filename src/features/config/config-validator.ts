import { ValidationError, SecurityError } from '@/errors';
import { ConfigValueType, ConfigCategory } from '@prisma/client';
import { SECRET_KEY_PATTERNS } from './config.constants';

export class ConfigValidator {
  /**
   * Enforces secret isolation: Rejects any attempt to store API keys, secrets, passwords, or tokens in the Config database table.
   */
  public assertNotSecretKey(key: string, value?: string): void {
    if (SECRET_KEY_PATTERNS.some((pattern) => pattern.test(key))) {
      throw new SecurityError(`Configuration key "${key}" contains sensitive secret patterns. Environment secrets MUST remain in environment variables (.env) and cannot be stored in the database Config table.`);
    }

    if (value && SECRET_KEY_PATTERNS.some((pattern) => pattern.test(value))) {
      throw new SecurityError(`Configuration value for key "${key}" appears to contain secret data. Secrets MUST remain in environment variables.`);
    }
  }

  /**
   * Validates key format, purpose presence, and value type compatibility.
   */
  public validateInput(input: {
    key?: string;
    value?: string;
    valueType?: ConfigValueType;
    category?: ConfigCategory;
    purpose?: string;
  }): void {
    if (input.key !== undefined) {
      if (!input.key || !input.key.trim()) {
        throw new ValidationError('Configuration key cannot be empty.');
      }
      const formattedKey = input.key.trim().toUpperCase();
      if (!/^[A-Z0-9_]+$/.test(formattedKey)) {
        throw new ValidationError('Configuration key must contain only uppercase alphanumeric characters and underscores.');
      }
      this.assertNotSecretKey(formattedKey, input.value);
    }

    if (input.purpose !== undefined && (!input.purpose || !input.purpose.trim())) {
      throw new ValidationError('Configuration purpose is mandatory to explain what the setting is used for.');
    }

    if (input.value !== undefined && input.valueType !== undefined) {
      this.validateValueSyntax(input.value, input.valueType);
    }
  }

  /**
   * Validates typed value syntax for NUMBER, BOOLEAN, JSON, and ARRAY types.
   */
  public validateValueSyntax(value: string, valueType: ConfigValueType): void {
    if (valueType === 'NUMBER') {
      const num = Number(value);
      if (isNaN(num)) {
        throw new ValidationError(`Configuration value "${value}" is not a valid number.`);
      }
    } else if (valueType === 'BOOLEAN') {
      const lower = value.trim().toLowerCase();
      if (lower !== 'true' && lower !== 'false') {
        throw new ValidationError(`Configuration value "${value}" must be "true" or "false".`);
      }
    } else if (valueType === 'JSON' || valueType === 'ARRAY') {
      try {
        const parsed = JSON.parse(value);
        if (valueType === 'ARRAY' && !Array.isArray(parsed)) {
          throw new ValidationError(`Configuration value "${value}" is not a valid JSON array.`);
        }
      } catch (err) {
        if (err instanceof ValidationError) throw err;
        throw new ValidationError(`Configuration value "${value}" is not valid JSON syntax.`);
      }
    }
  }
}

export const configValidator = new ConfigValidator();
