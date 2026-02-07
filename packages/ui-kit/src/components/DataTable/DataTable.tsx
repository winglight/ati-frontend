import { ReactNode, useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import styles from './DataTable.module.css';

const NO_FILTER_VALUE = '__all__';

export type DataTableSortOrder = 'ascend' | 'descend';

export interface DataTableFilterOption {
  label: string;
  value: string;
}

export interface DataTableColumn<T> {
  key: string;
  title: ReactNode;
  dataIndex?: keyof T;
  render?: (value: unknown, record: T) => ReactNode;
  sorter?: (a: T, b: T) => number;
  filters?: DataTableFilterOption[];
  onFilter?: (record: T, filterValue: string) => boolean;
  width?: string | number;
  align?: 'left' | 'center' | 'right';
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  dataSource: T[];
  rowKey: keyof T | ((record: T) => string);
  loading?: boolean;
  emptyText?: string;
  selectedRowKey?: string | null;
  onRowClick?: (record: T) => void;
  className?: string;
  defaultPageSize?: number;
  pageSizeOptions?: number[];
}

interface SortState {
  key: string;
  order: DataTableSortOrder;
}

const DEFAULT_PAGE_SIZES = [10, 20, 50];

const resolveRowKey = <T,>(rowKey: DataTableProps<T>['rowKey'], record: T): string => {
  if (typeof rowKey === 'function') {
    return rowKey(record);
  }
  const value = (record as Record<string, unknown>)[rowKey as string];
  return value != null ? String(value) : '';
};

const resolveCellValue = <T,>(column: DataTableColumn<T>, record: T): unknown => {
  if (column.dataIndex) {
    return (record as Record<string, unknown>)[column.dataIndex as string];
  }
  return undefined;
};

const defaultFilterPredicate = <T,>(column: DataTableColumn<T>, record: T, filter: string): boolean => {
  if (!column.dataIndex) {
    return true;
  }
  const value = (record as Record<string, unknown>)[column.dataIndex as string];
  if (value == null) {
    return false;
  }
  return String(value) === filter;
};

export function DataTable<T>({
  columns,
  dataSource,
  rowKey,
  loading = false,
  emptyText = '暂无数据',
  selectedRowKey,
  onRowClick,
  className,
  defaultPageSize,
  pageSizeOptions
}: DataTableProps<T>) {
  const [sortState, setSortState] = useState<SortState | null>(null);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [pageSize, setPageSize] = useState<number>(() => {
    const candidate = defaultPageSize ?? pageSizeOptions?.[0] ?? DEFAULT_PAGE_SIZES[0];
    return candidate > 0 ? candidate : DEFAULT_PAGE_SIZES[0];
  });
  const [currentPage, setCurrentPage] = useState(1);

  const resolvedPageSizeOptions = useMemo(() => {
    const options = pageSizeOptions?.length ? [...pageSizeOptions] : [...DEFAULT_PAGE_SIZES];
    if (!options.includes(pageSize)) {
      options.push(pageSize);
    }
    options.sort((a, b) => a - b);
    return options;
  }, [pageSizeOptions, pageSize]);

  const filteredData = useMemo(() => {
    if (!columns.length) {
      return dataSource;
    }
    return dataSource.filter((record) =>
      columns.every((column) => {
        const filterValue = filters[column.key];
        if (!column.filters?.length || !filterValue || filterValue === NO_FILTER_VALUE) {
          return true;
        }
        const predicate = column.onFilter ?? ((item: T, value: string) => defaultFilterPredicate(column, item, value));
        return predicate(record, filterValue);
      })
    );
  }, [columns, dataSource, filters]);

  const sortedData = useMemo(() => {
    if (!sortState) {
      return filteredData;
    }
    const column = columns.find((item) => item.key === sortState.key);
    if (!column?.sorter) {
      return filteredData;
    }
    const items = [...filteredData].sort(column.sorter);
    if (sortState.order === 'descend') {
      items.reverse();
    }
    return items;
  }, [columns, filteredData, sortState]);

  const totalItems = sortedData.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const pageStart = (safeCurrentPage - 1) * pageSize;
  const pageData = sortedData.slice(pageStart, pageStart + pageSize);

  useEffect(() => {
    if (safeCurrentPage !== currentPage) {
      setCurrentPage(safeCurrentPage);
    }
  }, [currentPage, safeCurrentPage]);

  const handleSortToggle = (column: DataTableColumn<T>) => {
    if (!column.sorter) {
      return;
    }
    setSortState((prev: SortState | null) => {
      if (!prev || prev.key !== column.key) {
        return { key: column.key, order: 'ascend' };
      }
      if (prev.order === 'ascend') {
        return { key: column.key, order: 'descend' };
      }
      return null;
    });
    setCurrentPage(1);
  };

  const handleFilterChange = (columnKey: string, value: string) => {
    setFilters((prev: Record<string, string>) => ({ ...prev, [columnKey]: value }));
    setCurrentPage(1);
  };

  const handlePageChange = (page: number) => {
    if (page < 1 || page > totalPages) {
      return;
    }
    setCurrentPage(page);
  };

  const handlePageSizeChange = (value: number) => {
    setPageSize(value);
    setCurrentPage(1);
  };

  return (
    <div className={clsx(styles.container, className)}>
      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              {columns.map((column) => {
                const isSorted = sortState?.key === column.key;
                const sortOrder = isSorted ? sortState?.order : null;
                return (
                  <th
                    key={column.key}
                    className={clsx(
                      styles.headerCell,
                      column.align === 'center' && styles.alignCenter,
                      column.align === 'right' && styles.alignRight
                    )}
                    style={column.width ? { width: column.width } : undefined}
                  >
                    <div className={styles.headerContent}>
                      {column.sorter ? (
                        <button
                          type="button"
                          className={styles.sortButton}
                          onClick={() => handleSortToggle(column)}
                          aria-pressed={isSorted}
                        >
                          <span>{column.title}</span>
                          <span className={styles.sortIndicator} aria-hidden>
                            <span className={clsx(styles.sortArrow, isSorted && sortOrder === 'ascend' && styles.sortArrowActive)}>
                              ▲
                            </span>
                            <span className={clsx(styles.sortArrow, isSorted && sortOrder === 'descend' && styles.sortArrowActive)}>
                              ▼
                            </span>
                          </span>
                        </button>
                      ) : (
                        <span>{column.title}</span>
                      )}
                    </div>
                    {column.filters?.length ? (
                      (() => {
                        const columnFilters = column.filters ?? [];
                        const currentValue = filters[column.key];
                        const selectValue =
                          currentValue && columnFilters.some((option) => option.value === currentValue)
                            ? currentValue
                            : NO_FILTER_VALUE;
                        return (
                          <select
                            className={styles.filterSelect}
                            value={selectValue}
                            onChange={(event) => handleFilterChange(column.key, event.target.value)}
                          >
                            <option value={NO_FILTER_VALUE}>全部</option>
                            {columnFilters.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        );
                      })()
                    ) : null}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr className={styles.loadingRow}>
                <td className={styles.cell} colSpan={columns.length}>
                  加载中…
                </td>
              </tr>
            ) : pageData.length ? (
              pageData.map((record: T) => {
                const key = resolveRowKey(rowKey, record);
                return (
                  <tr
                    key={key}
                    className={clsx(
                      styles.row,
                      selectedRowKey && selectedRowKey === key && styles.rowSelected
                    )}
                    onClick={() => onRowClick?.(record)}
                    role={onRowClick ? 'button' : undefined}
                    tabIndex={onRowClick ? 0 : undefined}
                    onKeyDown={(event) => {
                      if (!onRowClick) {
                        return;
                      }
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        onRowClick(record);
                      }
                    }}
                  >
                    {columns.map((column) => {
                      const rawValue = resolveCellValue(column, record);
                      const content = column.render ? column.render(rawValue, record) : rawValue ?? '—';
                      return (
                        <td
                          key={column.key}
                          className={clsx(
                            styles.cell,
                            column.align === 'center' && styles.alignCenter,
                            column.align === 'right' && styles.alignRight
                          )}
                        >
                          {content as ReactNode}
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            ) : (
              <tr>
                <td className={clsx(styles.cell, styles.emptyState)} colSpan={columns.length}>
                  {emptyText}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className={styles.pagination}>
        <div className={styles.pageInfo}>
          第 {safeCurrentPage} / {totalPages} 页 · 共 {totalItems} 条
        </div>
        <div className={styles.paginationControls}>
          <button
            type="button"
            className={styles.paginationButton}
            onClick={() => handlePageChange(1)}
            disabled={safeCurrentPage === 1}
          >
            «
          </button>
          <button
            type="button"
            className={styles.paginationButton}
            onClick={() => handlePageChange(safeCurrentPage - 1)}
            disabled={safeCurrentPage === 1}
          >
            ‹
          </button>
          <span>
            {safeCurrentPage} / {totalPages}
          </span>
          <button
            type="button"
            className={styles.paginationButton}
            onClick={() => handlePageChange(safeCurrentPage + 1)}
            disabled={safeCurrentPage === totalPages}
          >
            ›
          </button>
          <button
            type="button"
            className={styles.paginationButton}
            onClick={() => handlePageChange(totalPages)}
            disabled={safeCurrentPage === totalPages}
          >
            »
          </button>
          <select
            className={styles.pageSizeSelect}
            value={pageSize}
            onChange={(event) => handlePageSizeChange(Number(event.target.value))}
          >
            {resolvedPageSizeOptions.map((option: number) => (
              <option key={option} value={option}>
                每页 {option} 条
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}

export default DataTable;

