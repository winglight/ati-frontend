// Vitest shim for Node.js test environment
const mockFunctions = new Map();

const fn = (implementation) => {
  const mockFn = (...args) => {
    mockFn.calls.push(args);
    if (implementation) {
      return implementation(...args);
    }
    return undefined;
  };
  mockFn.calls = [];
  mockFn.mockImplementation = (impl) => {
    implementation = impl;
    return mockFn;
  };
  mockFn.mockReturnValue = (value) => {
    implementation = () => value;
    return mockFn;
  };
  mockFn.mockResolvedValue = (value) => {
    implementation = () => Promise.resolve(value);
    return mockFn;
  };
  return mockFn;
};

const mock = (moduleName, factory) => {
  const moduleId = moduleName;
  const mockModule = factory ? factory() : {};
  mockFunctions.set(moduleId, mockModule);
};

const vi = { fn, mock };

export { vi, fn, mock };
export default { vi, fn, mock };