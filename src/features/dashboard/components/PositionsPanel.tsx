import { useMemo, useState, type DragEvent } from 'react';
import PanelCard, { PanelAction } from './PanelCard';
import { useTranslation } from '@i18n';
import styles from './PositionsPanel.module.css';
import type { PositionItem, SymbolInfo, WatchlistGroup } from '../types';
import { formatPriceWithTick } from '../utils/priceFormatting';

type RequestStatus = 'idle' | 'loading' | 'succeeded' | 'failed';

type PositionsTab = 'positions' | 'watchlist';

interface PositionsPanelProps {
  positions: PositionItem[];
  symbols?: SymbolInfo[];
  onSelectSymbol: (symbol: string) => void;
  onConfigureRiskRule: (position: PositionItem) => void;
  onQuickClosePosition?: (symbol: string, position: PositionItem) => void;
  onQuickReversePosition?: (symbol: string, position: PositionItem) => void;
  onRefresh?: () => void;
  quickCloseStatus?: RequestStatus;
  quickCloseError?: string | null;
  quickReverseStatus?: RequestStatus;
  quickReverseError?: string | null;
  watchlistGroups?: WatchlistGroup[];
  watchlistStatus?: RequestStatus;
  watchlistError?: string | null;
  watchlistSaving?: boolean;
  onCreateWatchlistGroup?: (name: string) => void;
  onRenameWatchlistGroup?: (groupId: string, name: string) => void;
  onDeleteWatchlistGroup?: (groupId: string) => void;
  onReorderWatchlistGroups?: (groupIds: string[]) => void;
  onAddWatchlistItem?: (groupId: string, symbol: string) => void;
  onUpdateWatchlistItem?: (itemId: string, symbol: string) => void;
  onDeleteWatchlistItem?: (itemId: string) => void;
  onMoveWatchlistItem?: (itemId: string, targetGroupId: string, targetIndex: number) => void;
}

const resolveTickSize = (symbol: string, symbols?: SymbolInfo[]) => {
  if (!symbols?.length) {
    return undefined;
  }
  const normalized = symbol.toUpperCase();
  const direct = symbols.find((item) => item.symbol.toUpperCase() === normalized);
  if (direct?.tickSize) {
    return direct.tickSize;
  }
  const root = normalized.replace(/\d+.*/, '');
  return symbols.find((item) => item.symbol.toUpperCase() === root)?.tickSize ?? undefined;
};

const formatPercent = (value: number | null): string => {
  if (value === null || Number.isNaN(value)) {
    return '—';
  }
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
};

const parseGroupDragData = (event: DragEvent): string | null => {
  const raw = event.dataTransfer.getData('text/plain');
  if (!raw.startsWith('group:')) {
    return null;
  }
  const groupId = raw.slice('group:'.length);
  return groupId || null;
};

const parseItemDragData = (event: DragEvent): { itemId: string; sourceGroupId: string } | null => {
  const raw = event.dataTransfer.getData('text/plain');
  if (!raw.startsWith('item:')) {
    return null;
  }
  const [, itemId, sourceGroupId] = raw.split(':');
  if (!itemId || !sourceGroupId) {
    return null;
  }
  return { itemId, sourceGroupId };
};

