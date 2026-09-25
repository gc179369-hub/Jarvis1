/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_ZAPIER_URL?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
