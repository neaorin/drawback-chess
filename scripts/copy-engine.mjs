import { mkdir, copyFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const engine = require('stockfish').findEngine('lite-single');
const target = new URL('../public/engine/', import.meta.url);
await mkdir(target, { recursive: true });
await copyFile(engine, new URL('stockfish.js', target));
await copyFile(engine.replace(/\.js$/, '.wasm'), new URL('stockfish.wasm', target));
await copyFile(join(dirname(require.resolve('stockfish/package.json')), 'Copying.txt'),
  new URL('COPYING.txt', target));
console.log('Stockfish lite single-threaded engine and license copied.');
