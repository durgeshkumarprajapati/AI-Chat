import { PredefinedQuestionItem } from './city-explorer.types';

export const PROMPT_VERSION = 'v1.0';

export interface CategoryDefinition {
  category: string;
  icon: string;
  description: string;
  questions: {
    id: string;
    template: (_city: string) => string;
    kind: 'STATIC' | 'DYNAMIC';
    isWeather?: boolean;
  }[];
}

export const CITY_EXPLORER_CATEGORIES: CategoryDefinition[] = [
  {
    category: 'About the City',
    icon: '📍',
    description: 'Overview, facts, geography, and general information about the city.',
    questions: [
      { id: 'about-city-overview', template: (c) => `Tell me about ${c}.`, kind: 'STATIC' },
      { id: 'about-city-famous', template: (c) => `What is ${c} famous for?`, kind: 'STATIC' },
      { id: 'about-city-history', template: (c) => `What is the history of ${c}?`, kind: 'STATIC' },
      { id: 'about-city-visiting-tips', template: (c) => `What should I know before visiting ${c}?`, kind: 'STATIC' }
    ]
  },
  {
    category: 'Places to Visit',
    icon: '🏛',
    description: 'Top tourist attractions, monuments, parks, and landmarks.',
    questions: [
      { id: 'places-most-visited', template: (c) => `What are the most visited places in ${c}?`, kind: 'STATIC' },
      { id: 'places-best-spots', template: (c) => `What are the best places to visit in ${c}?`, kind: 'STATIC' },
      { id: 'places-hidden-gems', template: (c) => `What are some hidden gems in ${c}?`, kind: 'STATIC' },
      { id: 'places-historic-monuments', template: (c) => `What are top historic monuments in ${c}?`, kind: 'STATIC' }
    ]
  },
  {
    category: 'Food & Cuisine',
    icon: '🍛',
    description: 'Famous local street food, traditional dishes, and dining hotspots.',
    questions: [
      { id: 'food-famous-dishes', template: (c) => `What food is ${c} famous for?`, kind: 'STATIC' },
      { id: 'food-popular-restaurants', template: (c) => `What are popular restaurants and street food in ${c}?`, kind: 'DYNAMIC' },
      { id: 'food-traditional-must-try', template: (c) => `What traditional dishes must I try in ${c}?`, kind: 'STATIC' },
      { id: 'food-best-local-snacks', template: (c) => `Where can I find the best local snacks in ${c}?`, kind: 'DYNAMIC' }
    ]
  },
  {
    category: 'Local Language',
    icon: '🗣',
    description: 'Native languages, dialects, and essential conversational phrases.',
    questions: [
      { id: 'lang-spoken', template: (c) => `What language is spoken in ${c}?`, kind: 'STATIC' },
      { id: 'lang-useful-phrases', template: (c) => `Teach me some useful local phrases for ${c}.`, kind: 'STATIC' },
      { id: 'lang-greetings', template: (c) => `How do locals greet each other in ${c}?`, kind: 'STATIC' },
      { id: 'lang-common-words', template: (c) => `What are common words used in daily conversation in ${c}?`, kind: 'STATIC' }
    ]
  },
  {
    category: 'Culture & Traditions',
    icon: '🎭',
    description: 'Festivals, art forms, music, heritage, and community traditions.',
    questions: [
      { id: 'culture-traditions', template: (c) => `What are the cultural traditions of ${c}?`, kind: 'STATIC' },
      { id: 'culture-festivals', template: (c) => `What major festivals are celebrated in ${c}?`, kind: 'DYNAMIC' },
      { id: 'culture-art-music', template: (c) => `Tell me about the art and music scene in ${c}.`, kind: 'STATIC' },
      { id: 'culture-heritage', template: (c) => `What is unique about the heritage of ${c}?`, kind: 'STATIC' }
    ]
  },
  {
    category: 'Shopping & Markets',
    icon: '🛍',
    description: 'Bazaars, handicraft markets, shopping hubs, and souvenirs.',
    questions: [
      { id: 'shopping-best-markets', template: (c) => `What are the best markets and shopping areas in ${c}?`, kind: 'DYNAMIC' },
      { id: 'shopping-handicrafts', template: (c) => `What handicrafts or items should I buy in ${c}?`, kind: 'STATIC' },
      { id: 'shopping-traditional-streets', template: (c) => `Where are popular traditional shopping streets in ${c}?`, kind: 'DYNAMIC' }
    ]
  },
  {
    category: 'Getting Around',
    icon: '🚆',
    description: 'Public transportation, cabs, buses, and travel navigation.',
    questions: [
      { id: 'transit-public-system', template: (c) => `How is the public transportation system in ${c}?`, kind: 'DYNAMIC' },
      { id: 'transit-best-way', template: (c) => `What is the best way to travel around ${c}?`, kind: 'DYNAMIC' },
      { id: 'transit-cabs-autos', template: (c) => `Are auto-rickshaws and cabs easily available in ${c}?`, kind: 'DYNAMIC' }
    ]
  },
  {
    category: 'Travel & Weather',
    icon: '🌤',
    description: 'Best time to visit, weather patterns, and essential travel tips.',
    questions: [
      { id: 'travel-best-time', template: (c) => `What is the best time of year to visit ${c}?`, kind: 'STATIC' },
      { id: 'travel-weather-today', template: (c) => `What is the weather usually like in ${c}?`, kind: 'DYNAMIC', isWeather: true },
      { id: 'travel-safety-tips', template: (c) => `What safety and travel tips should visitors keep in mind in ${c}?`, kind: 'STATIC' }
    ]
  }
];

export function getPredefinedQuestionsForCity(city: string): PredefinedQuestionItem[] {
  const normalizedCity = city.trim();
  const items: PredefinedQuestionItem[] = [];

  for (const cat of CITY_EXPLORER_CATEGORIES) {
    for (const q of cat.questions) {
      items.push({
        id: q.id,
        category: cat.category,
        categoryIcon: cat.icon,
        question: q.template(normalizedCity),
        kind: q.kind,
        description: cat.description,
        isWeather: q.isWeather
      });
    }
  }

  return items;
}

export function findQuestionById(id: string, city: string): PredefinedQuestionItem | null {
  const all = getPredefinedQuestionsForCity(city);
  return all.find((q) => q.id === id) || null;
}
