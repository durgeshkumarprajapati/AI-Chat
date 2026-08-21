import { z } from 'zod';
import { SOUNDSCAPE_MAP } from './chill-focus.constants';

export const createSessionSchema = z.object({
  mode: z.enum(['CHILL', 'FOCUS']).optional().default('CHILL'),
  plannedDurationSeconds: z.coerce.number().int().min(60).max(7200).optional().default(300),
  soundscape: z
    .string()
    .refine((val) => SOUNDSCAPE_MAP.has(val.toLowerCase()), {
      message: 'Invalid soundscape ID. Must be one of the supported soundscape presets.'
    })
    .optional()
    .default('night_sky')
});

export const updatePreferencesSchema = z.object({
  preferredMode: z.enum(['CHILL', 'FOCUS']).optional(),
  preferredSoundscape: z
    .string()
    .refine((val) => SOUNDSCAPE_MAP.has(val.toLowerCase()), {
      message: 'Invalid soundscape ID.'
    })
    .optional(),
  preferredVolume: z.coerce.number().min(0).max(1).optional(),
  breathingEnabled: z.coerce.boolean().optional(),
  interventionEnabled: z.coerce.boolean().optional(),
  reducedMotion: z.coerce.boolean().optional()
});
