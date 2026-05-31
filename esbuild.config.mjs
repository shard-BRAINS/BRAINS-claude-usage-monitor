import * as esbuild from 'esbuild';
import { cpSync } from 'node:fs';

const watch = process.argv.includes('--watch');
const production = process.argv.includes('--production');

/** @type {import('esbuild').BuildOptions} */
const buildOptions = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.js',
  platform: 'node',
  format: 'cjs',
  external: ['vscode'],
  sourcemap: !production,
  minify: production,
  logLevel: 'info',
};

function copyWebviewAssets() {
  cpSync('src/ui/webview', 'dist/webview', { recursive: true });
}

if (watch) {
  const ctx = await esbuild.context(buildOptions);
  await ctx.watch();
  copyWebviewAssets();
  console.log('Watching for changes...');
} else {
  await esbuild.build(buildOptions);
  copyWebviewAssets();
}
