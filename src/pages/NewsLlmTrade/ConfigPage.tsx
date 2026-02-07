import { useCallback, useEffect, useMemo, useState } from 'react';
import PageHeader from '../components/PageHeader';
import layoutStyles from '../PageLayout.module.css';
import NewsLlmTradeNav from './NewsLlmTradeNav';
import styles from './NewsLlmTrade.module.css';
import {
  fetchNewsLlmConfig,
  saveNewsLlmConfig,
  testNewsLlmPrompt,
  type NewsLlmConfig,
  type NewsLlmPromptTemplate
} from '@services/newsLlmTrade';
import { useAppSelector } from '@store/hooks';

const EMPTY_CONFIG: NewsLlmConfig = {
  symbols: [],
  llm: {
    url: '',
    token: '',
    model: '',
    timeoutSeconds: 30
  },
  prompts: [],
  activePromptId: null,
  marketData: null,
  positionData: null
};

const createPromptTemplate = (): NewsLlmPromptTemplate => {
  const suffix = Math.random().toString(16).slice(2, 8);
  return {
    id: `prompt-${Date.now()}-${suffix}`,
    name: '新模板',
    template: '请根据新闻内容输出交易信号，格式为 JSON：{symbol, action, confidence}。',
    updatedAt: new Date().toISOString()
  };
};

const formatJson = (value: Record<string, unknown> | null): string => {
  if (!value) {
    return '';
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return '';
  }
};

const parseJsonInput = (value: string, label: string): Record<string, unknown> | null => {
  if (!value.trim()) {
    return null;
  }
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    throw new Error(`${label} JSON 格式错误，请检查后再保存。`);
  }
};

