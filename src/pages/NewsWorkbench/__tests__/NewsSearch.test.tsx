import React from 'react';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { JSDOM } from 'jsdom';
import NewsSearch, { type NewsSearchFilters } from '../NewsSearch';
import type { NewsArticle, SentimentSignal } from '@services/newsService';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
const { window } = dom;

(globalThis as unknown as Record<string, unknown>).window = window;
(globalThis as unknown as Record<string, unknown>).document = window.document;
(globalThis as unknown as Record<string, unknown>).navigator = window.navigator;
(globalThis as unknown as Record<string, unknown>).HTMLElement = window.HTMLElement;
(globalThis as unknown as Record<string, unknown>).Node = window.Node;
(globalThis as unknown as Record<string, unknown>).getComputedStyle = window.getComputedStyle.bind(window);
(globalThis as unknown as Record<string, unknown>).requestAnimationFrame =
  window.requestAnimationFrame?.bind(window) ?? ((cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 16));
(globalThis as unknown as Record<string, unknown>).cancelAnimationFrame =
  window.cancelAnimationFrame?.bind(window) ?? ((id: number) => clearTimeout(id));

interface Assertion {
  (condition: unknown, message: string): asserts condition;
}

const assert: Assertion = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const createNewsSample = (): { news: NewsArticle[]; signals: SentimentSignal[] } => {
  const news: NewsArticle[] = [
    {
      id: 'news-1',
      title: '比特币站上新高',
      summary: '市场情绪高涨，资金涌入加密资产。',
      source: 'MockWire',
      symbols: ['BTC-USDT'],
      sentiment: 0.82,
      publishedAt: '2024-03-01T12:00:00Z'
    },
    {
      id: 'news-2',
      title: '监管趋严引发市场震荡',
      summary: '部分国家加强对加密货币监管，短期承压。',
      source: 'FinNews',
      symbols: ['BTC-USDT', 'ETH-USDT'],
      sentiment: -0.35,
      publishedAt: '2024-03-02T09:30:00Z'
    }
  ];
  const signals: SentimentSignal[] = [
    {
      id: 'signal-1',
      text: 'sample',
      probability: 0.76,
      rating: 4,
      symbols: ['BTC-USDT'],
      modelVersion: 'v1',
      createdAt: '2024-03-02T09:30:00Z',
      publishedAt: null
    },
    {
      id: 'signal-2',
      text: 'sample-2',
      probability: 0.24,
      rating: 2,
      symbols: ['ETH-USDT'],
      modelVersion: 'v1',
      createdAt: '2024-03-02T09:35:00Z',
      publishedAt: null
    }
  ];
  return { news, signals };
};

interface SubmitSpy {
  calls: NewsSearchFilters[];
  handler: (filters: NewsSearchFilters) => void;
}

const createSubmitSpy = (): SubmitSpy => {
  const calls: NewsSearchFilters[] = [];
  const handler = (filters: NewsSearchFilters) => {
    calls.push(filters);
  };
  return { calls, handler };
};

await (async () => {
  const { news, signals } = createNewsSample();
  const submitSpy = createSubmitSpy();

  const container = window.document.createElement('div');
  window.document.body.appendChild(container);

  const filters: NewsSearchFilters = { symbol: '', keyword: '', limit: 20 };

  const view = render(
    <NewsSearch
      filters={filters}
      loading={false}
      news={news}
      total={news.length}
      lastUpdated="2024-03-02T10:00:00Z"
      recentSignals={signals}
      onSearch={submitSpy.handler}
      error={null}
    />,
    { container }
  );

  assert(view.getByText(/比特币站上新高/) !== null, '应展示新闻标题');
  assert(view.getByText(/共返回 2/), '应显示统计信息');
  assert(view.getByText('样本数量') !== null, '应展示信号摘要');
  assert(view.getByText('0.50') !== null, '平均概率应按两条信号计算');

  const keywordInput = view.getByLabelText('关键词过滤') as HTMLInputElement;
  fireEvent.change(keywordInput, { target: { value: '监管' } });

  const symbolInput = view.getByLabelText('交易标的') as HTMLInputElement;
  fireEvent.change(symbolInput, { target: { value: 'eth-usdt' } });

  const limitInput = view.getByLabelText('返回条数') as HTMLInputElement;
  fireEvent.change(limitInput, { target: { value: '15' } });

  const submitButton = view.getByRole('button', { name: '执行检索' });
  fireEvent.click(submitButton);

  assert(submitSpy.calls.length === 1, '提交后应触发一次 onSearch');

  await cleanup();
})();

