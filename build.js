const esbuild = require('esbuild');

const isWatch = process.argv.includes('--watch');

const buildOptions = {
  entryPoints: {
    'dist/background': './src/background.ts',
    'dist/content-isolate': './src/content-isolate.ts',
    'dist/content-main': './src/content-main.ts',
    'options/options': './options/options.ts'
  },
  bundle: true,
  outdir: './',
  platform: 'browser',
  target: 'es2022',
  format: 'esm',
  sourcemap: false,
  minify: false,
  logLevel: 'info',
};

async function runBuild() {
  if (isWatch) {
    const ctx = await esbuild.context(buildOptions);
    await ctx.watch();
    console.log('Watching for changes...');
  } else {
    await esbuild.build(buildOptions);
    console.log('Build completed successfully.');
  }
}

runBuild().catch((err) => {
  console.error(err);
  process.exit(1);
});
