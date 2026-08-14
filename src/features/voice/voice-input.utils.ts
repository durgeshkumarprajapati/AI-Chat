import { VoiceState, VoiceError } from './voice.types';

export function getVoiceStateLabel(state: VoiceState): string {
  switch (state) {
    case 'STARTING':
      return 'Initializing microphone...';
    case 'LISTENING':
      return 'Listening... Speak now';
    case 'STOPPING':
      return 'Stopping voice input...';
    case 'ERROR':
      return 'Voice error';
    case 'UNSUPPORTED':
      return 'Voice input unsupported in this browser';
    case 'IDLE':
    default:
      return 'Voice Input';
  }
}

export function getFriendlyVoiceErrorMessage(error: VoiceError | null): string {
  if (!error) return '';
  switch (error.code) {
    case 'PERMISSION_DENIED':
      return 'Microphone permission is required to use voice input.';
    case 'NOT_SUPPORTED':
      return "Voice input isn't supported in this browser.";
    case 'NO_MICROPHONE':
      return 'No microphone was detected on your device.';
    case 'NETWORK_ERROR':
      return 'Network error during speech recognition.';
    case 'NO_SPEECH':
      return 'No speech detected. Please try speaking again.';
    case 'ABORTED':
      return 'Voice recognition stopped.';
    case 'UNKNOWN':
    default:
      return error.message || 'An error occurred during voice input.';
  }
}
