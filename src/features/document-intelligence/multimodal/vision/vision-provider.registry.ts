import { VisionProvider } from './vision-provider.interface';
import { mockVisionProvider } from './mock-vision.provider';
import { geminiVisionProvider } from './gemini-vision.provider';

export class VisionProviderRegistry {
  private providers = new Map<string, VisionProvider>([
    ['mock', mockVisionProvider],
    ['gemini', geminiVisionProvider]
  ]);

  public register(provider: VisionProvider): void {
    this.providers.set(provider.name, provider);
  }

  public get(name: string): VisionProvider {
    return this.providers.get(name) ?? mockVisionProvider;
  }
}

export const visionProviderRegistry = new VisionProviderRegistry();
