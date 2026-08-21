import { voiceTutorRepository } from './voice-tutor.repository';
import { voiceTutorContextService } from './voice-tutor.context.service';
import { voiceTutorTelemetryService } from './voice-tutor.telemetry.service';
import { STTProviderFactory } from './stt/speech-to-text.provider';
import { TTSProviderFactory } from './tts/text-to-speech.provider';
import { ALLOWED_AUDIO_MIME_TYPES } from './voice-tutor.constants';
import { AudioValidationError, SessionNotFoundError, UnauthorizedSessionError, VoiceTutorError } from './voice-tutor.errors';
import { VoiceTutorPipelineInput, VoiceTutorPipelineResult } from './voice-tutor.types';
import { llmGateway } from '@/features/llm/llm-gateway.service';
import { envConfig } from '@/config/env';
import { VoiceTutorRole, VoiceTutorSessionStatus } from '@prisma/client';

export class VoiceTutorService {
  /**
   * Validates incoming audio payload for size, duration, and MIME type
   */
  public validateAudioInput(audioBuffer: Buffer, mimeType: string): void {
    if (!audioBuffer || audioBuffer.length === 0) {
      throw new AudioValidationError('Audio payload is empty.');
    }

    const maxBytes = envConfig.voiceTutor.maxAudioBytes || 10485760;
    if (audioBuffer.length > maxBytes) {
      throw new AudioValidationError(`Audio payload exceeds max size limit of ${maxBytes} bytes.`);
    }

    const safeMime = mimeType || 'audio/webm';
    const parts = safeMime.split(';');
    const cleanMime = (parts[0] || 'audio/webm').trim().toLowerCase();
    const isAllowed = ALLOWED_AUDIO_MIME_TYPES.some((allowed) => {
      const sub = allowed.split('/')[1];
      return sub ? cleanMime.includes(sub) : false;
    });
    if (!isAllowed && cleanMime !== 'audio/webm' && cleanMime !== 'audio/wav' && cleanMime !== 'audio/ogg') {
      throw new AudioValidationError(`Unsupported audio MIME type: ${mimeType}. Allowed types: ${ALLOWED_AUDIO_MIME_TYPES.join(', ')}`);
    }
  }

