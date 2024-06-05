import {execSync} from 'child_process';

export default {
  esbuild: {
    target: 'es2022',
  },
  build: {
    target: 'es2022',
  },
  define: {
    'import.meta.env.COMMIT': JSON.stringify(
      execSync('git rev-parse --short HEAD || echo none').toString(),
    ),
  },
};
