import type { SessionUser } from '@services/authApi';

interface EnvRecord {
  [key: string]: string | undefined;
}

const readEnvironment = (): EnvRecord => {
  const metaEnv = (typeof import.meta !== 'undefined' && (import.meta as unknown as { env?: EnvRecord })?.env)
    ? (import.meta as unknown as { env?: EnvRecord }).env
    : undefined;
  if (metaEnv) {
    return metaEnv;
  }

  const globalEnv = (globalThis as { __VITE_ENV__?: EnvRecord }).__VITE_ENV__;
  if (globalEnv) {
    return globalEnv;
  }

  const processEnv = (globalThis as { process?: { env?: EnvRecord } }).process?.env;
  if (processEnv) {
    return processEnv;
  }

  return {};
};

const resolveEnvValue = (keys: string[]): string | undefined => {
  const env = readEnvironment();
  for (const key of keys) {
    const value = env[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return undefined;
};

const parseBoolean = (value: string | undefined): boolean | undefined => {
  if (value === undefined) {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }
  return undefined;
};

export const isAnonymousAccessAllowed = (): boolean => {
  const configured = resolveEnvValue(['VITE_ALLOW_ANONYMOUS_ACCESS', 'ALLOW_ANONYMOUS_ACCESS']);
  const parsed = parseBoolean(configured);
  return parsed ?? false;
};

export const resolvePublicAccessToken = (): string => {
  return (
    resolveEnvValue(['VITE_PUBLIC_ACCESS_TOKEN', 'VITE_ACCESS_TOKEN', 'PUBLIC_ACCESS_TOKEN']) ??
    'public-access-token'
  );
};

export const createPublicSessionUser = (): SessionUser => {
  const username =
    resolveEnvValue(['VITE_PUBLIC_USERNAME', 'PUBLIC_USERNAME', 'VITE_DEFAULT_USERNAME']) ?? '访客用户';
  const rolesValue = resolveEnvValue(['VITE_PUBLIC_ROLES', 'PUBLIC_ROLES']);
  const roles = rolesValue
    ? rolesValue
        .split(',')
        .map((role) => role.trim())
        .filter((role) => role.length > 0)
    : [];

  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 365).toISOString();

  return {
    username,
    roles,
    expiresAt
  };
};

export const createPublicSession = (): { token: string; user: SessionUser } => ({
  token: resolvePublicAccessToken(),
  user: createPublicSessionUser()
});
