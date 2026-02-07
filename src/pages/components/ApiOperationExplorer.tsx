import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import type { ServiceDocEntry } from '@services/documentationApi';
import styles from './ApiOperationExplorer.module.css';

interface AuthHeaderConfig {
  name: string;
  value: string;
}

interface ApiParameter {
  name: string;
  in: 'path' | 'query';
  required: boolean;
  description?: string;
  example?: unknown;
  schema?: Record<string, unknown> | null;
}

interface RequestBodyConfig {
  mediaType: string;
  example: string;
  required: boolean;
}

interface ApiOperation {
  id: string;
  method: string;
  path: string;
  summary: string;
  description?: string;
  parameters: ApiParameter[];
  requestBody?: RequestBodyConfig;
  servers: string[];
}

interface ApiOperationExplorerProps {
  services: ServiceDocEntry[];
  authHeader: AuthHeaderConfig | null;
}

interface PreparedRequest {
  url: string;
  headers: Record<string, string>;
  body?: string;
  bodyDisplay?: string;
  hasAuthHeader: boolean;
  path: string;
  queryString: string;
}

type RequestBuildResult =
  | {
      ok: true;
      request: PreparedRequest;
      issues: string[];
    }
  | {
      ok: false;
      request: PreparedRequest | null;
      issues: string[];
      error: string;
    };

type SpecState =
  | { status: 'idle'; spec: null; error?: undefined }
  | { status: 'loading'; spec: null; error?: undefined }
  | { status: 'ready'; spec: Record<string, unknown>; error?: undefined }
  | { status: 'error'; spec: null; error: string };

interface ResponseState {
  status: number;
  statusText: string;
  headers: [string, string][];
  body: string;
  durationMs: number;
}

const httpMethods = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head'];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const toJsonString = (value: unknown): string => {
  if (typeof value === 'string') {
    return value;
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch (error) {
    console.warn('无法格式化示例', error);
    return '';
  }
};

const generateExampleFromSchema = (schema: Record<string, unknown> | undefined, depth = 0): unknown => {
  if (!schema || depth > 6) {
    return undefined;
  }
  if ('example' in schema && schema.example !== undefined) {
    return schema.example;
  }
  if ('default' in schema && schema.default !== undefined) {
    return schema.default;
  }
  const type = typeof schema.type === 'string' ? schema.type : undefined;
  if (type === 'object' || ('properties' in schema && isRecord(schema.properties))) {
    const properties = isRecord(schema.properties) ? schema.properties : {};
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(properties)) {
      if (isRecord(value)) {
        result[key] = generateExampleFromSchema(value, depth + 1);
      }
    }
    return result;
  }
  if (type === 'array' || ('items' in schema && isRecord(schema.items))) {
    const item = isRecord(schema.items) ? schema.items : undefined;
    const example = generateExampleFromSchema(item, depth + 1);
    return example === undefined ? [] : [example];
  }
  if (type === 'number' || type === 'integer') {
    return 0;
  }
  if (type === 'boolean') {
    return false;
  }
  return '';
};

const normaliseRequestBody = (operation: Record<string, unknown>): RequestBodyConfig | undefined => {
  if (!('requestBody' in operation) || !isRecord(operation.requestBody)) {
    return undefined;
  }
  const requestBody = operation.requestBody;
  const required = Boolean(requestBody.required);
  if (!('content' in requestBody) || !isRecord(requestBody.content)) {
    return undefined;
  }
  const entries = Object.entries(requestBody.content).filter((entry): entry is [string, Record<string, unknown>] => {
    return typeof entry[0] === 'string' && isRecord(entry[1]);
  });
  if (entries.length === 0) {
    return undefined;
  }
  const [mediaType, schemaWrapper] = entries[0];
  let example: string | undefined;
  if ('example' in schemaWrapper && schemaWrapper.example !== undefined) {
    example = toJsonString(schemaWrapper.example);
  } else if ('examples' in schemaWrapper && isRecord(schemaWrapper.examples)) {
    const first = Object.values(schemaWrapper.examples)[0];
    if (isRecord(first) && first.value !== undefined) {
      example = toJsonString(first.value);
    }
  }
  if (!example && 'schema' in schemaWrapper && isRecord(schemaWrapper.schema)) {
    const schemaExample = generateExampleFromSchema(schemaWrapper.schema, 0);
    if (schemaExample !== undefined) {
      example = toJsonString(schemaExample);
    }
  }
  return {
    mediaType,
    example: example ?? '',
    required
  };
};

