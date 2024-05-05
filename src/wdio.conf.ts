import type {Options} from '@wdio/types';
import * as os from 'os';

const instances = Math.max(1, Math.round(os.cpus().length / 2));
export const config: Options.Testrunner = {
  runner: [
    'browser',
    {
      viteConfig: {
        publicDir: 'build',
      },
    },
  ],
  autoCompileOpts: {
    autoCompile: true,
    tsNodeOpts: {
      project: './tsconfig.json',
      transpileOnly: true,
    },
  },
  specs: ['../src/**/*.test.ts'],
  exclude: [],
  maxInstances: instances,
  capabilities: [
    {
      maxInstances: instances,
      browserName: 'chrome',
      acceptInsecureCerts: true,
      'goog:chromeOptions': {
        args: ['headless', 'disable-gpu'],
        binary: process.env.CHROMIUM_BIN,
      },
    },
  ],
  logLevel: 'warn',
  bail: 0,
  waitforTimeout: 10000,
  connectionRetryTimeout: 120000,
  connectionRetryCount: 3,
  framework: 'mocha',
  reporters: ['spec'],
  mochaOpts: {
    ui: 'bdd',
    timeout: 60000,
  },
};
