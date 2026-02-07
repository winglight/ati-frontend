import { dashboardMockData } from '@features/dashboard/data';
import type { DashboardData } from '@features/dashboard/types';

export interface SessionUser {
  id: string;
  name: string;
  role: string;
  permissions: string[];
  lastLoginAt: string;
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

const simulateDelay = async <T>(value: T, delay = 320): Promise<T> =>
  new Promise((resolve) => {
    setTimeout(() => resolve(value), delay);
  });

export const fetchDashboardSnapshot = async (): Promise<DashboardData> => {
  return simulateDelay(clone(dashboardMockData));
};

export const fetchCurrentUser = async (): Promise<SessionUser> => {
  return simulateDelay({
    id: 'admin-user',
    name: 'Admin 用户',
    role: '交易管理员',
    permissions: [
      'orders:read',
      'orders:write',
      'risk:manage',
      'strategies:control',
      'notifications:ack'
    ],
    lastLoginAt: '2024-04-29T08:15:00Z'
  });
};
