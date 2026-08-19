import { weatherCityAnswerProvider } from '@/features/city-explorer/providers/weather-city-answer.provider';
import { geminiCityAnswerProvider } from '@/features/city-explorer/providers/gemini-city-answer.provider';
import { webSearchCityAnswerProvider } from '@/features/city-explorer/providers/web-search-city-answer.provider';

describe('City Explorer Provider Strategy Routing Unit Tests', () => {
  it('weather provider supports weather questions exclusively', () => {
    expect(weatherCityAnswerProvider.supports({ id: 'weather', category: 'Travel & Weather', categoryIcon: '🌤', question: 'Weather today?', kind: 'DYNAMIC', priority: 'P0', isWeather: true })).toBe(true);
    expect(weatherCityAnswerProvider.supports({ id: 'history', category: 'About', categoryIcon: '📍', question: 'History?', kind: 'STATIC', priority: 'P1' })).toBe(false);
  });

  it('gemini provider supports public city questions', () => {
    expect(geminiCityAnswerProvider.supports({ id: 'history', category: 'About', categoryIcon: '📍', question: 'History?', kind: 'STATIC', priority: 'P1' })).toBe(true);
    expect(geminiCityAnswerProvider.supports({ id: 'weather', category: 'Travel & Weather', categoryIcon: '🌤', question: 'Weather today?', kind: 'DYNAMIC', priority: 'P0', isWeather: true })).toBe(false);
  });

  it('web search provider supports public city questions fallback', () => {
    expect(webSearchCityAnswerProvider.supports({ id: 'places', category: 'Places', categoryIcon: '🏛', question: 'Top spots?', kind: 'STATIC', priority: 'P0' })).toBe(true);
  });
});
