// Copyright 2022 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import type {Options} from '@wdio/types'
import * as os from 'os';

const instances = Math.max(1, Math.round(os.cpus().length / 2));
export const config: Options.Testrunner = {
  autoCompileOpts: {
    autoCompile: true,
    tsNodeOpts: {transpileOnly: true, project: 'test/tsconfig.json'}
  },
  specs: ['./test/specs/**/*test.ts'],
  exclude: [],
  maxInstances: instances,
  capabilities: [{
    maxInstances: instances,
    browserName: 'chrome',
    acceptInsecureCerts: true,
    'goog:chromeOptions': {
      args: ['headless'],
    },
  }],
  // Level of logging verbosity: trace | debug | info | warn | error | silent
  logLevel: 'warn',
  outputDir: 'test/logs',
  bail: 0,
  baseUrl: 'http://localhost:8001',
  waitforTimeout: 10000,
  connectionRetryTimeout: 120000,
  connectionRetryCount: 3,
  services: ['chromedriver'],
  framework: 'jasmine',
  reporters: ['spec'],
  jasmineOpts: {
    stopOnSpecFailure: true,
    defaultTimeoutInterval: 60000,
    //
    // The Jasmine framework allows interception of each assertion in order to
    // log the state of the application or website depending on the result. For
    // example, it is pretty handy to take a screenshot every time an assertion
    // fails.
    expectationResultHandler: function(passed, assertion) {
      // do something
    }
  },
}
