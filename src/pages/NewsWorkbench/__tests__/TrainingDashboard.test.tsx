import React from 'react';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { JSDOM } from 'jsdom';
import TrainingDashboard from '../TrainingDashboard';
import type { ModelMetadata, NewsServiceEvent, SentimentSignal } from '@services/newsService';

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

interface Spy<TArgs extends unknown[]> {
  calls: TArgs[];
  handler: (...args: TArgs) => void;
}

const createSpy = <TArgs extends unknown[]>(): Spy<TArgs> => {
  const calls: TArgs[] = [];
  const handler = (...args: TArgs) => {
    calls.push(args);
  };
  return { calls, handler };
};

await (async () => {
  const events: NewsServiceEvent[] = [
    {
      channel: 'news_service.signals',
      type: 'prediction',
      receivedAt: '2024-03-02T09:30:00.000Z',
      payload: {
        type: 'prediction',
        model_version: 'v2',
        probability: 0.85
      }
    },
    {
      channel: 'news_service.model.activated',
      type: 'model_activation',
      receivedAt: '2024-03-02T09:45:00.000Z',
      payload: {
        type: 'model_activation',
        version: 'v2'
      }
    }
  ];

  const signals: SentimentSignal[] = [
    {
      id: 'signal-1',
      text: 'positive news',
      probability: 0.8,
      rating: 5,
      symbols: ['BTC-USDT'],
      modelVersion: 'v2',
      createdAt: '2024-03-02T09:30:00.000Z',
      publishedAt: null
    },
    {
      id: 'signal-2',
      text: 'neutral news',
      probability: 0.5,
      rating: 3,
      symbols: ['ETH-USDT'],
      modelVersion: 'v1',
      createdAt: '2024-03-02T09:35:00.000Z',
      publishedAt: null
    }
  ];

  const metadata: Record<string, ModelMetadata> = {
    v2: {
      version: 'v2',
      registeredAt: '2024-03-01T12:00:00Z',
      description: '最新版本',
      metrics: { accuracy: 0.91, latency_ms: 120 }
    },
    v1: {
      version: 'v1',
      registeredAt: '2024-02-15T12:00:00Z',
      description: '基线版本',
      metrics: { accuracy: 0.88 }
    }
  };

  const submitSpy = createSpy<[{ dataset: string; notes?: string | null }]>();
  const activateSpy = createSpy<[string]>();

  const container = window.document.createElement('div');
  window.document.body.appendChild(container);

  const view = render(
    <TrainingDashboard
      events={events}
      recentSignals={signals}
      modelMetadata={metadata}
      activeModelVersion="v1"
      submitting={false}
      submissionError={null}
      onSubmitTraining={submitSpy.handler}
      onActivateModel={activateSpy.handler}
    />,
    { container }
  );

  assert(view.getByText('训练监控与模型管理') !== null, '应渲染面板标题');
  assert(view.getByText(/当前激活模型：v1/) !== null, '应显示当前激活版本');
  assert(view.getByText(/accuracy: 0.910/) !== null, '应展示候选模型指标');
  const eventTypeLabels = view.getAllByText(/prediction/);
  assert(eventTypeLabels.length >= 1, '应展示事件类型');

  const datasetInput = view.getByLabelText('训练数据集') as HTMLInputElement;
  datasetInput.value = 'headline-2024';
  fireEvent.input(datasetInput);

  const notesInput = view.getByLabelText('备注') as HTMLTextAreaElement;
  notesInput.value = '回测覆盖多语言语料';
  fireEvent.input(notesInput);

  const submitButton = view.getByRole('button', { name: '提交训练任务' });
  fireEvent.click(submitButton);

  assert(submitSpy.calls.length === 1, '提交表单应触发训练回调');

  const activateButtons = view.getAllByRole('button', { name: /激活/ });
  const activateButton = activateButtons.find((button) => button.textContent === '激活该版本');
  assert(activateButton, '应提供激活按钮');
  fireEvent.click(activateButton!);

  assert(activateSpy.calls.length === 1, '激活按钮应触发回调');

  await cleanup();
})();

