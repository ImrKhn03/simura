export type QualityChoice = 'auto' | 'low' | 'medium' | 'high' | 'ultra';
export type QualityPreset = Exclude<QualityChoice, 'auto'>;

export interface DeviceCapability {
  devicePixelRatio: number;
  webgl2: boolean;
  maxTextureSize: number;
  hardwareConcurrency: number;
  reducedMotion: boolean;
}

export interface QualitySettings {
  preset: QualityPreset;
  pixelRatio: number;
  bloom: boolean;
  ao: boolean;
  aoSamples: number;
  aa: 'fxaa';
  shadowMapSize: 1024 | 1536 | 2048 | 3072;
  cinemaDof: boolean;
  bloomLevels: number;
  bloomIntensity: number;
  reducedMotion: boolean;
}

const CHOICES = new Set<QualityChoice>(['auto', 'low', 'medium', 'high', 'ultra']);

export function parseQualityChoice(value: string | null | undefined): QualityChoice {
  return value && CHOICES.has(value as QualityChoice) ? value as QualityChoice : 'auto';
}

export function autoQuality(cap: DeviceCapability): QualityPreset {
  if (!cap.webgl2 || cap.maxTextureSize < 8192 || cap.hardwareConcurrency <= 4) return 'low';
  if (cap.hardwareConcurrency >= 8 && cap.maxTextureSize >= 16384 && cap.devicePixelRatio >= 1.25) return 'high';
  return 'medium';
}

export function qualitySettings(choice: QualityChoice, cap: DeviceCapability): QualitySettings {
  const preset = choice === 'auto' ? autoQuality(cap) : choice;
  const capRatio = { low: 1, medium: 1.25, high: 1.5, ultra: 2 }[preset];
  return {
    preset,
    pixelRatio: Math.max(0.75, Math.min(cap.devicePixelRatio || 1, capRatio)),
    bloom: true,
    // the gouache look renders raw like the style lab — AO only muddies flat paint
    ao: false,
    aoSamples: { low: 0, medium: 8, high: 16, ultra: 32 }[preset],
    aa: 'fxaa',
    shadowMapSize: { low: 1024, medium: 1536, high: 2048, ultra: 3072 }[preset] as QualitySettings['shadowMapSize'],
    cinemaDof: !cap.reducedMotion && (preset === 'high' || preset === 'ultra'),
    bloomLevels: { low: 4, medium: 5, high: 7, ultra: 8 }[preset],
    bloomIntensity: { low: 0.45, medium: 0.55, high: 0.62, ultra: 0.68 }[preset],
    reducedMotion: cap.reducedMotion,
  };
}

export function browserCapability(renderer: { capabilities: { isWebGL2: boolean; maxTextureSize: number } }): DeviceCapability {
  return {
    devicePixelRatio: globalThis.devicePixelRatio || 1,
    webgl2: renderer.capabilities.isWebGL2,
    maxTextureSize: renderer.capabilities.maxTextureSize,
    hardwareConcurrency: globalThis.navigator?.hardwareConcurrency || 4,
    reducedMotion: globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
  };
}
