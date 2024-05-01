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

PKMAPP_ROOT=$PWD
(
  (
    export EXTENSION_TAGS=1
    export EXTENSION_GFM=1
    export NO_DEFAULT_EXTENSIONS=1
    (
      cd $PKMAPP_ROOT/node_modules/@tree-sitter-grammars/tree-sitter-markdown/tree-sitter-markdown
      $PKMAPP_ROOT/node_modules/.bin/tree-sitter generate || exit 1
    )
    (
      cd $PKMAPP_ROOT/node_modules/@tree-sitter-grammars/tree-sitter-markdown/tree-sitter-markdown-inline
      $PKMAPP_ROOT/node_modules/.bin/tree-sitter generate || exit 1
    )
  )
  cd build/deps/
  $PKMAPP_ROOT/node_modules/.bin/tree-sitter build --wasm $PKMAPP_ROOT/node_modules/@tree-sitter-grammars/tree-sitter-markdown/tree-sitter-markdown || exit 1
  $PKMAPP_ROOT/node_modules/.bin/tree-sitter build --wasm $PKMAPP_ROOT/node_modules/@tree-sitter-grammars/tree-sitter-markdown/tree-sitter-markdown-inline || exit 1
)
cp node_modules/web-tree-sitter/tree-sitter.js build/deps/ || exit 1
echo 'export default TreeSitter;' >> build/deps/tree-sitter.js
cp node_modules/web-tree-sitter/tree-sitter.wasm build/deps/ || exit 1
