import { BreathingPreset, SoundscapeDefinition } from './chill-focus.types';

export const DEFAULT_BREATHING_PRESET: BreathingPreset = {
  name: 'Relaxed Breathing',
  inhaleSeconds: 4,
  holdSeconds: 2,
  exhaleSeconds: 6,
  restSeconds: 2
};

export const BREATHING_PRESETS: Record<string, BreathingPreset> = {
  RELAXED: DEFAULT_BREATHING_PRESET,
  FOCUS_BOX: {
    name: 'Box Breathing',
    inhaleSeconds: 4,
    holdSeconds: 4,
    exhaleSeconds: 4,
    restSeconds: 4
  }
};

export const SOUNDSCAPES: SoundscapeDefinition[] = [
  {
    id: 'night_sky',
    name: 'Night Sky',
    icon: '🌌',
    description: 'Calm ambient cosmic pads & night breeze',
    audioUrl: 'night_sky.mp3',
    loop: true,
    defaultVolume: 0.7
  },
  {
    id: 'ocean',
    name: 'Ocean',
    icon: '🌊',
    description: 'Gentle ocean waves washing ashore',
    audioUrl: 'ocean.mp3',
    loop: true,
    defaultVolume: 0.7
  },
  {
    id: 'rain',
    name: 'Rain',
    icon: '🌧️',
    description: 'Soft rainfall on a glass window',
    audioUrl: 'rain.mp3',
    loop: true,
    defaultVolume: 0.7
  },
  {
    id: 'forest',
    name: 'Forest',
    icon: '🌲',
    description: 'Peaceful woodland sounds and birdsong',
    audioUrl: 'forest.mp3',
    loop: true,
    defaultVolume: 0.7
  },
  {
    id: 'fireplace',
    name: 'Fireplace',
    icon: '🔥',
    description: 'Warm crackling log fire',
    audioUrl: 'fireplace.mp3',
    loop: true,
    defaultVolume: 0.7
  }
];

export const SOUNDSCAPE_MAP = new Map<string, SoundscapeDefinition>(
  SOUNDSCAPES.map((s) => [s.id, s])
);

export const DETERMINISTIC_FALLBACK_BREAK_MESSAGES = [
  "You've been studying for a while. Let's take a 5-minute break to relax and reset.",
  "Great study progress! A short 5-minute breathing break will help consolidate what you learned.",
  "Pause for a moment, relax your shoulders, and take a deep breath before continuing.",
  "Consider taking a quick break to stretch and rest your eyes."
];
