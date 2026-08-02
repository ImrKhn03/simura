import { readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import { gzipSync } from 'node:zlib';

const root = join(process.cwd(), 'dist', 'web');
const textExtensions = new Set(['.html', '.js', '.css', '.json', '.svg']);
const violations: string[] = [];
let javascriptGzip = 0;

function walk(directory: string): void {
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) { walk(path); continue; }
    if (!textExtensions.has(extname(path))) continue;
    const text = readFileSync(path, 'utf8');
    if (extname(path) === '.js') {
      const bytes = Buffer.byteLength(text);
      javascriptGzip += gzipSync(text).byteLength;
      if (bytes > 500 * 1024) violations.push(`${path}: ${(bytes / 1024).toFixed(1)} KiB exceeds the 500 KiB chunk ceiling`);
    }
    const remote = text.match(/https?:\/\/[A-Za-z0-9.-]+(?:[/:][^\s"')<]*)?/g) ?? [];
    for (const value of extname(path) === '.js' ? [] : remote) {
      // Standards namespace literals are identifiers, not runtime asset requests.
      if (value.startsWith('http://www.w3.org/')) continue;
      if (value === 'https://github.com/pmndrs/postprocessing') continue; // bundled license/source comment
      if (value.startsWith('http://developer.download.nvidia.com/assets/gamedev/files/sdk/11/FXAA_WhitePaper.pdf')) continue; // bundled shader source comment
      if (value.startsWith('https://catlikecoding.com/unity/tutorials/advanced-rendering/fxaa/')) continue; // bundled shader source comment
      violations.push(`${path}: ${value.slice(0, 180)}`);
    }
    if (extname(path) === '.js') {
      const runtimeRemote = text.match(/(?:fetch|import)\s*\(\s*["'`]https?:\/\/[^"'`]+|new\s+URL\s*\(\s*["'`]https?:\/\/[^"'`]+|\.(?:src|href)\s*=\s*["'`]https?:\/\/[^"'`]+/g) ?? [];
      for (const value of runtimeRemote) violations.push(`${path}: runtime remote reference ${value.slice(0, 180)}`);
    }
    if (extname(path) !== '.js' && /(?:src|href|url)\s*[=(]\s*["']?\/\/[A-Za-z0-9.-]+/i.test(text)) {
      violations.push(`${path}: protocol-relative runtime asset`);
    }
    if (/@import\s+url\s*\(/i.test(text)) violations.push(`${path}: CSS @import is forbidden`);
  }
}

walk(root);
if (javascriptGzip > 220 * 1024) violations.push(`initial bundled JavaScript: ${(javascriptGzip / 1024).toFixed(1)} KiB gzip exceeds the 220 KiB ceiling`);
if (violations.length) {
  console.error(`Remote runtime dependency audit failed:\n${violations.join('\n')}`);
  process.exitCode = 1;
} else {
  console.log('Web build audit passed: no remote runtime assets or imports.');
}
