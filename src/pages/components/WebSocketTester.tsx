import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import styles from './WebSocketTester.module.css';

interface AuthHeaderConfig {
  name: string;
  value: string;
}

interface WebSocketTesterProps {
  authHeader: AuthHeaderConfig | null;
}

interface LogEntry {
  id: string;
  type: 'system' | 'sent' | 'received' | 'error';
  message: string;
  timestamp: Date;
}

const formatTimestamp = (date: Date): string => {
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).format(date);
};

const generateId = () => Math.random().toString(36).slice(2);

function WebSocketTester({ authHeader }: WebSocketTesterProps) {
  const [url, setUrl] = useState('');
  const [protocols, setProtocols] = useState('');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<'idle' | 'connecting' | 'open' | 'closed'>('idle');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const socketRef = useRef<WebSocket | null>(null);

  const authHint = useMemo(() => {
    if (!authHeader || !authHeader.name.trim()) {
      return null;
    }
    if (authHeader.name.toLowerCase() === 'authorization') {
      return '浏览器 WebSocket API 无法直接设置自定义 Header，如需鉴权可在 URL 上附加 token 或通过子协议传递。';
    }
    return `浏览器 WebSocket API 不支持自定义 Header，若服务要求 ${authHeader.name}，请考虑通过查询参数或子协议传递。`;
  }, [authHeader]);

  const appendLog = (entry: Omit<LogEntry, 'id'>) => {
    setLogs((prev) => [...prev, { ...entry, id: generateId() }]);
  };

  const handleConnect = (event: FormEvent) => {
    event.preventDefault();
    if (!url) {
      appendLog({ type: 'error', message: '请先填写 WebSocket URL', timestamp: new Date() });
      return;
    }
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      appendLog({ type: 'system', message: '连接已建立，无需重复连接。', timestamp: new Date() });
      return;
    }
    try {
      setStatus('connecting');
      const protocolList = protocols
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
      const socket = protocolList.length > 0 ? new WebSocket(url, protocolList) : new WebSocket(url);
      socketRef.current = socket;
      appendLog({ type: 'system', message: `开始连接 ${url}`, timestamp: new Date() });
      socket.onopen = () => {
        setStatus('open');
        appendLog({ type: 'system', message: 'WebSocket 连接已建立', timestamp: new Date() });
      };
      socket.onerror = () => {
        appendLog({ type: 'error', message: 'WebSocket 连接出现错误', timestamp: new Date() });
      };
      socket.onclose = (event) => {
        setStatus('closed');
        appendLog({
          type: 'system',
          message: `连接已关闭（code=${event.code}, reason=${event.reason || '无'}, wasClean=${event.wasClean}）`,
          timestamp: new Date()
        });
        socketRef.current = null;
      };
      socket.onmessage = (event) => {
        appendLog({ type: 'received', message: event.data ?? '', timestamp: new Date() });
      };
    } catch (error) {
      setStatus('idle');
      const message = error instanceof Error ? error.message : '无法建立 WebSocket 连接';
      appendLog({ type: 'error', message, timestamp: new Date() });
    }
  };

  const handleDisconnect = () => {
    const socket = socketRef.current;
    if (!socket) {
      appendLog({ type: 'system', message: '当前没有正在使用的连接。', timestamp: new Date() });
      return;
    }
    socket.close();
    socketRef.current = null;
  };

  const handleSend = (event: FormEvent) => {
    event.preventDefault();
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      appendLog({ type: 'error', message: '连接尚未建立或已关闭。', timestamp: new Date() });
      return;
    }
    if (!message) {
      appendLog({ type: 'error', message: '请输入要发送的消息。', timestamp: new Date() });
      return;
    }
    socket.send(message);
    appendLog({ type: 'sent', message, timestamp: new Date() });
    setMessage('');
  };

  const handleClearLogs = () => {
    setLogs([]);
  };

  useEffect(() => {
    return () => {
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
    };
  }, []);

  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        <div>
          <h2 className={styles.sectionTitle}>WebSocket 测试</h2>
          <p className={styles.sectionDescription}>
            输入 WebSocket 地址并建立连接，可实时发送与接收消息，便于验证推送频道与网关转发配置。
          </p>
        </div>
        <div className={styles.statusBadge} data-status={status}>
          状态：
          {status === 'idle' ? '未连接' : null}
          {status === 'connecting' ? '连接中' : null}
          {status === 'open' ? '已连接' : null}
          {status === 'closed' ? '已关闭' : null}
        </div>
      </div>

      {authHint ? <div className={styles.hint}>{authHint}</div> : null}

      <form className={styles.form} onSubmit={handleConnect}>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>WebSocket 地址</span>
          <input
            className={styles.input}
            placeholder="例如 ws://localhost:8000/ws/market.ticker"
            value={url}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setUrl(event.target.value)}
          />
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>子协议（可选，使用逗号分隔）</span>
          <input
            className={styles.input}
            placeholder="例如 bearer,token-123"
            value={protocols}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setProtocols(event.target.value)}
          />
        </label>
        <div className={styles.connectionActions}>
          <button type="submit" className={styles.primaryButton} disabled={status === 'connecting'}>
            {status === 'open' ? '重新连接' : '建立连接'}
          </button>
          <button type="button" className={styles.secondaryButton} onClick={handleDisconnect}>
            断开连接
          </button>
        </div>
      </form>

      <form className={styles.messageForm} onSubmit={handleSend}>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>发送消息</span>
          <textarea
            className={styles.textarea}
            rows={4}
            placeholder="输入要发送的内容"
            value={message}
            onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setMessage(event.target.value)}
          />
        </label>
        <div className={styles.messageActions}>
          <button type="submit" className={styles.primaryButton} disabled={!message}>
            发送
          </button>
          <button type="button" className={styles.secondaryButton} onClick={handleClearLogs}>
            清空日志
          </button>
        </div>
      </form>

      <div className={styles.logSection}>
        <div className={styles.logHeader}>消息日志（{logs.length}）</div>
        <div className={styles.logList}>
          {logs.length === 0 ? <div className={styles.emptyState}>暂无日志</div> : null}
          {logs.map((entry) => (
            <div key={entry.id} className={styles.logEntry} data-type={entry.type}>
              <span className={styles.logTimestamp}>{formatTimestamp(entry.timestamp)}</span>
              <span className={styles.logLabel}>
                {entry.type === 'system' ? '系统' : null}
                {entry.type === 'sent' ? '发送' : null}
                {entry.type === 'received' ? '收到' : null}
                {entry.type === 'error' ? '错误' : null}
              </span>
              <pre className={styles.logMessage}>{entry.message || '（空）'}</pre>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default WebSocketTester;
