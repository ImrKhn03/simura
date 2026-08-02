import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const WEB_ROOT = resolve('src/web');

function sourceFiles(root: string): string[] {
  return readdirSync(root).flatMap((entry) => {
    const path = join(root, entry);
    return statSync(path).isDirectory() ? sourceFiles(path) : path.endsWith('.ts') ? [path] : [];
  });
}

function localImports(file: string): string[] {
  const source = readFileSync(file, 'utf8');
  return [...source.matchAll(/from\s+['"](\.[^'"]+)['"]/g)].flatMap((match) => {
    const target = resolve(dirname(file), match[1]!);
    const withExtension = target.endsWith('.ts') ? target : `${target}.ts`;
    return withExtension.startsWith(WEB_ROOT) ? [withExtension] : [];
  });
}

describe('renderer module contracts', () => {
  it('keeps the web renderer import graph acyclic', () => {
    const files = sourceFiles(WEB_ROOT);
    const graph = new Map(files.map((file) => [file, localImports(file)]));
    const visiting = new Set<string>(); const visited = new Set<string>();
    const walk = (file: string, chain: string[]): void => {
      if (visiting.has(file)) throw new Error(`renderer import cycle: ${[...chain, relative(WEB_ROOT, file)].join(' -> ')}`);
      if (visited.has(file)) return;
      visiting.add(file);
      for (const dependency of graph.get(file) ?? []) walk(dependency, [...chain, relative(WEB_ROOT, file)]);
      visiting.delete(file); visited.add(file);
    };
    for (const file of files) walk(file, []);
  });

  it('characterizes the public Stage compatibility façade', () => {
    const source = readFileSync(resolve(WEB_ROOT, 'scene.ts'), 'utf8');
    expect(source).toMatch(/export class Stage/);
    for (const member of ['setCameraMode', 'cameraMode', 'selectedQuality', 'metrics', 'setQuality', 'applyCameraPreset', 'focusKin', 'focusCreature', 'update', 'dispose']) {
      expect(source).toContain(`${member}`);
    }
    expect(source).toContain('onCameraModeChange');
    expect(source).toContain('onKinClick');
    expect(source).toContain('onCreatureClick');
  });
});
