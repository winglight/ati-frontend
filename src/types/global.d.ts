// 全局类型声明，解决DOM和Node.js环境的类型冲突
declare global {
  // 在浏览器环境中，setTimeout和setInterval返回number类型
  function setTimeout(callback: () => void, ms?: number): number;
  function setInterval(callback: () => void, ms?: number): number;
  function clearTimeout(id: number): void;
  function clearInterval(id: number): void;
}

export {};