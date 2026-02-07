import { JSDOM } from 'jsdom';

// Create a proper DOM environment before any tests run
const dom = new JSDOM('<!doctype html><html><body></body></html>', { 
  url: 'http://localhost/',
  pretendToBeVisual: true,
  resources: 'usable'
});

// Set up global objects properly
Object.defineProperty(globalThis, 'window', {
  value: dom.window,
  writable: true,
  configurable: true
});

Object.defineProperty(globalThis, 'document', {
  value: dom.window.document,
  writable: true,
  configurable: true
});

Object.defineProperty(globalThis, 'navigator', {
  value: dom.window.navigator,
  writable: true,
  configurable: true
});

// Set up other common globals
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.Node = dom.window.Node;
globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
globalThis.requestAnimationFrame = dom.window.requestAnimationFrame?.bind(dom.window) || ((cb) => setTimeout(() => cb(Date.now()), 16));
globalThis.cancelAnimationFrame = dom.window.cancelAnimationFrame?.bind(dom.window) || ((id) => clearTimeout(id));

// Mock legacy IE methods for compatibility
const docWithLegacyEvents = globalThis.document;
docWithLegacyEvents.attachEvent ??= () => undefined;
docWithLegacyEvents.detachEvent ??= () => undefined;

const inputPrototype = globalThis.HTMLInputElement?.prototype;
if (inputPrototype) {
  inputPrototype.attachEvent ??= () => undefined;
  inputPrototype.detachEvent ??= () => undefined;
}

console.log('Test environment setup complete');