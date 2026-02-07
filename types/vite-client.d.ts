// Minimal declaration for the Vite client types used in tests when node_modules are unavailable.
declare module 'vite/client' {
  interface ImportMetaEnv {
    readonly [key: string]: string | undefined;
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }
}
