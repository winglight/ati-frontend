import React from 'react';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { JSDOM } from 'jsdom';
import JobCreator from '../JobCreator';
import type { CreateTrainingJobPayload } from '@services/aiModelOps';

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

type SubmitSpy = {
  calls: CreateTrainingJobPayload[];
  handler: (payload: CreateTrainingJobPayload) => void;
};

const createSubmitSpy = (): SubmitSpy => {
  const calls: CreateTrainingJobPayload[] = [];
  const handler = (payload: CreateTrainingJobPayload) => {
    calls.push(payload);
  };
  return { calls, handler };
};

await (async () => {
  const submitSpy = createSubmitSpy();
  const newsModels = [
    { id: 'news-a', label: '基础情绪模型', latencyMs: 120 },
    { id: 'news-b', label: '延迟优化版', latencyMs: 80 }
  ];

  const container = window.document.createElement('div');
  window.document.body.appendChild(container);

  const view = render(
    <JobCreator onSubmit={submitSpy.handler} availableNewsModels={newsModels} />, 
    { container }
  );

  const symbolInput = view.getByLabelText('训练标的') as HTMLInputElement;
  symbolInput.value = 'TEST';
  fireEvent.input(symbolInput);

  const timeframeSelect = view.getByLabelText('K 线周期') as HTMLSelectElement;
  timeframeSelect.value = '15m';
  fireEvent.change(timeframeSelect);

  const startInput = view.getByLabelText('开始时间') as HTMLInputElement;
  startInput.value = '2024-01-01T00:00';
  fireEvent.input(startInput);

  const endInput = view.getByLabelText('结束时间') as HTMLInputElement;
  endInput.value = '2024-01-02T12:00';
  fireEvent.input(endInput);

  const volatilityCheckbox = view.getByLabelText('波动率') as HTMLInputElement;
  fireEvent.click(volatilityCheckbox);

  const resourceInput = view.getByLabelText('资源模板') as HTMLInputElement;
  resourceInput.value = 'gpu-large';
  fireEvent.input(resourceInput);

  const newsSelect = view.getByDisplayValue('基础情绪模型 · 120ms') as HTMLSelectElement;
  newsSelect.value = 'news-b';
  fireEvent.change(newsSelect);

  const submitButton = view.getByRole('button', { name: '创建训练任务' });
  fireEvent.click(submitButton);

  assert(submitSpy.calls.length === 1, '提交表单后应触发一次 onSubmit');
  const payload = submitSpy.calls[0];

  assert(Array.isArray(payload.features), '提交的特征应为数组');
  assert(!payload.features.includes('volatility'), '取消选择的特征不应包含在提交结果中');
  assert(payload.fusion.enableNewsFeatures === true, '默认应启用新闻特征融合');
  assert(payload.fusion.newsModelVersion === 'news-b', '选择的新闻模型应被提交');

  await cleanup();
})();
