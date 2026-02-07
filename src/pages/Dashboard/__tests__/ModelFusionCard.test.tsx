import React from 'react';
import { cleanup, render } from '@testing-library/react';
import { JSDOM } from 'jsdom';
import ModelFusionCard from '../components/ModelFusionCard';
import type { ModelOpsOverviewPayload } from '@services/integration';

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

const overview: ModelOpsOverviewPayload = {
  modelName: 'trend_probability',
  fusion: {
    enabled: true,
    strategy: 'late',
    confidenceThreshold: 0.7,
    newsWeight: 0.45,
    newsModelVersion: 'news-v2'
  },
  activeModel: {
    modelName: 'trend_probability',
    version: 'v3',
    activatedAt: '2024-04-30T08:30:00Z',
    reason: 'deploy best run',
    metrics: {
      accuracy: 0.9143,
      f1: 0.8721
    },
    newsModelVersion: 'news-v2'
  },
  recentJobs: [
    {
      jobId: 'job-123',
      jobType: 'training',
      status: 'completed',
      submittedAt: '2024-04-30T07:00:00Z',
      symbol: 'BTC-USDT',
      timeframe: '1h'
    }
  ],
  recentResults: [
    {
      jobId: 'job-123',
      jobType: 'training',
      status: 'completed',
      timestamp: '2024-04-30T08:00:00Z',
      metrics: {
        accuracy: 0.9143,
        f1: 0.8721
      }
    }
  ]
};

(async () => {
  const loadingView = render(<ModelFusionCard loading />);
  assert(loadingView.getByText('正在加载模型融合概览...') !== null, '加载状态应提示文案');
  await cleanup();

  const dataView = render(<ModelFusionCard data={overview} />);
  assert(dataView.getByText(/激活版本：v3/) !== null, '应展示激活的模型版本');
  assert(dataView.getByText('news-v2') !== null, '应显示关联的新闻模型版本');
  assert(dataView.getByText('0.914') !== null, '应渲染主要指标数值');
  await cleanup();
})();
