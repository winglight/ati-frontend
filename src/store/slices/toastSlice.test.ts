import toastReducer, { addToast, clearToasts } from './toastSlice';

const assert = (condition: unknown, message: string): void => {
  if (!condition) {
    throw new Error(message);
  }
};

const runTests = () => {
  const initialState = toastReducer(undefined, { type: 'init' });
  assert(initialState.items.length === 0, '初始状态应为空');

  const withToast = toastReducer(initialState, addToast({ message: 'A', variant: 'success', preventDuplicates: true }));
  assert(withToast.items.length === 1, '第一次添加 toast 应成功');

  const deduped = toastReducer(withToast, addToast({ message: 'A', variant: 'success', preventDuplicates: true }));
  assert(deduped.items.length === 1, '启用去重时重复 toast 不应添加');

  const allowDuplicate = toastReducer(withToast, addToast({ message: 'A', variant: 'success' }));
  assert(allowDuplicate.items.length === 2, '未启用去重时应允许重复 toast');

  const differentVariant = toastReducer(withToast, addToast({ message: 'A', variant: 'error', preventDuplicates: true }));
  assert(differentVariant.items.length === 2, '不同类型的 toast 不应被去重');

  const cleared = toastReducer(differentVariant, clearToasts());
  assert(cleared.items.length === 0, '清空操作应移除所有 toast');
};

runTests();

