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

[ -d node_modules/emscripten-sdk-npm/emsdk ] || npx emsdk-checkout || exit 1
# From tree-sitter/cli/loader/emscripten-version
npx emsdk install 3.1.37 || exit 1
npx emsdk activate 3.1.37 || exit 1
PKMAPP_ROOT=$PWD
source node_modules/emscripten-sdk-npm/emsdk/emsdk_env.sh || exit 1
(
  unset NODE
  (
    export EXTENSION_TAGS=1
    export EXTENSION_GFM=1
    export NO_DEFAULT_EXTENSIONS=1
    (
      cd $PKMAPP_ROOT/node_modules/tree-sitter-markdown/tree-sitter-markdown
      $PKMAPP_ROOT/node_modules/.bin/tree-sitter generate || exit 1
    )
    (
      cd $PKMAPP_ROOT/node_modules/tree-sitter-markdown/tree-sitter-markdown-inline
      $PKMAPP_ROOT/node_modules/.bin/tree-sitter generate || exit 1
    )
  )
  cd build/deps/
  $PKMAPP_ROOT/node_modules/.bin/tree-sitter build-wasm $PKMAPP_ROOT/node_modules/tree-sitter-markdown/tree-sitter-markdown || exit 1
  $PKMAPP_ROOT/node_modules/.bin/tree-sitter build-wasm $PKMAPP_ROOT/node_modules/tree-sitter-markdown/tree-sitter-markdown-inline || exit 1
)
curl -f -L https://github.com/tree-sitter/tree-sitter/releases/download/v0.21.0-pre-release-1/tree-sitter.js > build/deps/tree-sitter.js || exit 1
echo 'export default TreeSitter;' >> build/deps/tree-sitter.js
curl -f -L https://github.com/tree-sitter/tree-sitter/releases/download/v0.21.0-pre-release-1/tree-sitter.wasm > build/deps/tree-sitter.wasm || exit 1
