import { describe, expect, it } from 'vitest';
import { autoQuality, parseQualityChoice, qualitySettings, type DeviceCapability } from '../src/web/render/quality.ts';

const capable: DeviceCapability = {
  devicePixelRatio: 2.5, webgl2: true, maxTextureSize: 16384, hardwareConcurrency: 8, reducedMotion: false,
};

describe('render quality policy', () => {
  it('keeps invalid stored values on safe Auto', () => {
    expect(parseQualityChoice('cinematic')).toBe('auto');
    expect(parseQualityChoice(null)).toBe('auto');
  });

  it('never automatically selects enthusiast-only Ultra', () => {
    expect(autoQuality(capable)).toBe('high');
  });

  it('bounds every pixel ratio and exposes Ultra manually', () => {
    expect(qualitySettings('low', capable).pixelRatio).toBe(1);
    expect(qualitySettings('medium', capable).pixelRatio).toBe(1.25);
    expect(qualitySettings('high', capable).pixelRatio).toBe(1.5);
    expect(qualitySettings('ultra', capable).pixelRatio).toBe(2);
    expect(qualitySettings('ultra', capable).shadowMapSize).toBe(3072);
  });

  it('disables costly focus motion when reduced motion is requested', () => {
    expect(qualitySettings('ultra', { ...capable, reducedMotion: true }).cinemaDof).toBe(false);
  });

  it('falls back on limited devices', () => {
    expect(autoQuality({ ...capable, webgl2: false })).toBe('low');
    expect(autoQuality({ ...capable, hardwareConcurrency: 4 })).toBe('low');
  });
});
