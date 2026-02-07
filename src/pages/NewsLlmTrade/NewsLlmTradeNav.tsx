import { NavLink } from 'react-router-dom';
import clsx from 'clsx';
import styles from './NewsLlmTrade.module.css';

const navItems = [
  { label: '配置中心', to: '/news-llm-trade/config' },
  { label: '订阅新闻', to: '/news-llm-trade/news' },
  { label: 'LLM 调用日志', to: '/news-llm-trade/logs' },
  { label: '交易信号', to: '/news-llm-trade/signals' }
];

function NewsLlmTradeNav() {
  return (
    <nav className={styles.navBar}>
      {navItems.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) => clsx(styles.navLink, isActive && styles.navLinkActive)}
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}

export default NewsLlmTradeNav;
