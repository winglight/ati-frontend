import { resolveRequestUrl } from './config.js';

const requestJson = async <T>(path: string, token?: string): Promise<T> => {
  const headers: HeadersInit = {
    Accept: 'application/json'
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(resolveRequestUrl(path), {
    method: 'GET',
    headers
  });

  if (!response.ok) {
    throw new Error('获取接口文档聚合信息失败');
  }

  const text = await response.text();
  if (!text) {
    throw new Error('接口文档聚合返回为空');
  }

  try {
    return JSON.parse(text) as T;
  } catch (_error) {
    throw new Error('解析接口文档聚合响应失败');
  }
};

export interface RawServiceDocSummary {
  path_count?: number;
  operation_count?: number;
  tag_count?: number;
  tags?: string[];
  version?: string | null;
}

export interface RawServiceDocEntry {
  name: string;
  url?: string | null;
  status: string;
  error?: string | null;
  kind?: string | null;
  fetched_at?: string | null;
  openapi?: Record<string, unknown> | null;
  summary?: RawServiceDocSummary | null;
}

export interface RawDocsAggregateSummary {
  service_count?: number;
  online_count?: number;
  offline_count?: number;
  total_path_count?: number;
  total_operation_count?: number;
  unique_tags?: string[];
}

export interface RawDocsAggregateResponse {
  generated_at?: string | null;
  summary?: RawDocsAggregateSummary | null;
  services?: RawServiceDocEntry[];
}

export interface ServiceDocSummary {
  pathCount: number;
  operationCount: number;
  tagCount: number;
  tags: string[];
  version: string | null;
}

export interface ServiceDocEntry {
  name: string;
  url: string | null;
  status: string;
  error: string | null;
  kind: string;
  fetchedAt: string | null;
  openapi: Record<string, unknown> | null;
  summary: ServiceDocSummary | null;
}

export interface DocsAggregateSummary {
  serviceCount: number;
  onlineCount: number;
  offlineCount: number;
  totalPathCount: number;
  totalOperationCount: number;
  uniqueTags: string[];
}

export interface DocumentationAggregate {
  generatedAt: string | null;
  summary: DocsAggregateSummary;
  services: ServiceDocEntry[];
  raw: RawDocsAggregateResponse;
}

const normaliseSummary = (summary?: RawServiceDocSummary | null): ServiceDocSummary | null => {
  if (!summary) {
    return null;
  }
  return {
    pathCount: Number(summary.path_count ?? 0),
    operationCount: Number(summary.operation_count ?? 0),
    tagCount: Number(summary.tag_count ?? 0),
    tags: Array.isArray(summary.tags) ? summary.tags.filter((tag): tag is string => typeof tag === 'string') : [],
    version: summary.version ?? null
  };
};

const normaliseEntry = (entry: RawServiceDocEntry): ServiceDocEntry => {
  return {
    name: entry.name,
    url: entry.url ?? null,
    status: entry.status,
    error: entry.error ?? null,
    kind: entry.kind ?? 'service',
    fetchedAt: entry.fetched_at ?? null,
    openapi: entry.openapi ?? null,
    summary: normaliseSummary(entry.summary)
  };
};

const normaliseAggregateSummary = (
  summary?: RawDocsAggregateSummary | null
): DocsAggregateSummary => {
  const rawTags = Array.isArray(summary?.unique_tags) ? summary?.unique_tags ?? [] : [];
  const tags = rawTags.filter((tag): tag is string => typeof tag === 'string');

  return {
    serviceCount: Number(summary?.service_count ?? 0),
    onlineCount: Number(summary?.online_count ?? 0),
    offlineCount: Number(summary?.offline_count ?? 0),
    totalPathCount: Number(summary?.total_path_count ?? 0),
    totalOperationCount: Number(summary?.total_operation_count ?? 0),
    uniqueTags: tags
  };
};

export const fetchDocumentationAggregate = async (
  token?: string | null
): Promise<DocumentationAggregate> => {
  const raw = await requestJson<RawDocsAggregateResponse>('/system/docs/aggregate', token ?? undefined);
  const services = Array.isArray(raw.services) ? raw.services.map(normaliseEntry) : [];
  return {
    generatedAt: raw.generated_at ?? null,
    summary: normaliseAggregateSummary(raw.summary),
    services,
    raw
  };
};
