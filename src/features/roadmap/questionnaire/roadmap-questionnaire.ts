import {
  ALLOWED_GOALS,
  ALLOWED_EXPERIENCE_LEVELS,
  ALLOWED_DAILY_TIMES,
  ALLOWED_DURATIONS,
  ALLOWED_LEARNING_STYLES
} from '../roadmap.constants';
import { ROADMAP_CATALOG } from '../catalog/roadmap-catalog';

export interface QuestionOption {
  value: string;
  label: string;
  description?: string;
  icon?: string;
}

export interface QuestionDefinition {
  id: string;
  key: string;
  title: string;
  subtitle: string;
  type: 'SELECT' | 'CHOICE_CARDS' | 'NUMBER_SLIDER' | 'TEXT_OPTIONAL';
  required: boolean;
  options: QuestionOption[];
  conditional?: {
    dependsOnKey: string;
    showIfValue: string;
  };
}

export const QUESTIONNAIRE_STEPS: QuestionDefinition[] = [
  {
    id: 'step-1-goal',
    key: 'goal',
    title: 'What is your primary goal?',
    subtitle: 'Select what you want to achieve with this learning roadmap.',
    type: 'CHOICE_CARDS',
    required: true,
    options: ALLOWED_GOALS.map((g) => ({
      value: g,
      label: g,
      icon: g.includes('Technology') ? '💻' : g.includes('Interview') ? '🎯' : g.includes('Project') ? '🚀' : g.includes('Career') ? '🔄' : '📈'
    }))
  },
  {
    id: 'step-2-targetSkill',
    key: 'targetSkill',
    title: 'What technology or skill do you want to learn?',
    subtitle: 'Choose from our curated catalog or enter your target topic.',
    type: 'SELECT',
    required: true,
    options: [
      ...ROADMAP_CATALOG.map((c) => ({
        value: c.name,
        label: `${c.name} (${c.category})`,
        description: c.description,
        icon: '📚'
      })),
      { value: 'Full-Stack Web Development', label: 'Full-Stack Web Development (Node, React, SQL)', icon: '⚡' },
      { value: 'Data Engineering & Analytics', label: 'Data Engineering & Analytics (Python, SQL, Spark)', icon: '📊' },
      { value: 'DevOps & Cloud Engineering', label: 'DevOps & Cloud Engineering (Docker, K8s, AWS)', icon: '☁️' }
    ]
  },
  {
    id: 'step-3-experienceLevel',
    key: 'experienceLevel',
    title: 'What is your current experience level?',
    subtitle: 'This helps us tune the complexity and pace of tasks.',
    type: 'CHOICE_CARDS',
    required: true,
    options: ALLOWED_EXPERIENCE_LEVELS.map((lvl) => ({
      value: lvl,
      label: lvl,
      description: lvl === 'Beginner' ? 'Little to no prior experience' : lvl === 'Intermediate' ? 'Familiar with fundamentals' : 'Looking to master advanced topics & system design',
      icon: lvl === 'Beginner' ? '🌱' : lvl === 'Intermediate' ? '🚀' : '🏆'
    }))
  },
  {
    id: 'step-4-dailyTimeCommitment',
    key: 'dailyTimeCommitment',
    title: 'How much time can you dedicate daily?',
    subtitle: 'We will budget task estimates according to your schedule.',
    type: 'CHOICE_CARDS',
    required: true,
    options: ALLOWED_DAILY_TIMES.map((t) => ({
      value: t,
      label: t,
      icon: '⏱️'
    }))
  },
  {
    id: 'step-5-targetDurationWeeks',
    key: 'targetDurationWeeks',
    title: 'Preferred roadmap duration?',
    subtitle: 'Select how many weeks you want the structured roadmap to span.',
    type: 'CHOICE_CARDS',
    required: true,
    options: ALLOWED_DURATIONS.map((weeks) => ({
      value: String(weeks),
      label: `${weeks} Weeks ${weeks === 52 ? '(1 Year)' : ''}`,
      icon: '📅'
    }))
  },
  {
    id: 'step-6-learningStyle',
    key: 'learningStyle',
    title: 'Preferred learning style?',
    subtitle: 'Choose whether you prefer hands-on building or theory first.',
    type: 'CHOICE_CARDS',
    required: true,
    options: ALLOWED_LEARNING_STYLES.map((style) => ({
      value: style,
      label: style,
      icon: style.includes('Project') ? '🔨' : style.includes('Theory') ? '📖' : style.includes('Practice') ? '⚡' : '⚖️'
    }))
  },
  {
    id: 'step-7-conditional-interview',
    key: 'interviewTargetRole',
    title: 'Target Role for Interview Preparation',
    subtitle: 'Specify the job title or role you are aiming for.',
    type: 'TEXT_OPTIONAL',
    required: false,
    options: [],
    conditional: {
      dependsOnKey: 'goal',
      showIfValue: 'Prepare for an Interview'
    }
  },
  {
    id: 'step-7-conditional-certification',
    key: 'certificationType',
    title: 'Certification Target',
    subtitle: 'Specify the certification exam you plan to take.',
    type: 'TEXT_OPTIONAL',
    required: false,
    options: [],
    conditional: {
      dependsOnKey: 'goal',
      showIfValue: 'Prepare for Certification'
    }
  }
];
