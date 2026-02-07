type EnvRecord = Record<string, string | undefined>;

interface RuntimeConfig {
  apiBaseUrl?: string;
  wsBaseUrl?: string;
}

const readMetaEnv = (): EnvRecord => {
  const metaEnv = (import.meta as unknown as { env?: EnvRecord })?.env;
  if (metaEnv) {
    return metaEnv;
  }
  const globalEnv = (globalThis as { __VITE_ENV__?: EnvRecord }).__VITE_ENV__;
  if (globalEnv) {
    return globalEnv;
  }
  const globalProcess = (globalThis as { process?: { env?: EnvRecord } }).process;
  if (globalProcess?.env) {
    return globalProcess.env;
  }
  return {};
};

const readRuntimeConfig = (): RuntimeConfig => {
  const globalConfig = (globalThis as { __ALGOTRADER_RUNTIME_CONFIG__?: RuntimeConfig })
    .__ALGOTRADER_RUNTIME_CONFIG__;
  const runtimeConfig: RuntimeConfig = { ...globalConfig };

  if (typeof document !== 'undefined') {
    const readMetaTag = (name: string): string => {
      const element = document.querySelector(`meta[name="${name}"]`);
      const content = element?.getAttribute('content');
      return content ? content.trim() : '';
    };

    if (!runtimeConfig.apiBaseUrl) {
      const metaValue = readMetaTag('algo-trader:api-base-url');
      if (metaValue) {
        runtimeConfig.apiBaseUrl = metaValue;
      }
    }

    if (!runtimeConfig.wsBaseUrl) {
      const metaValue = readMetaTag('algo-trader:ws-base-url');
      if (metaValue) {
        runtimeConfig.wsBaseUrl = metaValue;
      }
    }

  }

  return runtimeConfig;
};

const metaEnv = readMetaEnv();

const normalizeBase = (base: string): string => {
  if (!base) {
    return '';
  }
  return base.endsWith('/') ? base.slice(0, -1) : base;
};

const pickConfiguredBaseUrl = (primary?: string, fallback?: string): string => {
  return normalizeBase((primary ?? fallback ?? '').trim());
};

const resolveConfiguredApiBaseUrl = (): string => {
  const runtimeConfig = readRuntimeConfig();
  return pickConfiguredBaseUrl(runtimeConfig.apiBaseUrl, metaEnv.VITE_API_BASE_URL);
};

const resolveConfiguredWsBaseUrl = (): string => {
  const runtimeConfig = readRuntimeConfig();
  return pickConfiguredBaseUrl(runtimeConfig.wsBaseUrl, metaEnv.VITE_WS_URL);
};