const normaliseParameters = (
  pathItem: Record<string, unknown> | undefined,
  operation: Record<string, unknown>
): ApiParameter[] => {
  const collectParameters = (value: unknown): ApiParameter[] => {
    if (!Array.isArray(value)) {
      return [];
    }
    const results: ApiParameter[] = [];
    for (const item of value) {
      if (!isRecord(item) || typeof item.name !== 'string' || typeof item.in !== 'string') {
        continue;
      }
      const location = item.in as string;
      if (location !== 'path' && location !== 'query') {
        continue;
      }
      const parameter: ApiParameter = {
        name: item.name,
        in: location,
        required: Boolean(item.required),
        schema: isRecord(item.schema) ? item.schema : null
      };
      if (typeof item.description === 'string') {
        parameter.description = item.description;
      }
      if (item.example !== undefined) {
        parameter.example = item.example;
      }
      results.push(parameter);
    }
    return results;
  };

  const pathParams = collectParameters(pathItem?.parameters);
  const operationParams = collectParameters(operation.parameters);
  const merged = [...pathParams];

  for (const item of operationParams) {
    if (!merged.find((existing) => existing.name === item.name && existing.in === item.in)) {
      merged.push(item);
    }
  }

  return merged;
};

const normaliseOperations = (
  serviceName: string,
  spec: Record<string, unknown>
): ApiOperation[] => {
  if (!isRecord(spec) || !isRecord(spec.paths)) {
    return [];
  }
  const paths = spec.paths;
  const operations: ApiOperation[] = [];
  for (const [pathKey, pathValue] of Object.entries(paths)) {
    if (!isRecord(pathValue)) {
      continue;
    }
    for (const method of httpMethods) {
      const operationValue = pathValue[method];
      if (!isRecord(operationValue)) {
        continue;
      }
      const parameters = normaliseParameters(pathValue, operationValue);
      const requestBody = normaliseRequestBody(operationValue);
      const servers: string[] = [];
      const extractServers = (value: unknown) => {
        if (!Array.isArray(value)) {
          return;
        }
        for (const entry of value) {
          if (isRecord(entry) && typeof entry.url === 'string') {
            servers.push(entry.url);
          }
        }
      };
      if ('servers' in operationValue) {
        extractServers(operationValue.servers);
      }
      if ('servers' in spec) {
        extractServers(spec.servers);
      }
      const summary = typeof operationValue.summary === 'string' ? operationValue.summary : `${method.toUpperCase()} ${pathKey}`;
      const description = typeof operationValue.description === 'string' ? operationValue.description : undefined;
      operations.push({
        id: `${serviceName}:${method}:${pathKey}`,
        method: method.toUpperCase(),
        path: pathKey,
        summary,
        description,
        parameters,
        requestBody,
        servers
      });
    }
  }
  return operations.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
};

const buildDefaultAuthHeader = (authHeader: AuthHeaderConfig | null): Record<string, string> | undefined => {
  if (!authHeader) {
    return undefined;
  }
  const trimmedName = authHeader.name.trim();
  if (!trimmedName) {
    return undefined;
  }
  return { [trimmedName]: authHeader.value };
};

const stringifyHeaders = (headers: Headers): [string, string][] => {
  const entries: [string, string][] = [];
  headers.forEach((value, key) => {
    entries.push([key, value]);
  });
  return entries;
};

const buildInitialParamValue = (param: ApiParameter): string => {
  if (param.example !== undefined) {
    if (typeof param.example === 'string') {
      return param.example;
    }
    try {
      return JSON.stringify(param.example);
    } catch (error) {
      console.warn('无法序列化参数示例', error);
    }
  }
  if (param.schema && 'default' in param.schema && param.schema.default !== undefined) {
    const defaultValue = param.schema.default;
    if (typeof defaultValue === 'string') {
      return defaultValue;
    }
    try {
      return JSON.stringify(defaultValue);
    } catch (error) {
      console.warn('无法序列化参数默认值', error);
    }
  }
  return '';
};

const applyPathParameters = (path: string, params: Record<string, string>): string => {
  return path.replace(/\{([^}]+)\}/g, (match, key) => {
    if (key in params && params[key]) {
      return encodeURIComponent(params[key]);
    }
    return match;
  });
};

