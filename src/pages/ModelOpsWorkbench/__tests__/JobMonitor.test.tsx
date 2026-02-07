import React from 'react';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { JSDOM } from 'jsdom';
import JobMonitor from '../JobMonitor';
import type {
  JobStatusPayload,
  ModelOpsProgressEvent,
  ModelOpsResultEvent,
  ModelVersion
} from '@services/aiModelOps';

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

type Assertion = (condition: unknown, message: string) => asserts condition;

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
  const jobs: JobStatusPayload[] = [
    {
      jobId: 'job-1',
      status: 'running',
      jobType: 'training',
      detail: { symbol: 'ESM4', timeframe: '1h', startAt: '2024-01-01T00:00:00Z' }
    },
    {
      jobId: 'job-2',
      status: 'queued',
      jobType: 'optimize',
      detail: { symbol: 'NQ', timeframe: '4h', startAt: '2024-01-03T00:00:00Z' }
    }
  ];

  const progressEvents: ModelOpsProgressEvent[] = [
    {
      channel: 'ai_model_ops.progress',
      jobId: 'job-1',
      stage: 'data',
      status: 'completed',
      jobType: 'training',
      receivedAt: '2024-01-05T00:00:00.000Z'
    },
    {
      channel: 'ai_model_ops.progress',
      jobId: 'job-1',
      stage: 'training',
      status: 'running',
      jobType: 'training',
      receivedAt: '2024-01-05T01:00:00.000Z',
      message: 'Processing batches'
    }
  ];

  const resultEvent: ModelOpsResultEvent = {
    channel: 'ai_model_ops.result',
    jobId: 'job-1',
    status: 'completed',
    jobType: 'training',
    result: { metrics: { sharpe: 1.2345, drawdown: 0.12 } },
    receivedAt: '2024-01-05T02:00:00.000Z'
  };

  const modelVersions: ModelVersion[] = [
    { version: 'trend-v1', jobId: 'job-1', metrics: { sharpe: 1.23 }, metadata: null },
    { version: 'trend-v0', jobId: 'job-0', metrics: {}, metadata: null }
  ];

  const selectSpy = createSpy<[string]>();
  const activateSpy = createSpy<[string]>();

  const container = window.document.createElement('div');
  window.document.body.appendChild(container);

  const view = render(
    <JobMonitor
      jobs={jobs}
      selectedJobId="job-1"
      onSelectJob={selectSpy.handler}
      progressEvents={progressEvents}
      resultEvent={resultEvent}
      modelVersions={modelVersions}
      onActivateModel={activateSpy.handler}
      activatingVersion={null}
    />, 
    { container }
  );

  const job1Texts = view.getAllByText('job-1');
  assert(job1Texts.length >= 1, '应展示当前任务列表');
  assert(view.getByText('任务详情') !== null, '应显示任务详情标题');
  assert(view.getByText('training') !== null, '应展示阶段名称');
  assert(view.getByText(/Processing batches/) !== null, '应展示事件附带信息');
  const sharpeTexts = view.getAllByText(/sharpe/i);
  assert(sharpeTexts.length >= 1, '应展示关键指标名称');
  assert(view.getByText('trend-v1') !== null, '应展示模型版本');

  const secondJobButton = view.getByRole('button', { name: /job-2/ });
  fireEvent.click(secondJobButton);
  assert(selectSpy.calls.length === 1, '点击任务应触发选择回调');
  assert(selectSpy.calls[0][0] === 'job-2', '回调应携带被选中的任务 ID');

  const activateButtons = view.getAllByRole('button', { name: '激活' });
  assert(activateButtons.length >= 1, '应渲染激活按钮');
  const activateButton = activateButtons[0];
  fireEvent.click(activateButton);
  assert(activateSpy.calls.length === 1, '点击激活按钮应触发回调');
  assert(activateSpy.calls[0][0] === 'trend-v1', '激活回调应传入版本号');

  await cleanup();
})();
