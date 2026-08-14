import { QuestionnaireAnswers, GeneratedRoadmapPlan, GeneratedPhase } from '../roadmap.types';
import { getCatalogSkill } from '../catalog/roadmap-catalog';
import { getLLMProvider } from '@/features/rag/llm/llm.provider.factory';
import { roadmapValidatorService } from './roadmap-validator.service';
import { roadmapResourceService } from '../resources/roadmap-resource.service';

export class RoadmapPlannerService {
  /**
   * Generates a structured roadmap plan combining questionnaire rules, curated catalog baselines, and AI personalization.
   */
  async planRoadmap(answers: QuestionnaireAnswers): Promise<GeneratedRoadmapPlan> {
    const catalogItem = getCatalogSkill(answers.targetSkill);

    // Build baseline phases if catalog match exists
    const baselinePhases: GeneratedPhase[] = [];
    if (catalogItem) {
      for (const p of catalogItem.defaultPhases) {
        baselinePhases.push({
          title: p.title,
          description: p.description,
          durationWeeks: Math.max(1, Math.round(answers.targetDurationWeeks / catalogItem.defaultPhases.length)),
          tasks: p.topics.map((topic) => ({
            title: topic,
            description: `Master ${topic} with practical exercises and core concepts.`,
            estimatedHours: answers.dailyTimeCommitment.includes('30 min') ? 1 : answers.dailyTimeCommitment.includes('1 hour') ? 2 : 4
          }))
        });
      }
    }

    const systemPrompt = `You are a Senior Engineering Mentor and Curriculum Architect.
Generate a structured, highly personalized learning roadmap in valid JSON format.
Your JSON output MUST match this exact schema:
{
  "title": "Short descriptive roadmap title",
  "description": "Comprehensive overview of the roadmap goals and expectations",
  "targetSkill": "Target skill/technology",
  "phases": [
    {
      "title": "Phase 1 title",
      "description": "Phase 1 description",
      "durationWeeks": 2,
      "tasks": [
        {
          "title": "Task title",
          "description": "Detailed actionable task instructions",
          "estimatedHours": 3
        }
      ]
    }
  ]
}

DO NOT include markdown backticks or extra explanatory text outside the JSON object.
Return ONLY valid JSON.`;

    const userPrompt = `Generate a personalized learning roadmap based on these validated requirements:
- Primary Goal: ${answers.goal}
- Target Skill/Technology: ${answers.targetSkill}
- Current Experience Level: ${answers.experienceLevel}
- Daily Time Commitment: ${answers.dailyTimeCommitment}
- Target Roadmap Duration: ${answers.targetDurationWeeks} Weeks
- Preferred Learning Style: ${answers.learningStyle}
${answers.interviewTargetRole ? `- Interview Role Target: ${answers.interviewTargetRole}` : ''}
${answers.certificationType ? `- Certification Target: ${answers.certificationType}` : ''}
${answers.additionalContext ? `- Additional Context: ${answers.additionalContext}` : ''}

${baselinePhases.length > 0 ? `Curated Baseline Reference Structure: ${JSON.stringify(baselinePhases, null, 2)}` : ''}

Structure the roadmap into ${Math.min(6, Math.max(2, Math.round(answers.targetDurationWeeks / 2)))} logical phases spanning exactly ${answers.targetDurationWeeks} weeks in total.
Make tasks practical, sequential, and tailored to the ${answers.learningStyle} learning style.`;

    try {
      const llm = getLLMProvider();
      const rawText = await llm.generateAnswer({
        question: userPrompt,
        context: systemPrompt
      });

      const cleanedJson = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleanedJson);

      const plan = roadmapValidatorService.validateAndNormalizePlan(parsed, answers.targetDurationWeeks);

      // Enhance tasks with web resource recommendations
      for (const phase of plan.phases) {
        for (const task of phase.tasks) {
          const resources = await roadmapResourceService.getResourcesForSkill(answers.targetSkill, task.title);
          task.resources = resources;
        }
      }

      return plan;
    } catch {
      // Deterministic Fallback if AI generation or parsing fails
      return this.buildDeterministicFallbackPlan(answers, baselinePhases);
    }
  }

  /**
   * Generates a robust deterministic fallback plan when LLM is unavailable or times out.
   */
  private async buildDeterministicFallbackPlan(
    answers: QuestionnaireAnswers,
    baselinePhases: GeneratedPhase[]
  ): Promise<GeneratedRoadmapPlan> {
    const fallbackTitle = `${answers.targetSkill} ${answers.goal} Roadmap`;
    const fallbackDesc = `A personalized ${answers.targetDurationWeeks}-week roadmap to master ${answers.targetSkill} for ${answers.goal} (${answers.experienceLevel} level, ${answers.learningStyle}).`;

    let phases = baselinePhases;
    if (phases.length === 0) {
      phases = [
        {
          title: `Phase 1 — ${answers.targetSkill} Fundamentals`,
          description: `Core concepts, syntax, and foundational knowledge of ${answers.targetSkill}.`,
          durationWeeks: Math.max(1, Math.floor(answers.targetDurationWeeks / 2)),
          tasks: [
            {
              title: `${answers.targetSkill} Core Environment & Syntax`,
              description: `Set up tools, IDE, dependencies, and understand basic syntax of ${answers.targetSkill}.`,
              estimatedHours: 4
            },
            {
              title: 'Key Concepts & Data Structures',
              description: 'Learn primary abstractions, state management, and standard libraries.',
              estimatedHours: 6
            }
          ]
        },
        {
          title: `Phase 2 — Advanced ${answers.targetSkill} & Practical Application`,
          description: `Hands-on practice, application architecture, and real-world project development for ${answers.targetSkill}.`,
          durationWeeks: Math.max(1, Math.ceil(answers.targetDurationWeeks / 2)),
          tasks: [
            {
              title: 'Hands-on Implementation Project',
              description: `Build a complete application or feature applying ${answers.targetSkill} patterns.`,
              estimatedHours: 8
            },
            {
              title: 'Best Practices, Testing & Deployment',
              description: 'Write tests, review performance, implement security patterns, and prepare for production.',
              estimatedHours: 6
            }
          ]
        }
      ];
    }

    // Attach resource recommendations
    for (const phase of phases) {
      for (const task of phase.tasks) {
        task.resources = await roadmapResourceService.getResourcesForSkill(answers.targetSkill, task.title);
      }
    }

    return {
      title: fallbackTitle,
      description: fallbackDesc,
      targetSkill: answers.targetSkill,
      targetDurationWeeks: answers.targetDurationWeeks,
      phases
    };
  }

  /**
   * Regenerates a single phase of an existing roadmap cleanly.
   */
  async regeneratePhase(
    answers: QuestionnaireAnswers,
    existingPhase: { title: string; description: string; durationWeeks: number }
  ): Promise<GeneratedPhase> {
    const prompt = `Regenerate phase "${existingPhase.title}" for ${answers.targetSkill} roadmap (${answers.experienceLevel} level, ${answers.learningStyle}).
Return JSON:
{
  "title": "${existingPhase.title}",
  "description": "Updated phase description",
  "durationWeeks": ${existingPhase.durationWeeks},
  "tasks": [
    {
      "title": "Task title",
      "description": "Task description",
      "estimatedHours": 3
    }
  ]
}`;

    try {
      const llm = getLLMProvider();
      const rawText = await llm.generateAnswer({
        question: prompt,
        context: 'You are a Senior Technical Mentor. Output ONLY valid JSON.'
      });

      const cleaned = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleaned);

      const tasks: GeneratedPhase['tasks'] = Array.isArray(parsed.tasks) && parsed.tasks.length > 0
        ? parsed.tasks.map((t: any) => ({
            title: String(t.title || 'Task').trim(),
            description: String(t.description || 'Description').trim(),
            estimatedHours: Math.max(1, Number(t.estimatedHours) || 2)
          }))
        : [
            {
              title: `${existingPhase.title} Deep Dive`,
              description: `In-depth practice for ${existingPhase.title}`,
              estimatedHours: 4
            }
          ];

      for (const task of tasks) {
        task.resources = await roadmapResourceService.getResourcesForSkill(answers.targetSkill, task.title);
      }

      return {
        title: String(parsed.title || existingPhase.title).trim(),
        description: String(parsed.description || existingPhase.description).trim(),
        durationWeeks: existingPhase.durationWeeks,
        tasks
      };
    } catch {
      return {
        title: `${existingPhase.title} (Refreshed)`,
        description: existingPhase.description,
        durationWeeks: existingPhase.durationWeeks,
        tasks: [
          {
            title: `${existingPhase.title} Hands-on Practice`,
            description: `Practical exercises and implementation for ${existingPhase.title}`,
            estimatedHours: 4,
            resources: await roadmapResourceService.getResourcesForSkill(answers.targetSkill, existingPhase.title)
          }
        ]
      };
    }
  }
}

export const roadmapPlannerService = new RoadmapPlannerService();
