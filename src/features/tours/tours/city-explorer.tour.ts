import { TourDefinition } from '../tour-types';

export const cityExplorerTour: TourDefinition = {
  id: 'city-explorer',
  version: 1,
  module: 'City Explorer',
  title: 'AI City Explorer Tour',
  badge: 'Explorer',
  description: 'Explore grounded city knowledge, tourist spots, local history, weather, and dining powered by Gemini Fast and parallel prefetching.',
  routePattern: '^/explore',
  steps: [
    {
      id: 'city-1',
      target: 'data-tour="city-explorer-header"',
      title: 'AI City Explorer',
      description: 'Discover grounded city guides, attractions, history, weather, and practical travel knowledge.',
      icon: '🌍'
    },
    {
      id: 'city-2',
      target: 'data-tour="city-explorer-search"',
      title: 'City Switcher & Search',
      description: 'Type any city name (e.g. Vadodara, Tokyo, Paris) to load grounded knowledge cards instantly.',
      icon: '🏙️'
    },
    {
      id: 'city-3',
      target: 'data-tour="city-explorer-categories"',
      title: 'Categorized Knowledge',
      description: 'Filter answers by About the City, Top Places, Culture & Heritage, Food & Dining, and Weather.',
      icon: '📍'
    },
    {
      id: 'city-4',
      target: 'data-tour="city-explorer-tts"',
      title: 'Voice Audio Player',
      description: 'Click the speaker icon on any card to listen to the grounded city answer spoken via TTS.',
      icon: '🔊'
    }
  ]
};