const inferLocalBackendBaseUrl = (): string => {
  if (typeof window === 'undefined' || !window.location) {
    return '';
  }
  const { protocol, hostname, port, origin } = window.location;
  if (
    (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0') &&
    (port === '5173' || port === '4173')
  ) {
    const preferredProtocol = protocol === 'https:' ? 'https:' : 'http:';
    return `${preferredProtocol}//${hostname}:8000`;
  }
  if (origin) {
    return origin;
  }
  const defaultPort =
    !port || (protocol === 'http:' && port === '80') || (protocol === 'https:' && port === '443')
      ? ''
      : `:${port}`;
  return `${protocol}//${hostname}${defaultPort}`;
};

const ABSOLUTE_URL_PATTERN = /^[a-z][a-z0-9+.-]*:\/\//i;

export const isAbsoluteUrl = (value: string): boolean =>
  Boolean(value) && (ABSOLUTE_URL_PATTERN.test(value) || value.startsWith('//'));

export const ensureLeadingSlash = (path: string): string => {
  if (!path) {
    return path;
  }
  return path.startsWith('/') ? path : `/${path}`;
};

const joinPath = (basePath: string, path: string): string => {
  const normalizedBase = basePath.endsWith('/') ? basePath.slice(0, -1) : basePath;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  if (!normalizedBase) {
    return normalizedPath;
  }
  if (!normalizedPath) {
    return normalizedBase;
  }
  return `${normalizedBase}${normalizedPath}`;
};

const normalizeUrlPath = (value: string): string => {
  if (!value) {
    return '';
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }
  const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  if (withLeadingSlash === '/') {
    return '/';
  }
  return withLeadingSlash.endsWith('/') ? withLeadingSlash.slice(0, -1) : withLeadingSlash;
};

const combineUrlPaths = (basePath: string, path: string): string => {
  const normalizedBase = normalizeUrlPath(basePath);
  const normalizedPath = normalizeUrlPath(path);
  if (!normalizedBase) {
    return normalizedPath || '/';
  }
  if (!normalizedPath || normalizedPath === '/') {
    return normalizedBase;
  }
  if (normalizedBase === '/' || normalizedBase === normalizedPath) {
    return normalizedBase === '/' ? normalizedPath : normalizedBase;
  }
  if (normalizedBase !== '/' && normalizedPath.startsWith(`${normalizedBase}/`)) {
    return normalizedPath;
  }
  return joinPath(normalizedBase, normalizedPath);
};

const stripApiSuffix = (pathname: string): string => {
  if (!pathname || pathname === '/') {
    return '';
  }
  const segments = pathname.split('/').filter(Boolean);
  if (!segments.length) {
    return '';
  }
  const last = segments[segments.length - 1];
  if (last && last.toLowerCase() === 'api') {
    segments.pop();
  }
  if (!segments.length) {
    return '';
  }
  return `/${segments.join('/')}`;
};

const buildWsUrlFromHttpBase = (value: string, path: string): string | null => {
  try {
    const url = new URL(value);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    if (path && path.trim()) {
      const basePath = stripApiSuffix(url.pathname ?? '');
      const combinedPath = combineUrlPaths(basePath, path);
      url.pathname = combinedPath || '/';
    }
    return url.toString();
  } catch (error) {
    console.warn('Failed to resolve WebSocket URL from base', value, error);
    return null;
  }
};

const buildWsUrlFromWsBase = (value: string, path: string): string | null => {
  try {
    const url = new URL(value);
    if (path && path.trim()) {
      const combinedPath = combineUrlPaths(url.pathname ?? '', path);
      url.pathname = combinedPath || '/';
    }
    return url.toString();
  } catch (error) {
    console.warn('Failed to resolve WebSocket URL from base', value, error);
    return null;
  }
};

export const getApiBaseUrl = (): string => {
  const configured = resolveConfiguredApiBaseUrl();
  if (configured) {
    return configured;
  }
  return normalizeBase(inferLocalBackendBaseUrl());
};

export const resolveApiUrl = (path: string): string => {
  const trimmed = path.trim();
  if (!trimmed) {
    return trimmed;
  }
  if (isAbsoluteUrl(trimmed)) {
    return trimmed;
  }
  const base = getApiBaseUrl();
  if (!base) {
    return ensureLeadingSlash(trimmed);
  }
  return joinPath(base, trimmed);
};

export const resolveRequestUrl = (path: string): string => {
  const resolved = resolveApiUrl(path);
  if (isAbsoluteUrl(resolved)) {
    return resolved;
  }
  return ensureLeadingSlash(resolved);
};

const getWsBaseUrl = (): string => resolveConfiguredWsBaseUrl();

export const resolveWsUrl = (path: string): string => {
  const configured = getWsBaseUrl();
  if (configured) {
    if (configured.startsWith('ws://') || configured.startsWith('wss://')) {
      const resolved = buildWsUrlFromWsBase(configured, path);
      if (resolved) {
        return resolved;
      }
      return joinPath(configured, path);
    }
    if (configured.startsWith('http://') || configured.startsWith('https://')) {
      const resolved = buildWsUrlFromHttpBase(configured, path);
      if (resolved) {
        return resolved;
      }
    }
  }

  const apiBase = getApiBaseUrl();
  if (apiBase && (apiBase.startsWith('http://') || apiBase.startsWith('https://'))) {
    const resolved = buildWsUrlFromHttpBase(apiBase, path);
    if (resolved) {
      return resolved;
    }
  }

  if (typeof window !== 'undefined' && window.location) {
    const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
    return `${scheme}//${window.location.host}${path.startsWith('/') ? path : `/${path}`}`;
  }

  return path;
};
