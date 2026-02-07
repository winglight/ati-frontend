import { JSDOM } from 'jsdom';

type MutableGlobal = Record<string, unknown>;

const globalObject = globalThis as MutableGlobal;

if (typeof globalObject.document === 'undefined' || typeof globalObject.window === 'undefined') {
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  globalObject.window = dom.window as unknown;
  globalObject.document = dom.window.document as unknown;
  Object.defineProperty(globalObject, 'navigator', {
    value: dom.window.navigator,
    writable: true,
    configurable: true
  });
  globalObject.HTMLElement = dom.window.HTMLElement as unknown;
  globalObject.Node = dom.window.Node as unknown;
  globalObject.MutationObserver = dom.window.MutationObserver as unknown;
  globalObject.requestAnimationFrame =
    dom.window.requestAnimationFrame?.bind(dom.window) ?? ((callback: FrameRequestCallback) => setTimeout(() => callback(Date.now()), 16));
  globalObject.cancelAnimationFrame =
    dom.window.cancelAnimationFrame?.bind(dom.window) ?? ((handle: number) => clearTimeout(handle));
}
