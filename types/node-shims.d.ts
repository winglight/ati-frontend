// Minimal Node.js declarations to satisfy the TypeScript build without relying on @types/node.
declare const __dirname: string;
declare const __filename: string;

declare var process: {
  env: Record<string, string | undefined>;
  cwd(): string;
  argv: string[];
};

declare type Buffer = any;
declare const Buffer: Buffer;

declare namespace NodeJS {
  interface ProcessEnv {
    [key: string]: string | undefined;
  }
}

declare module 'node:path' {
  const path: {
    resolve: (...paths: string[]) => string;
    join: (...paths: string[]) => string;
    dirname: (path: string) => string;
  };
  export = path;
}

declare module 'node:fs' {
  const fs: any;
  export = fs;
}

declare module 'node:fs/promises' {
  const fs: any;
  export = fs;
}

declare module 'node:url' {
  export const fileURLToPath: (url: string | URL) => string;
  export const pathToFileURL: (path: string) => URL;
  export const URL: typeof globalThis.URL;
  export const URLSearchParams: typeof globalThis.URLSearchParams;
}

declare module 'node:stream' {
  const stream: any;
  export = stream;
}

declare module 'node:stream/promises' {
  const stream: any;
  export = stream;
}

declare module 'node:events' {
  class EventEmitter {
    on: (...args: any[]) => this;
    off: (...args: any[]) => this;
    emit: (...args: any[]) => boolean;
  }
  export { EventEmitter };
  export default EventEmitter;
}

declare module 'node:http' {
  const http: any;
  export = http;
}

declare module 'node:http2' {
  const http2: any;
  export = http2;
}

declare module 'node:https' {
  const https: any;
  export = https;
}

declare module 'node:net' {
  const net: any;
  export = net;
}

declare module 'node:tls' {
  const tls: any;
  export = tls;
}

declare module 'node:zlib' {
  const zlib: any;
  export = zlib;
}

declare module 'rollup/parseAst' {
  const parseAst: any;
  export = parseAst;
}