function ApiOperationExplorer({ services, authHeader }: ApiOperationExplorerProps) {
  const [specStates, setSpecStates] = useState<Record<string, SpecState>>(() => {
    const initial: Record<string, SpecState> = {};
    for (const service of services) {
      const openapiSpec = service.openapi;
      if (openapiSpec) {
        initial[service.name] = { status: 'ready', spec: openapiSpec };
      } else if (service.url) {
        initial[service.name] = { status: 'idle', spec: null };
      } else {
        initial[service.name] = {
          status: 'error',
          spec: null,
          error: '该服务未提供 OpenAPI 地址'
        };
      }
    }
    return initial;
  });

  useEffect(() => {
    setSpecStates((prev) => {
      const next: Record<string, SpecState> = {};
      for (const service of services) {
        const existing = prev[service.name];
        const openapiSpec = service.openapi;
        if (openapiSpec) {
          next[service.name] = { status: 'ready', spec: openapiSpec };
          continue;
        }
        if (existing) {
          next[service.name] = existing;
        } else if (service.url) {
          next[service.name] = { status: 'idle', spec: null };
        } else {
          next[service.name] = {
            status: 'error',
            spec: null,
            error: '该服务未提供 OpenAPI 地址'
          };
        }
      }
      return next;
    });
  }, [services]);

  const [selectedService, setSelectedService] = useState<string>(() => services[0]?.name ?? '');
  useEffect(() => {
    if (!selectedService && services.length > 0) {
      setSelectedService(services[0].name);
      return;
    }
    if (selectedService && !services.some((item) => item.name === selectedService)) {
      setSelectedService(services[0]?.name ?? '');
    }
  }, [selectedService, services]);

  const service = useMemo(
    () => services.find((item) => item.name === selectedService) ?? services[0],
    [selectedService, services]
  );

  const specState = service ? specStates[service.name] : undefined;

  useEffect(() => {
    if (!service) {
      return;
    }
    const openapiSpec = service.openapi;
    if (openapiSpec) {
      if (specState?.status === 'ready') {
        return;
      }
      setSpecStates((prev) => ({
        ...prev,
        [service.name]: { status: 'ready', spec: openapiSpec }
      }));
      return;
    }
    if (specState?.status === 'loading' || specState?.status === 'ready') {
      return;
    }
    if (!service.url) {
      setSpecStates((prev) => ({
        ...prev,
        [service.name]: {
          status: 'error',
          spec: null,
          error: '该服务未提供 OpenAPI 地址'
        }
      }));
      return;
    }
    const controller = new AbortController();
    setSpecStates((prev) => ({
      ...prev,
      [service.name]: { status: 'loading', spec: null }
    }));

    const fetchSpec = async () => {
      try {
        const headers: Record<string, string> = { Accept: 'application/json' };
        const defaultAuth = buildDefaultAuthHeader(authHeader);
        if (defaultAuth) {
          Object.assign(headers, defaultAuth);
        }
        const response = await fetch(service.url!, {
          method: 'GET',
          headers,
          signal: controller.signal,
          credentials: 'include'
        });
        if (!response.ok) {
          throw new Error(`获取 OpenAPI 规范失败（${response.status}）`);
        }
        const data = (await response.json()) as Record<string, unknown>;
        setSpecStates((prev) => ({
          ...prev,
          [service.name]: { status: 'ready', spec: data }
        }));
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        const message = error instanceof Error ? error.message : '加载 OpenAPI 规范失败';
        setSpecStates((prev) => ({
          ...prev,
          [service.name]: { status: 'error', spec: null, error: message }
        }));
      }
    };

    void fetchSpec();

    return () => {
      controller.abort();
    };
  }, [service, specState?.status, authHeader]);

  const spec = useMemo(() => {
    if (!service) {
      return null;
    }
    const state = specStates[service.name];
    if (state?.status === 'ready') {
      return state.spec;
    }
    if (service.openapi) {
      return service.openapi;
    }
    return null;
  }, [service, specStates]);

  const operations = useMemo(() => {
    if (!service || !spec) {
      return [];
    }
    return normaliseOperations(service.name, spec);
  }, [service, spec]);

  const isSpecLoading = specState?.status === 'loading';
  const specError = specState?.status === 'error' ? specState.error : null;
  const [selectedOperationId, setSelectedOperationId] = useState<string>(() => operations[0]?.id ?? '');
  const operation = useMemo(() => operations.find((item) => item.id === selectedOperationId) ?? operations[0], [operations, selectedOperationId]);

  const [baseUrl, setBaseUrl] = useState<string>(() => {
    if (operation?.servers.length) {
      return operation.servers[0];
    }
    if (typeof window !== 'undefined') {
      return window.location.origin;
    }
    return '';
  });

  const [paramValues, setParamValues] = useState<Record<string, string>>({});
  const [requestBody, setRequestBody] = useState<string>('');
  const [response, setResponse] = useState<ResponseState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (operations.length === 0) {
      setSelectedOperationId('');
      return;
    }
    setSelectedOperationId((current) => {
      if (current && operations.some((item) => item.id === current)) {
        return current;
      }
      return operations[0]?.id ?? '';
    });
  }, [operations]);

  useEffect(() => {
    if (!operation) {
      return;
    }
    if (operation.servers.length > 0) {
      setBaseUrl(operation.servers[0]);
    } else if (typeof window !== 'undefined') {
      setBaseUrl(window.location.origin);
    } else {
      setBaseUrl('');
    }
    const nextValues: Record<string, string> = {};
    for (const param of operation.parameters) {
      nextValues[param.name] = buildInitialParamValue(param);
    }
    setParamValues(nextValues);
    setRequestBody(operation.requestBody?.example ?? '');
    setResponse(null);
    setError(null);
  }, [operation]);

  const handleServiceChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setSelectedService(event.target.value);
    setResponse(null);
    setError(null);
    setParamValues({});
    setRequestBody('');
    setBaseUrl('');
  };

  const handleOperationChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setSelectedOperationId(event.target.value);
    setResponse(null);
    setError(null);
  };

  const handleParamChange = (name: string) => (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setParamValues((prev) => ({ ...prev, [name]: value }));
  };

  const handleRequestBodyChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setRequestBody(event.target.value);
  };

  const handleReloadSpec = () => {
    if (!service) {
      return;
    }
    setSpecStates((prev) => ({
      ...prev,
      [service.name]: service.url
        ? { status: 'idle', spec: null }
        : { status: 'error', spec: null, error: '该服务未提供 OpenAPI 地址' }
    }));
    setResponse(null);
    setError(null);
    setSelectedOperationId('');
    setParamValues({});
    setRequestBody('');
    setBaseUrl('');
  };

  const buildPreparedRequest = useMemo(() => {
    if (!operation) {
      return null;
    }

    const build = (strict: boolean): RequestBuildResult => {
      const trimmedBase = baseUrl.trim().replace(/\/$/, '');
      const resolvedPath = applyPathParameters(operation.path, paramValues);
      const pathWithLeadingSlash = resolvedPath.startsWith('/') ? resolvedPath : `/${resolvedPath}`;
      const queryParams = operation.parameters.filter((param) => param.in === 'query');
      const searchParams = new URLSearchParams();
      for (const param of queryParams) {
        const rawValue = paramValues[param.name];
        if (!rawValue) {
          continue;
        }
        searchParams.append(param.name, rawValue);
      }
      const queryString = searchParams.toString();
      const headers: Record<string, string> = {
        Accept: 'application/json'
      };
      if (operation.requestBody?.mediaType) {
        headers['Content-Type'] = operation.requestBody.mediaType;
      }
      const defaultAuth = buildDefaultAuthHeader(authHeader);
      const hasAuthHeader = Boolean(defaultAuth);
      if (defaultAuth) {
        Object.assign(headers, defaultAuth);
      }

      const requiredPathParams = operation.parameters.filter((param) => param.in === 'path' && param.required);
      const missingPathParams = requiredPathParams
        .map((param) => param.name)
        .filter((name) => !paramValues[name]);

      let body: string | undefined;
      let bodyDisplay: string | undefined;
      let bodyIssue: string | null = null;
      if (operation.requestBody) {
        const mediaType = operation.requestBody.mediaType;
        const trimmedBody = requestBody.trim();
        if (!trimmedBody) {
          if (operation.requestBody.required) {
            bodyIssue = '请求体为必填项';
          }
        } else if (mediaType.includes('json')) {
          try {
            const parsed = JSON.parse(trimmedBody);
            body = JSON.stringify(parsed);
            bodyDisplay = JSON.stringify(parsed, null, 2);
          } catch (parseError) {
            console.warn('请求体 JSON 解析失败', parseError);
            bodyIssue = '请求体不是合法的 JSON 格式';
            bodyDisplay = trimmedBody;
          }
        } else {
          body = trimmedBody;
          bodyDisplay = trimmedBody;
        }
        if (!bodyDisplay && trimmedBody) {
          bodyDisplay = trimmedBody;
        }
      }

      const issues: string[] = [];
      if (!trimmedBase) {
        issues.push('请先填写目标地址');
      }
      if (missingPathParams.length > 0) {
        issues.push(`缺少路径参数：${missingPathParams.join(', ')}`);
      }
      if (bodyIssue) {
        issues.push(bodyIssue);
      }

      const request: PreparedRequest = {
        url: `${trimmedBase}${pathWithLeadingSlash}${queryString ? `?${queryString}` : ''}`,
        headers,
        body,
        bodyDisplay,
        hasAuthHeader,
        path: pathWithLeadingSlash,
        queryString
      };

      if (strict && issues.length > 0) {
        return {
          ok: false,
          request,
          issues,
          error: issues[0]
        };
      }

      return {
        ok: true,
        request,
        issues
      };
    };

    return { build };
  }, [operation, baseUrl, paramValues, requestBody, authHeader]);

  const requestPreview = useMemo<RequestBuildResult | null>(() => {
    if (!operation || !buildPreparedRequest) {
      return null;
    }
    return buildPreparedRequest.build(false);
  }, [buildPreparedRequest, operation]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setResponse(null);
    if (!operation || !buildPreparedRequest) {
      return;
    }

    const result = buildPreparedRequest.build(true);
    if (!result.ok) {
      setError(result.error);
      return;
    }

    const { request } = result;

    try {
      setLoading(true);
      const startedAt = performance.now();
      const options: RequestInit = {
        method: operation.method,
        headers: request.headers,
        credentials: 'include'
      };
      if (request.body !== undefined) {
        options.body = request.body;
      }
      const response = await fetch(request.url, options);
      const durationMs = performance.now() - startedAt;
      const contentType = response.headers.get('content-type') ?? '';
      let bodyText = await response.text();
      if (contentType.includes('application/json')) {
        try {
          bodyText = JSON.stringify(JSON.parse(bodyText), null, 2);
        } catch (error) {
          console.warn('响应不是合法 JSON', error);
        }
      }
      setResponse({
        status: response.status,
        statusText: response.statusText,
        headers: stringifyHeaders(response.headers),
        body: bodyText,
        durationMs
      });
    } catch (fetchError) {
      const message = fetchError instanceof Error ? fetchError.message : '请求发送失败';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  if (!services.length) {
    return (
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>接口调试</h2>
        <p className={styles.emptyState}>暂无可用的 OpenAPI 规范，无法提供接口调试功能。</p>
      </section>
    );
  }

  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        <div>
          <h2 className={styles.sectionTitle}>接口调试</h2>
          <p className={styles.sectionDescription}>
            选择服务与接口，实时发起请求并查看响应结果。调试请求将复用上方设置的鉴权 Header。
          </p>
        </div>
      </div>
      <form className={styles.form} onSubmit={handleSubmit}>
        <div className={styles.fieldRow}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>选择服务</span>
            <select className={styles.select} value={service?.name ?? ''} onChange={handleServiceChange}>
              {services.map((item) => (
                <option key={item.name} value={item.name}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>选择接口</span>
            <select
              className={styles.select}
              value={operation?.id ?? ''}
              onChange={handleOperationChange}
              disabled={operations.length === 0}
            >
              {operations.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.method} {item.path}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>目标地址</span>
            <input
              className={styles.input}
              value={baseUrl}
              onChange={(event: ChangeEvent<HTMLInputElement>) => setBaseUrl(event.target.value)}
              placeholder="例如 http://localhost:8000"
              disabled={!operation}
            />
          </label>
        </div>

        {isSpecLoading ? (
          <div className={styles.infoBanner}>正在加载 {service?.name} 的 OpenAPI 规范...</div>
        ) : null}

        {specError ? (
          <div className={styles.errorBanner}>
            <span>{specError}</span>
            {service?.url ? (
              <button type="button" className={styles.retryButton} onClick={handleReloadSpec}>
                重新加载
              </button>
            ) : null}
          </div>
        ) : null}

        {!isSpecLoading && !specError && spec && operations.length === 0 ? (
          <p className={styles.emptyState}>该服务的 OpenAPI 文档中未找到可调用的接口。</p>
        ) : null}

        {operation ? (
          <div className={styles.operationMeta}>
            <span className={clsx(styles.methodBadge, styles[`method${operation.method}` as keyof typeof styles] ?? '')}>
              {operation.method}
            </span>
            <code className={styles.path}>{operation.path}</code>
            {operation.summary ? <span className={styles.summary}>{operation.summary}</span> : null}
          </div>
        ) : null}

        {operation?.description ? <p className={styles.description}>{operation.description}</p> : null}

        {operation && operation.parameters.length > 0 ? (
          <div className={styles.parametersSection}>
            <h3 className={styles.subSectionTitle}>请求参数</h3>
            <div className={styles.parametersGrid}>
              {operation.parameters.map((param) => (
                <label key={`${param.in}-${param.name}`} className={styles.parameterField}>
                  <span className={styles.parameterLabel}>
                    {param.name}
                    <span className={styles.parameterMeta}>（{param.in === 'path' ? '路径' : '查询'}）</span>
                    {param.required ? <span className={styles.required}>*</span> : null}
                  </span>
                  <input
                    className={styles.input}
                    value={paramValues[param.name] ?? ''}
                    onChange={handleParamChange(param.name)}
                    placeholder={param.description}
                  />
                  {param.description ? <span className={styles.parameterHelp}>{param.description}</span> : null}
                </label>
              ))}
            </div>
          </div>
        ) : null}

        {operation?.requestBody ? (
          <div className={styles.bodySection}>
            <div className={styles.bodyHeader}>
              <h3 className={styles.subSectionTitle}>请求体</h3>
              <span className={styles.bodyMeta}>{operation.requestBody.mediaType}</span>
            </div>
            <textarea
              className={styles.textarea}
              value={requestBody}
              onChange={handleRequestBodyChange}
              rows={10}
              spellCheck={false}
              placeholder={operation.requestBody.required ? '请输入请求体内容' : '可选'}
            />
          </div>
        ) : null}

        {operation && requestPreview ? (
          <div className={styles.previewSection}>
            <h3 className={styles.subSectionTitle}>请求预览</h3>
            <div className={styles.previewGrid}>
              <div className={styles.previewRow}>
                <span className={styles.previewLabel}>方法</span>
                <span className={styles.previewValue}>{operation.method}</span>
              </div>
              <div className={styles.previewRow}>
                <span className={styles.previewLabel}>最终 URL</span>
                <code className={styles.previewValue}>
                  {requestPreview.request?.url || '请完善请求信息'}
                </code>
              </div>
            </div>
            {requestPreview.request?.hasAuthHeader ? (
              <div className={styles.previewHint}>请求将自动携带鉴权 Header</div>
            ) : null}
            {requestPreview.request ? (
              <details className={styles.previewDetails}>
                <summary>请求 Headers</summary>
                <table className={styles.previewHeadersTable}>
                  <tbody>
                    {Object.entries(requestPreview.request.headers).map(([key, value]) => (
                      <tr key={key}>
                        <th>{key}</th>
                        <td>{value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            ) : null}
            {requestPreview.request?.bodyDisplay ? (
              <details className={styles.previewBody}>
                <summary>请求体示例</summary>
                <pre>{requestPreview.request.bodyDisplay}</pre>
              </details>
            ) : null}
            {requestPreview.issues.length > 0 ? (
              <ul className={styles.previewIssues}>
                {requestPreview.issues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        <div className={styles.actionsRow}>
          <button type="submit" className={styles.submitButton} disabled={loading || !operation}>
            {loading ? '发送中...' : '发送请求'}
          </button>
        </div>
      </form>

      {error ? <div className={styles.errorBanner}>{error}</div> : null}

      {response ? (
        <div className={styles.responseSection}>
          <div className={styles.responseHeader}>
            <span className={clsx(styles.statusBadge, response.status >= 200 && response.status < 300 ? styles.statusSuccess : styles.statusError)}>
              {response.status} {response.statusText}
            </span>
            <span className={styles.responseMeta}>耗时：{response.durationMs.toFixed(0)} ms</span>
          </div>
          <details className={styles.responseDetails}>
            <summary>响应 Headers</summary>
            <table className={styles.responseHeadersTable}>
              <tbody>
                {response.headers.map(([key, value]) => (
                  <tr key={key}>
                    <th>{key}</th>
                    <td>{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
          <div className={styles.responseBody}>
            <pre>{response.body || '（响应为空）'}</pre>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export default ApiOperationExplorer;