function PositionsPanel({
  positions,
  symbols,
  onSelectSymbol,
  onConfigureRiskRule,
  onQuickClosePosition,
  onQuickReversePosition,
  onRefresh,
  quickCloseStatus = 'idle',
  quickCloseError,
  quickReverseStatus = 'idle',
  quickReverseError,
  watchlistGroups = [],
  watchlistStatus = 'idle',
  watchlistError = null,
  watchlistSaving = false,
  onCreateWatchlistGroup,
  onRenameWatchlistGroup,
  onDeleteWatchlistGroup,
  onReorderWatchlistGroups,
  onAddWatchlistItem,
  onUpdateWatchlistItem,
  onDeleteWatchlistItem,
  onMoveWatchlistItem
}: PositionsPanelProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<PositionsTab>('positions');
  const [newGroupName, setNewGroupName] = useState('');
  const [groupSymbolInputs, setGroupSymbolInputs] = useState<Record<string, string>>({});

  const actions: PanelAction[] = [onRefresh ? { label: t('dashboard.positions.actions.refresh'), onClick: onRefresh } : null].filter(Boolean) as PanelAction[];

  const isClosingPosition = quickCloseStatus === 'loading';
  const isReversingPosition = quickReverseStatus === 'loading';
  const quickActionError = quickCloseStatus === 'failed'
    ? quickCloseError
    : quickReverseStatus === 'failed'
      ? quickReverseError
      : null;

  const watchlistBusy = watchlistStatus === 'loading' || watchlistSaving;

  const headerMeta = (
    <div className={styles.tabBar}>
      <button
        type="button"
        className={`${styles.tabButton} ${activeTab === 'positions' ? styles.tabActive : ''}`.trim()}
        onClick={() => setActiveTab('positions')}
      >
        {t('dashboard.positions.tabs.positions', '持仓')}
      </button>
      <button
        type="button"
        className={`${styles.tabButton} ${activeTab === 'watchlist' ? styles.tabActive : ''}`.trim()}
        onClick={() => setActiveTab('watchlist')}
      >
        {t('dashboard.positions.tabs.watchlist', '自选股')}
      </button>
    </div>
  );

  const sortedWatchlistGroups = useMemo(
    () => [...watchlistGroups].sort((a, b) => (a.sortOrder - b.sortOrder) || a.name.localeCompare(b.name)),
    [watchlistGroups]
  );

  const createGroup = () => {
    const trimmed = newGroupName.trim();
    if (!trimmed || !onCreateWatchlistGroup) {
      return;
    }
    onCreateWatchlistGroup(trimmed);
    setNewGroupName('');
  };

  const addSymbolToGroup = (groupId: string) => {
    const raw = groupSymbolInputs[groupId] ?? '';
    const symbol = raw.trim().toUpperCase();
    if (!symbol || !onAddWatchlistItem) {
      return;
    }
    onAddWatchlistItem(groupId, symbol);
    setGroupSymbolInputs((previous) => ({ ...previous, [groupId]: '' }));
  };

  const reorderGroupToTarget = (sourceGroupId: string, targetGroupId: string) => {
    if (!onReorderWatchlistGroups || sourceGroupId === targetGroupId) {
      return;
    }
    const ids = sortedWatchlistGroups.map((group) => group.id);
    const sourceIndex = ids.indexOf(sourceGroupId);
    const targetIndex = ids.indexOf(targetGroupId);
    if (sourceIndex < 0 || targetIndex < 0) {
      return;
    }
    const [moved] = ids.splice(sourceIndex, 1);
    ids.splice(targetIndex, 0, moved);
    onReorderWatchlistGroups(ids);
  };

  const renderPositionsTab = () => {
    if (positions.length === 0) {
      return <div className={styles.emptyState}>{t('dashboard.positions.empty')}</div>;
    }
    return (
      <div className={styles.cardsList}>
        {positions.map((position, index) => {
          const quantityValue = position.quantity ?? 0;
          const absoluteQuantity = Math.abs(quantityValue);
          const avgPrice = position.avgPrice ?? 0;
          const notional =
            absoluteQuantity && avgPrice
              ? absoluteQuantity * avgPrice * (position.multiplier ?? 1)
              : null;
          const pnlPercent = notional ? (position.pnl / notional) * 100 : null;
          const formattedPnlPercent = formatPercent(pnlPercent);
          const pnlPercentLabel = formattedPnlPercent === '—' ? '—' : `(${formattedPnlPercent})`;

          return (
            <article key={position.id} className={styles.positionCard}>
              <div className={styles.positionHeader}>
                <button
                  type="button"
                  className={styles.symbolButton}
                  onClick={() => onSelectSymbol(position.symbol)}
                >
                  {position.symbol}
                </button>
                <span
                  className={`${styles.directionTag} ${
                    position.direction === 'long' ? styles.directionLong : styles.directionShort
                  }`}
                >
                  {position.direction === 'long' ? t('dashboard.positions.direction.long') : t('dashboard.positions.direction.short')}
                </span>
              </div>
              <div className={styles.positionDetails}>
                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>{t('dashboard.positions.labels.quantity')}</span>
                  <span className={styles.detailValue}>{position.quantity.toLocaleString()}</span>
                </div>
                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>{t('dashboard.positions.labels.avg_price')}</span>
                  <span className={styles.detailValue}>
                    {formatPriceWithTick(position.avgPrice, position.symbol, {
                      tickSize: resolveTickSize(position.symbol, symbols),
                      reference: position.markPrice ?? undefined,
                      allowDownscale: true
                    })}
                  </span>
                </div>
                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>{t('dashboard.positions.labels.mark_price')}</span>
                  <span className={styles.detailValue}>
                    {formatPriceWithTick(position.markPrice, position.symbol, {
                      tickSize: resolveTickSize(position.symbol, symbols)
                    })}
                  </span>
                </div>
                <div className={`${styles.detailItem} ${styles.pnlItem}`}>
                  <span className={styles.detailLabel}>{t('dashboard.positions.labels.pnl')}</span>
                  <span
                    className={`${styles.detailValue} ${
                      position.pnl >= 0 ? styles.pnlPositive : styles.pnlNegative
                    }`}
                  >
                    <span className={styles.pnlAmount}>{position.pnl.toFixed(2)}</span>
                    <span className={styles.pnlPercent}>{pnlPercentLabel}</span>
                  </span>
                </div>
              </div>
              <div className={styles.cardFooter}>
                {(onQuickClosePosition || onQuickReversePosition) && (
                  <div className={styles.quickActions}>
                    {onQuickClosePosition && (
                      <button
                        type="button"
                        className={styles.quickButton}
                        onClick={() => onQuickClosePosition(position.symbol, position)}
                        disabled={isClosingPosition || isReversingPosition}
                      >
                        {isClosingPosition ? t('dashboard.positions.quick.closing') : t('dashboard.positions.quick.close')}
                      </button>
                    )}
                    {onQuickReversePosition && (
                      <button
                        type="button"
                        className={styles.quickButton}
                        onClick={() => onQuickReversePosition(position.symbol, position)}
                        disabled={isClosingPosition || isReversingPosition}
                      >
                        {isReversingPosition ? t('dashboard.positions.quick.reversing') : t('dashboard.positions.quick.reverse')}
                      </button>
                    )}
                  </div>
                )}
                {quickActionError && index === 0 ? (
                  <div className={styles.quickError} role="alert">
                    {quickActionError}
                  </div>
                ) : null}
                <button
                  type="button"
                  className={styles.riskButton}
                  onClick={() => onConfigureRiskRule(position)}
                >
                  {t('dashboard.positions.configure_risk')}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    );
  };

  const renderWatchlistTab = () => {
    return (
      <div className={styles.watchlistSection}>
        <div className={styles.watchlistCreateRow}>
          <input
            type="text"
            className={styles.watchlistInput}
            placeholder={t('dashboard.positions.watchlist.group_placeholder', '新分组名称')}
            value={newGroupName}
            onChange={(event) => setNewGroupName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                createGroup();
              }
            }}
            disabled={watchlistBusy || !onCreateWatchlistGroup}
          />
          <button
            type="button"
            className={styles.watchlistActionButton}
            onClick={createGroup}
            disabled={watchlistBusy || !newGroupName.trim() || !onCreateWatchlistGroup}
          >
            {t('dashboard.positions.watchlist.create_group', '新增分组')}
          </button>
        </div>

        {watchlistError ? <div className={styles.watchlistError}>{watchlistError}</div> : null}

        {watchlistStatus === 'loading' && sortedWatchlistGroups.length === 0 ? (
          <div className={styles.emptyState}>{t('dashboard.positions.watchlist.loading', '加载自选股中...')}</div>
        ) : null}

        {sortedWatchlistGroups.length === 0 && watchlistStatus !== 'loading' ? (
          <div className={styles.emptyState}>{t('dashboard.positions.watchlist.empty', '暂无自选股分组')}</div>
        ) : null}

        {sortedWatchlistGroups.map((group) => {
          const isManual = group.groupType === 'manual';
          const inputValue = groupSymbolInputs[group.id] ?? '';

          return (
            <section
              key={group.id}
              className={styles.watchlistGroup}
              draggable={Boolean(onReorderWatchlistGroups)}
              onDragStart={(event) => {
                if (!onReorderWatchlistGroups) {
                  return;
                }
                event.dataTransfer.setData('text/plain', `group:${group.id}`);
                event.dataTransfer.effectAllowed = 'move';
              }}
              onDragOver={(event) => {
                if (!onReorderWatchlistGroups) {
                  return;
                }
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
              }}
              onDrop={(event) => {
                if (!onReorderWatchlistGroups) {
                  return;
                }
                event.preventDefault();
                const sourceGroupId = parseGroupDragData(event);
                if (!sourceGroupId) {
                  return;
                }
                reorderGroupToTarget(sourceGroupId, group.id);
              }}
            >
              <div className={styles.watchlistGroupHeader}>
                <div className={styles.watchlistGroupTitleRow}>
                  <span className={styles.dragHandle}>::</span>
                  <span className={styles.watchlistGroupTitle}>{group.name}</span>
                  <span className={`${styles.groupTypeBadge} ${isManual ? styles.groupTypeManual : styles.groupTypeScreener}`}>
                    {isManual ? t('dashboard.positions.watchlist.group_type.manual', '手动') : t('dashboard.positions.watchlist.group_type.screener', '策略')}
                  </span>
                </div>
                {isManual ? (
                  <div className={styles.watchlistGroupActions}>
                    <button
                      type="button"
                      className={styles.watchlistLinkButton}
                      onClick={() => {
                        const renamed = window.prompt(
                          t('dashboard.positions.watchlist.rename_prompt', '请输入新的分组名称'),
                          group.name
                        );
                        if (!renamed || !renamed.trim() || !onRenameWatchlistGroup) {
                          return;
                        }
                        onRenameWatchlistGroup(group.id, renamed.trim());
                      }}
                      disabled={watchlistBusy || !onRenameWatchlistGroup}
                    >
                      {t('dashboard.positions.watchlist.rename', '重命名')}
                    </button>
                    <button
                      type="button"
                      className={`${styles.watchlistLinkButton} ${styles.watchlistDangerButton}`}
                      onClick={() => onDeleteWatchlistGroup?.(group.id)}
                      disabled={watchlistBusy || !onDeleteWatchlistGroup}
                    >
                      {t('dashboard.positions.watchlist.delete_group', '删除分组')}
                    </button>
                  </div>
                ) : null}
              </div>

              <div
                className={styles.watchlistItems}
                onDragOver={(event) => {
                  if (!onMoveWatchlistItem || !isManual) {
                    return;
                  }
                  event.preventDefault();
                  event.dataTransfer.dropEffect = 'move';
                }}
                onDrop={(event) => {
                  if (!onMoveWatchlistItem || !isManual) {
                    return;
                  }
                  event.preventDefault();
                  const data = parseItemDragData(event);
                  if (!data) {
                    return;
                  }
                  onMoveWatchlistItem(data.itemId, group.id, group.items.length);
                }}
              >
                {group.items.length === 0 ? (
                  <div className={styles.watchlistEmptyGroup}>{t('dashboard.positions.watchlist.empty_group', '该分组暂无 symbol')}</div>
                ) : null}

                {group.items.map((item, index) => (
                  <div
                    key={item.id}
                    className={styles.watchlistItemRow}
                    draggable={isManual && Boolean(onMoveWatchlistItem)}
                    onDragStart={(event) => {
                      if (!isManual || !onMoveWatchlistItem) {
                        return;
                      }
                      event.dataTransfer.setData('text/plain', `item:${item.id}:${group.id}`);
                      event.dataTransfer.effectAllowed = 'move';
                    }}
                    onDragOver={(event) => {
                      if (!isManual || !onMoveWatchlistItem) {
                        return;
                      }
                      event.preventDefault();
                      event.dataTransfer.dropEffect = 'move';
                    }}
                    onDrop={(event) => {
                      if (!isManual || !onMoveWatchlistItem) {
                        return;
                      }
                      event.preventDefault();
                      event.stopPropagation();
                      const data = parseItemDragData(event);
                      if (!data) {
                        return;
                      }
                      onMoveWatchlistItem(data.itemId, group.id, index);
                    }}
                  >
                    <button
                      type="button"
                      className={styles.watchlistSymbolButton}
                      onClick={() => onSelectSymbol(item.symbol)}
                    >
                      {item.symbol}
                    </button>
                    {isManual ? (
                      <div className={styles.watchlistItemActions}>
                        <button
                          type="button"
                          className={styles.watchlistLinkButton}
                          onClick={() => {
                            const edited = window.prompt(
                              t('dashboard.positions.watchlist.symbol_prompt', '请输入新的 symbol'),
                              item.symbol
                            );
                            const symbol = edited?.trim().toUpperCase();
                            if (!symbol || !onUpdateWatchlistItem) {
                              return;
                            }
                            onUpdateWatchlistItem(item.id, symbol);
                          }}
                          disabled={watchlistBusy || !onUpdateWatchlistItem}
                        >
                          {t('dashboard.positions.watchlist.edit_symbol', '编辑')}
                        </button>
                        <button
                          type="button"
                          className={`${styles.watchlistLinkButton} ${styles.watchlistDangerButton}`}
                          onClick={() => onDeleteWatchlistItem?.(item.id)}
                          disabled={watchlistBusy || !onDeleteWatchlistItem}
                        >
                          {t('dashboard.positions.watchlist.delete_symbol', '删除')}
                        </button>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>

              {isManual ? (
                <div className={styles.watchlistAddRow}>
                  <input
                    type="text"
                    className={styles.watchlistInput}
                    value={inputValue}
                    placeholder={t('dashboard.positions.watchlist.symbol_placeholder', '输入 symbol，例如 AAPL')}
                    onChange={(event) =>
                      setGroupSymbolInputs((previous) => ({
                        ...previous,
                        [group.id]: event.target.value
                      }))
                    }
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        addSymbolToGroup(group.id);
                      }
                    }}
                    disabled={watchlistBusy || !onAddWatchlistItem}
                  />
                  <button
                    type="button"
                    className={styles.watchlistActionButton}
                    onClick={() => addSymbolToGroup(group.id)}
                    disabled={watchlistBusy || !inputValue.trim() || !onAddWatchlistItem}
                  >
                    {t('dashboard.positions.watchlist.add_symbol', '添加')}
                  </button>
                </div>
              ) : null}
            </section>
          );
        })}
      </div>
    );
  };

  return (
    <PanelCard
      title={t('dashboard.positions.title')}
      actions={actions}
      className={styles.card}
      headerMeta={headerMeta}
    >
      {activeTab === 'positions' ? renderPositionsTab() : renderWatchlistTab()}
    </PanelCard>
  );
}

export default PositionsPanel;
