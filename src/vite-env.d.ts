/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly COMMIT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
