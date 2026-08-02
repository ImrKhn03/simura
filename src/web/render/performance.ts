import type { QualityPreset } from './quality.ts';

export interface RenderMetrics { frameMs: number; calls: number; triangles: number; snapshotApplyMs: number; chunkWorkMs: number }
export const RENDER_BUDGETS: Record<QualityPreset, RenderMetrics> = {
  low: { frameMs: 16.7, calls: 180, triangles: 400_000, snapshotApplyMs: 12, chunkWorkMs: 4 },
  medium: { frameMs: 16.7, calls: 280, triangles: 900_000, snapshotApplyMs: 12, chunkWorkMs: 4 },
  high: { frameMs: 20, calls: 400, triangles: 1_500_000, snapshotApplyMs: 16, chunkWorkMs: 6 },
  ultra: { frameMs: 25, calls: 550, triangles: 2_200_000, snapshotApplyMs: 16, chunkWorkMs: 6 },
};

export function budgetBreaches(preset: QualityPreset, metrics: RenderMetrics): string[] {
  const budget = RENDER_BUDGETS[preset]; const breaches: string[] = [];
  for (const key of Object.keys(budget) as (keyof RenderMetrics)[]) if (metrics[key] > budget[key]) breaches.push(key);
  return breaches;
}

export function boundedFrameDelta(previous: number, now: number, visible: boolean): number {
  return visible ? Math.max(0, Math.min(.1, (now - previous) / 1000)) : 0;
}

export function serializedBytes(value: unknown): number { return new TextEncoder().encode(JSON.stringify(value)).byteLength; }
