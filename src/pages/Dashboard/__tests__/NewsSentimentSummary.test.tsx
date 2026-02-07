import React from 'react';
import { cleanup, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { JSDOM } from 'jsdom';
import NewsSentimentSummary from '../components/NewsSentimentSummary';
import type { NewsOverviewPayload } from '@services/integration';

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

const overview: NewsOverviewPayload = {
  activeModel: {
    version: 'news-v3',
    description: 'latest sentiment model',
    metrics: { accuracy: 0.83 },
    registeredAt: '2024-05-01T00:00:00Z'
  },
  symbolHeat: [
    { symbol: 'BTC-USDT', articles: 6, avgSentiment: 0.32 },
    { symbol: 'ETH-USDT', articles: 4, avgSentiment: -0.12 }
  ],
  topHeadlines: [
    {
      id: 'h1',
      title: 'Bitcoin surges as inflows accelerate',
      sentiment: 0.42,
      publishedAt: '2024-05-01T02:00:00Z',
      source: 'macro-feed',
      symbols: ['BTC-USDT']
    }
  ],
  recentSignals: [
    {
      id: 'sig-1',
      probability: 0.74,
      rating: 4,
      symbols: ['BTC-USDT'],
      modelVersion: 'news-v3',
      createdAt: '2024-05-01T02:05:00Z'
    }
  ],
  pendingTrainingJobs: 2
};

(async () => {
  const loadingView = render(<NewsSentimentSummary loading />, { wrapper: MemoryRouter });
  assert(loadingView.getByText('正在聚合新闻情绪数据...') !== null, '加载状态应提示文案');
  await cleanup();

  const dataView = render(<NewsSentimentSummary data={overview} />, { wrapper: MemoryRouter });
  const versionElements = dataView.getAllByText('news-v3');
  assert(versionElements.length >= 1, '应展示激活的新闻模型');
  assert(dataView.getByText(/待训练任务：/) !== null, '应展示待训练任务数量');
  assert(dataView.getByText(/Bitcoin surges/) !== null, '应显示焦点新闻标题');
  const link = dataView.getByText('查看详情').closest('a');
  assert(link != null && link.getAttribute('href') === '/news-workbench', '工作台链接应指向新闻工作台');
  await cleanup();
})();
