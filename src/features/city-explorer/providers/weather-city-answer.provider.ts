import { CityExplorerAnswerProvider } from './city-explorer-answer-provider.interface';
import { PredefinedQuestionItem, CityInfo, CityExplorerAnswerResult } from '../city-explorer.types';
import { weatherService, WeatherService } from '@/features/weather/weather.service';
import { cityExplorerTelemetryService } from '../city-explorer.telemetry.service';

export class WeatherCityAnswerProvider implements CityExplorerAnswerProvider {
  public readonly name = 'WEATHER';
  private weather: WeatherService;

  constructor(weather?: WeatherService) {
    this.weather = weather || weatherService;
  }

  public supports(questionItem: PredefinedQuestionItem): boolean {
    return !!questionItem.isWeather;
  }

  public async generateAnswer(
    userId: string,
    city: CityInfo,
    questionItem: PredefinedQuestionItem,
    _signal?: AbortSignal
  ): Promise<CityExplorerAnswerResult> {
    const startTime = Date.now();
    const cityStr = city.name.trim();

    try {
      const weatherData = await this.weather.getWeather(cityStr);
      const answer = `Current weather in ${weatherData.city}: ${weatherData.temperature}°C (Feels like ${weatherData.feelsLike}°C), ${weatherData.condition}. High of ${weatherData.high}°C, Low of ${weatherData.low}°C. Humidity: ${weatherData.humidity}%, Wind: ${weatherData.windSpeed} km/h. Best visited during mild winter and spring months.`;

      cityExplorerTelemetryService.logEvent('city_explorer.answer.generated', cityStr, questionItem.id, userId, {
        provider: this.name,
        isWeather: true,
        durationMs: Date.now() - startTime
      });

      return {
        questionId: questionItem.id,
        category: questionItem.category,
        question: questionItem.question,
        status: 'READY',
        answer,
        citations: [{ title: 'Open-Meteo Weather Service', domain: 'open-meteo.com' }],
        provider: this.name,
        cached: false,
        generatedAt: new Date().toISOString()
      };
    } catch (err) {
      console.warn(`[WeatherCityAnswerProvider] Weather lookup failed for ${cityStr}:`, err);
      return {
        questionId: questionItem.id,
        category: questionItem.category,
        question: questionItem.question,
        status: 'FAILED',
        error: 'Weather service is currently unavailable.',
        provider: this.name,
        cached: false,
        generatedAt: new Date().toISOString()
      };
    }
  }
}

export const weatherCityAnswerProvider = new WeatherCityAnswerProvider();
