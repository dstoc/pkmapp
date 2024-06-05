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

ROOT=$PWD

mkdir -p src/deps/
touch src/deps/stamp

NEWSTAMP=$(cat pnpm-lock.yaml build-wasm.sh | sha1sum)
OLDSTAMP=$(cat src/deps/stamp)

if [ "$NEWSTAMP" == "$OLDSTAMP" ]; then
  exit 0
fi

echo "$NEWSTAMP" > src/deps/stamp

block() {
  export EXTENSION_TAGS=1
  export EXTENSION_GFM=1
  export NO_DEFAULT_EXTENSIONS=1
  cd $ROOT/node_modules/@tree-sitter-grammars/tree-sitter-markdown/tree-sitter-markdown
  $ROOT/node_modules/.bin/tree-sitter generate || exit 1
  cd $ROOT/src/deps/
  $ROOT/node_modules/.bin/tree-sitter build --wasm $ROOT/node_modules/@tree-sitter-grammars/tree-sitter-markdown/tree-sitter-markdown || exit 1
}

inline() {
  export EXTENSION_TAGS=1
  export EXTENSION_GFM=1
  export NO_DEFAULT_EXTENSIONS=1
  cd $ROOT/node_modules/@tree-sitter-grammars/tree-sitter-markdown/tree-sitter-markdown-inline
  $ROOT/node_modules/.bin/tree-sitter generate || exit 1
  cd $ROOT/src/deps/
  $ROOT/node_modules/.bin/tree-sitter build --wasm $ROOT/node_modules/@tree-sitter-grammars/tree-sitter-markdown/tree-sitter-markdown-inline || exit 1
}

block &
pid1=$!
inline &
pid2=$!

wait $pid1
status1=$?
wait $pid2
status2=$?

if [ $status1 -ne 0 ]; then
  exit $status1
fi

if [ $status2 -ne 0 ]; then
  exit $status2
fi
