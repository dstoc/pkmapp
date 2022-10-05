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
let used = false;
window.showDirectoryPicker = async () => {
    const root = await navigator.storage.getDirectory();
    if (!used) {
        used = true;
        for await (const name of root.keys()) {
            await root.removeEntry(name, { recursive: true });
        }
    }
    return root.getDirectoryHandle(`tmp`, { create: true });
};
//# sourceMappingURL=memory_file_system.js.map