  /**
   * Main Voice Tutor interaction pipeline:
   * Audio Buffer OR Text Input -> STT -> RAG/Context -> LLM Gateway -> TTS -> DB Record -> Output
   */
  public async processTurn(input: VoiceTutorPipelineInput): Promise<VoiceTutorPipelineResult> {
    const { sessionId, userId, audioBuffer, audioMimeType, textInput, clientRequestId } = input;

    // 1. Verify session exists & authorization
    const session = await voiceTutorRepository.findSessionById(sessionId);
    if (!session) {
      throw new SessionNotFoundError(sessionId);
    }
    if (session.userId !== userId) {
      throw new UnauthorizedSessionError();
    }
    if (session.status === VoiceTutorSessionStatus.COMPLETED || session.status === VoiceTutorSessionStatus.CANCELLED) {
      throw new VoiceTutorError('Cannot add messages to a completed or cancelled session.', 'SESSION_CLOSED', 400);
    }

    let userTranscript = '';
    let audioDurationMs = 2000;

    // 2. Process Audio STT if audio buffer is provided
    if (audioBuffer && audioBuffer.length > 0) {
      this.validateAudioInput(audioBuffer, audioMimeType || 'audio/webm');
      voiceTutorTelemetryService.logAudioUploaded(sessionId, userId, audioBuffer.length, audioMimeType || 'audio/webm');

      const sttProvider = STTProviderFactory.getProvider();
      const sttResult = await sttProvider.transcribe(audioBuffer, audioMimeType || 'audio/webm', {
        clientRequestId
      });

      userTranscript = sttResult.text;
      audioDurationMs = sttResult.durationMs;
      voiceTutorTelemetryService.logTranscriptionCompleted(sessionId, userId, sttResult.durationMs);
    } else if (textInput && textInput.trim().length > 0) {
      userTranscript = textInput.trim();
    } else {
      throw new AudioValidationError('Either valid audio payload or text input is required.');
    }

    // Save USER message to database
    const userMsgRecord = await voiceTutorRepository.addMessage({
      sessionId,
      role: VoiceTutorRole.USER,
      text: userTranscript,
      durationMs: audioDurationMs,
      metadata: { clientRequestId }
    });

    // 3. Assemble RAG / Knowledge Graph / Memory Context
    const assembledContext = await voiceTutorContextService.assembleContext({
      sessionId,
      userId,
      transcript: userTranscript,
      knowledgeBaseId: session.knowledgeBaseId,
      documentId: session.documentId
    });

    // 4. Invoke LLM Gateway (Gemini with Fallback)
    const startTime = Date.now();
    const llmResult = await llmGateway.generate({
      prompt: userTranscript,
      systemPrompt: assembledContext.systemPrompt,
      maxTokens: envConfig.voiceTutor.maxContextTokens || 1000,
      temperature: 0.3
    });

    const llmLatencyMs = Date.now() - startTime;
    voiceTutorTelemetryService.logLLMCompleted(
      sessionId,
      userId,
      llmLatencyMs,
      Boolean(assembledContext.ragContext?.isGrounded)
    );

    const tutorText = llmResult.text || 'I understood your query. Let us explore the key principles together.';

    // 5. Synthesize Audio via TTS Provider
    let ttsResultAudioBuffer: Buffer | undefined = undefined;
    let ttsMimeType: string | undefined = undefined;
    let ttsDurationMs: number = 3000;

    try {
      const ttsProvider = TTSProviderFactory.getProvider();
      const ttsResult = await ttsProvider.synthesize(tutorText, { clientRequestId });
      ttsResultAudioBuffer = ttsResult.audioBuffer;
      ttsMimeType = ttsResult.mimeType;
      ttsDurationMs = ttsResult.durationMs;
      voiceTutorTelemetryService.logTTSCompleted(sessionId, userId, ttsResult.durationMs);
    } catch (err) {
      console.warn('[VoiceTutorService] TTS synthesis failed, text answer remains available:', err);
    }

    // Save ASSISTANT response message to database
    const tutorMsgRecord = await voiceTutorRepository.addMessage({
      sessionId,
      role: VoiceTutorRole.ASSISTANT,
      text: tutorText,
      durationMs: ttsDurationMs,
      ragContext: assembledContext.ragContext,
      graphContext: assembledContext.graphContext,
      metadata: { llmLatencyMs, providerUsed: llmResult.provider }
    });

    // Update session duration
    const userMsgSec = Math.ceil(audioDurationMs / 1000);
    const tutorMsgSec = Math.ceil(ttsDurationMs / 1000);
    await voiceTutorRepository.updateSessionStatus(sessionId, VoiceTutorSessionStatus.ACTIVE, userMsgSec + tutorMsgSec);

    return {
      sessionId,
      userMessage: {
        id: userMsgRecord.id,
        sessionId,
        role: VoiceTutorRole.USER,
        text: userMsgRecord.text,
        durationMs: userMsgRecord.durationMs,
        createdAt: new Date(userMsgRecord.createdAt).toISOString()
      },
      tutorMessage: {
        id: tutorMsgRecord.id,
        sessionId,
        role: VoiceTutorRole.ASSISTANT,
        text: tutorMsgRecord.text,
        durationMs: tutorMsgRecord.durationMs,
        ragContext: tutorMsgRecord.ragContext,
        graphContext: tutorMsgRecord.graphContext,
        createdAt: new Date(tutorMsgRecord.createdAt).toISOString()
      },
      audioBuffer: ttsResultAudioBuffer,
      audioMimeType: ttsMimeType,
      ragContextUsed: Boolean(assembledContext.ragContext?.isGrounded),
      graphContextUsed: Boolean(assembledContext.graphContext?.entities?.length)
    };
  }
}

export const voiceTutorService = new VoiceTutorService();
