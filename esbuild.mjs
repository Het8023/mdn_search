import * as esbuild from 'esbuild';

const isProduction = process.argv.includes('--production');
const isWatch = process.argv.includes('--watch');

const context = await esbuild.context({
  entryPoints: ['src/extension.ts'],
  bundle: true,
  format: 'cjs',
  minify: isProduction,
  outfile: 'dist/extension.js',
  platform: 'node',
  sourcemap: !isProduction,
  external: ['vscode'],
  logLevel: 'info'
});

if (isWatch) {
  await context.watch();
  console.log('Watching extension sources...');
} else {
  await context.rebuild();
  await context.dispose();
}
