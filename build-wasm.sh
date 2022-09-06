#!/bin/bash -eu
#
# Copyright 2022 Google LLC
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#      http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

#!/bin/sh
npx emsdk-checkout
npx emsdk install 2.0.24
npx emsdk activate 2.0.24
source node_modules/emscripten-sdk-npm/emsdk/emsdk_env.sh
npx tree-sitter-cli build-wasm node_modules/tree-sitter-markdown/tree-sitter-markdown
npx tree-sitter-cli build-wasm node_modules/tree-sitter-markdown/tree-sitter-markdown-inline
