export type VoiceState =
  | 'IDLE'
  | 'STARTING'
  | 'LISTENING'
  | 'STOPPING'
  | 'ERROR'
  | 'UNSUPPORTED';

export type VoiceErrorCode =
  | 'NOT_SUPPORTED'
  | 'PERMISSION_DENIED'
  | 'NO_MICROPHONE'
  | 'NETWORK_ERROR'
  | 'NO_SPEECH'
  | 'ABORTED'
  | 'UNKNOWN';

export interface VoiceError {
  code: VoiceErrorCode;
  message: string;
  originalError?: any;
}

export interface SpeechToTextConfig {
  locale?: string;
  continuous?: boolean;
  interimResults?: boolean;
}

export interface VoiceLanguageOption {
  label: string;
  value: string; // e.g. 'en-US'
  code: string;  // e.g. 'en'
}

export const SUPPORTED_VOICE_LANGUAGES: VoiceLanguageOption[] = [
  { label: 'English (US)', value: 'en-US', code: 'en' },
  { label: 'Hindi (भारत)', value: 'hi-IN', code: 'hi' },
  { label: 'Gujarati (ગુજરાત)', value: 'gu-IN', code: 'gu' }
];