function NewsLlmTradeConfigPage() {
  const token = useAppSelector((state) => state.auth.token);
  const [config, setConfig] = useState<NewsLlmConfig>(EMPTY_CONFIG);
  const [marketDataInput, setMarketDataInput] = useState('');
  const [positionDataInput, setPositionDataInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [testSample, setTestSample] = useState('以 NVDA 为例，输出今日新闻解读。');
  const [testStatus, setTestStatus] = useState<string | null>(null);

  const activePrompt = useMemo(
    () => config.prompts.find((prompt) => prompt.id === config.activePromptId) ?? null,
    [config.prompts, config.activePromptId]
  );

  const refreshConfig = useCallback(async () => {
    if (!token) {
      setError('当前尚未登录，无法读取配置。');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetchNewsLlmConfig(token);
      setConfig(response.config ?? EMPTY_CONFIG);
      setMarketDataInput(formatJson(response.config?.marketData ?? null));
      setPositionDataInput(formatJson(response.config?.positionData ?? null));
    } catch (err) {
      setError(err instanceof Error ? err.message : '读取配置失败');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void refreshConfig();
  }, [refreshConfig]);

  const updateSymbol = (index: number, updates: Partial<NewsLlmConfig['symbols'][number]>) => {
    setConfig((prev) => {
      const next = [...prev.symbols];
      next[index] = { ...next[index], ...updates };
      return { ...prev, symbols: next };
    });
  };

  const addSymbol = () => {
    setConfig((prev) => ({
      ...prev,
      symbols: [...prev.symbols, { symbol: '', intervalSeconds: 900, enabled: true }]
    }));
  };

  const removeSymbol = (index: number) => {
    setConfig((prev) => ({
      ...prev,
      symbols: prev.symbols.filter((_, idx) => idx !== index)
    }));
  };

  const updatePrompt = (index: number, updates: Partial<NewsLlmPromptTemplate>) => {
    setConfig((prev) => {
      const next = [...prev.prompts];
      next[index] = { ...next[index], ...updates, updatedAt: new Date().toISOString() };
      return { ...prev, prompts: next };
    });
  };

  const addPrompt = () => {
    const nextPrompt = createPromptTemplate();
    setConfig((prev) => ({
      ...prev,
      prompts: [...prev.prompts, nextPrompt],
      activePromptId: prev.activePromptId ?? nextPrompt.id
    }));
  };

  const removePrompt = (index: number) => {
    setConfig((prev) => {
      const next = prev.prompts.filter((_, idx) => idx !== index);
      const removed = prev.prompts[index];
      const nextActive = prev.activePromptId === removed?.id ? next[0]?.id ?? null : prev.activePromptId;
      return { ...prev, prompts: next, activePromptId: nextActive };
    });
  };

  const handleSave = async () => {
    if (!token) {
      setError('当前尚未登录，无法保存配置。');
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const marketData = parseJsonInput(marketDataInput, '市场数据');
      const positionData = parseJsonInput(positionDataInput, '持仓数据');
      const payload: NewsLlmConfig = {
        ...config,
        marketData,
        positionData
      };
      const response = await saveNewsLlmConfig(token, payload);
      setConfig(response.config ?? payload);
      setSuccess('配置已保存并写入 data 目录。');
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!token) {
      setTestStatus('当前尚未登录，无法执行测试。');
      return;
    }
    setTestStatus('正在调用 LLM 服务进行测试…');
    try {
      const result = await testNewsLlmPrompt(token, {
        promptId: config.activePromptId,
        sample: testSample
      });
      setTestStatus(result.ok ? `测试成功：${result.message}` : `测试失败：${result.message}`);
    } catch (err) {
      setTestStatus(err instanceof Error ? err.message : '测试失败');
    }
  };

  return (
    <div className={layoutStyles.page}>
      <PageHeader
        title="News LLM Trade"
        description="维护新闻 LLM 交易配置、prompt 模板与本地 data JSON。"
        actions={[
          {
            label: loading ? '刷新中…' : '刷新配置',
            variant: 'outline',
            onClick: refreshConfig,
            disabled: loading
          }
        ]}
      />
      <div className={styles.pageContent}>
        <NewsLlmTradeNav />

        <section className={styles.panel}>
          <div className={styles.sectionHeader}>
            <div>
              <h2 className={styles.sectionTitle}>订阅标的与抓取频率</h2>
              <div className={styles.sectionHint}>控制新闻订阅 symbol 与抓取间隔（秒）。</div>
            </div>
            <button type="button" className={styles.secondaryButton} onClick={addSymbol}>
              新增标的
            </button>
          </div>
          {config.symbols.length === 0 ? (
            <div className={styles.sectionHint}>暂无订阅标的，请点击“新增标的”添加。</div>
          ) : (
            <div className={styles.cardGrid}>
              {config.symbols.map((item, index) => (
                <div key={`${item.symbol}-${index}`} className={styles.card}>
                  <div className={styles.field}>
                    <label className={styles.label}>Symbol</label>
                    <input
                      className={styles.input}
                      value={item.symbol}
                      onChange={(event) => updateSymbol(index, { symbol: event.target.value })}
                      placeholder="AAPL / NVDA"
                    />
                  </div>
                  <div className={styles.field}>
                    <label className={styles.label}>抓取间隔（秒）</label>
                    <input
                      type="number"
                      className={styles.input}
                      value={item.intervalSeconds}
                      onChange={(event) => updateSymbol(index, { intervalSeconds: Number(event.target.value) })}
                    />
                  </div>
                  <div className={styles.symbolRow}>
                    <label className={styles.symbolToggle}>
                      <input
                        type="checkbox"
                        checked={item.enabled}
                        onChange={(event) => updateSymbol(index, { enabled: event.target.checked })}
                      />
                      启用订阅
                    </label>
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      onClick={() => removeSymbol(index)}
                    >
                      移除
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className={styles.panel}>
          <div className={styles.sectionHeader}>
            <div>
              <h2 className={styles.sectionTitle}>LLM 服务配置</h2>
              <div className={styles.sectionHint}>配置调用地址、Token 与模型参数。</div>
            </div>
          </div>
          <div className={styles.formGrid}>
            <div className={styles.field}>
              <label className={styles.label}>LLM URL</label>
              <input
                className={styles.input}
                value={config.llm.url}
                onChange={(event) => setConfig((prev) => ({ ...prev, llm: { ...prev.llm, url: event.target.value } }))}
                placeholder="https://api.openai.com/v1/chat/completions"
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>访问 Token</label>
              <input
                className={styles.input}
                value={config.llm.token}
                onChange={(event) => setConfig((prev) => ({ ...prev, llm: { ...prev.llm, token: event.target.value } }))}
                placeholder="sk-..."
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>模型名称</label>
              <input
                className={styles.input}
                value={config.llm.model}
                onChange={(event) => setConfig((prev) => ({ ...prev, llm: { ...prev.llm, model: event.target.value } }))}
                placeholder="gpt-4o-mini"
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>超时（秒）</label>
              <input
                type="number"
                className={styles.input}
                value={config.llm.timeoutSeconds}
                onChange={(event) =>
                  setConfig((prev) => ({
                    ...prev,
                    llm: { ...prev.llm, timeoutSeconds: Number(event.target.value) }
                  }))
                }
              />
            </div>
          </div>
        </section>

        <section className={styles.panel}>
          <div className={styles.sectionHeader}>
            <div>
              <h2 className={styles.sectionTitle}>Prompt 模板管理</h2>
              <div className={styles.sectionHint}>维护模板内容并指定当前使用模板。</div>
            </div>
            <button type="button" className={styles.secondaryButton} onClick={addPrompt}>
              新增模板
            </button>
          </div>
          {config.prompts.length === 0 ? (
            <div className={styles.sectionHint}>暂无模板，请点击“新增模板”创建。</div>
          ) : (
            <div className={styles.cardGrid}>
              {config.prompts.map((prompt, index) => (
                <div key={prompt.id} className={styles.card}>
                  <div className={styles.field}>
                    <label className={styles.label}>模板名称</label>
                    <input
                      className={styles.input}
                      value={prompt.name}
                      onChange={(event) => updatePrompt(index, { name: event.target.value })}
                    />
                  </div>
                  <div className={styles.field}>
                    <label className={styles.label}>模板内容</label>
                    <textarea
                      className={styles.textarea}
                      value={prompt.template}
                      onChange={(event) => updatePrompt(index, { template: event.target.value })}
                    />
                  </div>
                  <div className={styles.sectionHint}>更新时间：{prompt.updatedAt ? new Date(prompt.updatedAt).toLocaleString() : '—'}</div>
                  <div className={styles.buttonRow}>
                    <button
                      type="button"
                      className={styles.primaryButton}
                      onClick={() => setConfig((prev) => ({ ...prev, activePromptId: prompt.id }))}
                    >
                      {config.activePromptId === prompt.id ? '当前模板' : '设为当前'}
                    </button>
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      onClick={() => removePrompt(index)}
                    >
                      删除
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className={styles.field}>
            <label className={styles.label}>当前模板预览</label>
            <pre className={styles.codeBlock}>{activePrompt?.template ?? '未选择模板'}</pre>
          </div>
          <div className={styles.field}>
            <label className={styles.label}>测试输入</label>
            <textarea
              className={styles.textarea}
              value={testSample}
              onChange={(event) => setTestSample(event.target.value)}
            />
          </div>
          <div className={styles.buttonRow}>
            <button type="button" className={styles.secondaryButton} onClick={handleTest}>
              发送测试
            </button>
            {testStatus ? <span className={styles.sectionHint}>{testStatus}</span> : null}
          </div>
        </section>

        <section className={styles.panel}>
          <div className={styles.sectionHeader}>
            <div>
              <h2 className={styles.sectionTitle}>市场数据与持仓数据</h2>
              <div className={styles.sectionHint}>直接编辑 data 目录中的 JSON 配置内容。</div>
            </div>
          </div>
          <div className={styles.formGrid}>
            <div className={styles.field}>
              <label className={styles.label}>市场数据 JSON</label>
              <textarea
                className={styles.textarea}
                value={marketDataInput}
                onChange={(event) => setMarketDataInput(event.target.value)}
                placeholder='{ "symbols": ["AAPL", "NVDA"], "source": "news" }'
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>持仓数据 JSON</label>
              <textarea
                className={styles.textarea}
                value={positionDataInput}
                onChange={(event) => setPositionDataInput(event.target.value)}
                placeholder='{ "positions": [{ "symbol": "AAPL", "qty": 10 }] }'
              />
            </div>
          </div>
        </section>

        <section className={styles.panel}>
          <div className={styles.sectionHeader}>
            <div>
              <h2 className={styles.sectionTitle}>保存配置</h2>
              <div className={styles.sectionHint}>保存后将写入 data 目录 JSON，并同步到新闻服务。</div>
            </div>
          </div>
          <div className={styles.buttonRow}>
            <button type="button" className={styles.primaryButton} onClick={handleSave} disabled={saving}>
              {saving ? '保存中…' : '保存配置'}
            </button>
            <button type="button" className={styles.secondaryButton} onClick={refreshConfig} disabled={loading}>
              重新加载
            </button>
          </div>
          {success ? <div className={`${styles.statusMessage} ${styles.statusSuccess}`}>{success}</div> : null}
          {error ? <div className={`${styles.statusMessage} ${styles.statusError}`}>{error}</div> : null}
        </section>
      </div>
    </div>
  );
}

export default NewsLlmTradeConfigPage;
