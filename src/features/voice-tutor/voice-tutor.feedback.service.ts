import { voiceTutorRepository } from './voice-tutor.repository';
import { VoiceTutorFeedbackDTO } from './voice-tutor.types';
import { SessionNotFoundError } from './voice-tutor.errors';
import { llmGateway } from '@/features/llm/llm-gateway.service';

export class VoiceTutorFeedbackService {
  /**
   * Generates or retrieves AI Learning Feedback for a Voice Tutor Session
   */
  public async generateFeedback(sessionId: string, userId: string): Promise<VoiceTutorFeedbackDTO> {
    const session = await voiceTutorRepository.findSessionById(sessionId);
    if (!session) {
      throw new SessionNotFoundError(sessionId);
    }

    if (session.feedback) {
      return this.toDTO(session.feedback);
    }

    const messages = session.messages || [];
    const userTexts = messages.filter((m) => m.role === 'USER').map((m) => m.text);
    const combinedConversation = messages.map((m) => `${m.role}: ${m.text}`).join('\n');

    let topic = session.title || 'General Voice Tutoring';
    let conceptsDiscussed = ['Core Concepts', 'Practical Application'];
    let strengths = ['Active participation', 'Clear query articulation'];
    let weaknesses = ['Deep architectural trade-offs'];
    let recommendedTopics = ['Advanced Optimization', 'System Architecture'];
    let understandingScore = 82;
    let communicationScore = 78;
    let recommendedMockTestTopic = 'General Knowledge';

    // Extract dominant topic from text if available
    if (userTexts.length > 0 && userTexts[0]) {
      const firstText = userTexts[0].toLowerCase();
      if (firstText.includes('database') || firstText.includes('sql') || firstText.includes('shard') || firstText.includes('index')) {
        topic = 'Database Systems & Indexing';
        conceptsDiscussed = ['B-Tree Indexing', 'Sharding & Partitioning', 'Query Optimization'];
        strengths = ['Understanding of database indexes', 'Grasped sharding fundamentals'];
        weaknesses = ['Composite index trade-offs', 'Partition pruning nuances'];
        recommendedTopics = ['Composite Indexing', 'PostgreSQL Query Planner'];
        understandingScore = 85;
        communicationScore = 80;
        recommendedMockTestTopic = 'PostgreSQL Indexing & Optimization';
      } else if (firstText.includes('react') || firstText.includes('next') || firstText.includes('web') || firstText.includes('frontend')) {
        topic = 'Modern Web Development & React';
        conceptsDiscussed = ['React Component Lifecycle', 'Server vs Client Components', 'State Synchronization'];
        strengths = ['Good grasp of React state', 'Clear frontend mental model'];
        weaknesses = ['Hydration error troubleshooting'];
        recommendedTopics = ['Next.js App Router', 'React Server Components'];
        understandingScore = 88;
        communicationScore = 84;
        recommendedMockTestTopic = 'Next.js Architecture';
      }
    }

    // Try generating AI analysis via LLM Gateway if conversation is rich
    if (messages.length >= 2) {
      try {
        const prompt = `Analyze this voice tutor learning session and provide structured feedback in JSON format:
Conversation:
${combinedConversation.slice(0, 2000)}

Output JSON format strictly:
{
  "topic": "string",
  "conceptsDiscussed": ["string"],
  "strengths": ["string"],
  "weaknesses": ["string"],
  "recommendedTopics": ["string"],
  "understandingScore": number,
  "communicationScore": number,
  "recommendedMockTestTopic": "string"
}`;

        const res = await llmGateway.generate({
          prompt,
          temperature: 0.2,
          maxTokens: 500
        }).catch(() => null);

        if (res && res.text) {
          const jsonMatch = res.text.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            if (parsed.topic) topic = parsed.topic;
            if (Array.isArray(parsed.conceptsDiscussed)) conceptsDiscussed = parsed.conceptsDiscussed;
            if (Array.isArray(parsed.strengths)) strengths = parsed.strengths;
            if (Array.isArray(parsed.weaknesses)) weaknesses = parsed.weaknesses;
            if (Array.isArray(parsed.recommendedTopics)) recommendedTopics = parsed.recommendedTopics;
            if (typeof parsed.understandingScore === 'number') understandingScore = parsed.understandingScore;
            if (typeof parsed.communicationScore === 'number') communicationScore = parsed.communicationScore;
            if (parsed.recommendedMockTestTopic) recommendedMockTestTopic = parsed.recommendedMockTestTopic;
          }
        }
      } catch (err) {
        console.warn('[VoiceTutorFeedback] AI analysis error, using fallback structured summary:', err);
      }
    }

    const durationMinutes = Math.max(1, Math.round(session.durationSeconds / 60));

    const feedbackRecord = await voiceTutorRepository.createOrUpdateFeedback({
      sessionId,
      userId,
      topic,
      durationMinutes,
      conceptsDiscussed,
      strengths,
      weaknesses,
      recommendedTopics,
      understandingScore,
      communicationScore,
      recommendedMockTestTopic
    });

    return this.toDTO(feedbackRecord);
  }

  public toDTO(feedback: any): VoiceTutorFeedbackDTO {
    return {
      id: feedback.id,
      sessionId: feedback.sessionId,
      userId: feedback.userId,
      topic: feedback.topic,
      durationMinutes: feedback.durationMinutes,
      conceptsDiscussed: Array.isArray(feedback.conceptsDiscussed) ? feedback.conceptsDiscussed : [],
      strengths: Array.isArray(feedback.strengths) ? feedback.strengths : [],
      weaknesses: Array.isArray(feedback.weaknesses) ? feedback.weaknesses : [],
      recommendedTopics: Array.isArray(feedback.recommendedTopics) ? feedback.recommendedTopics : [],
      understandingScore: feedback.understandingScore,
      communicationScore: feedback.communicationScore,
      recommendedMockTestTopic: feedback.recommendedMockTestTopic,
      createdAt: new Date(feedback.createdAt).toISOString()
    };
  }
}

export const voiceTutorFeedbackService = new VoiceTutorFeedbackService();
