import { NavLink } from 'react-router-dom';
import clsx from 'clsx';
import styles from './SideNavigation.module.css';

interface SideNavigationProps {
  variant: 'left' | 'right';
}

interface NavGroup {
  title: string;
  links: Array<{
    label: string;
    to: string;
    description?: string;
  }>;
}

const LEFT_NAV: NavGroup[] = [
  {
    title: '概览',
    links: [
      { label: '仪表盘', to: '/' },
      { label: '订单管理', to: '/orders' },
      { label: '策略中心', to: '/strategies' },
      { label: '预测模型工作台', to: '/model-ops' },
      { label: '新闻情绪工作台', to: '/news-workbench' },
      { label: 'News LLM Trade', to: '/news-llm-trade/config' }
    ]
  },
  {
    title: '数据与监控',
    links: [
      { label: '风险规则', to: '/risk-rules' },
      { label: 'PnL 日历', to: '/pnl-calendar' },
      { label: '系统日志', to: '/logs' }
    ]
  }
];

const RIGHT_NAV: NavGroup[] = [
  {
    title: '快捷面板',
    links: [
      { label: '配置管理', to: '/settings', description: '主程序配置、通知、风控参数' }
    ]
  },
  {
    title: '帮助',
    links: [
      { label: '文档概览', to: '/docs', description: '跳转到统一文档（预留）' }
    ]
  }
];

function SideNavigation({ variant }: SideNavigationProps) {
  const groups = variant === 'left' ? LEFT_NAV : RIGHT_NAV;

  return (
    <nav className={clsx(styles.container, styles[variant])}>
      {groups.map((group) => (
        <section key={group.title} className={styles.group}>
          <h3 className={styles.groupTitle}>{group.title}</h3>
          <ul className={styles.linkList}>
            {group.links.map((link) => (
              <li key={link.to}>
                <NavLink
                  to={link.to}
                  className={({ isActive }) =>
                    clsx(styles.link, isActive && styles.active)
                  }
                >
                  <span className={styles.linkLabel}>{link.label}</span>
                  {link.description ? (
                    <span className={styles.linkDescription}>{link.description}</span>
                  ) : null}
                </NavLink>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </nav>
  );
}

export default SideNavigation;
