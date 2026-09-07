/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
  // You can add declarations for other VITE_ variables here
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}