declare module '@ui-kit' {
  export { default as PanelCard } from '../../packages/ui-kit/src/components/PanelCard/PanelCard';
  export type { PanelCardProps, PanelAction } from '../../packages/ui-kit/src/components/PanelCard/PanelCard';
  export { Heading, Text, Caption } from '../../packages/ui-kit/src/components/Typography/Typography';
  export type { CaptionProps } from '../../packages/ui-kit/src/components/Typography/Typography';
  export * from '../../packages/ui-kit/src/components/Typography/Typography';
  export { DataTable } from '../../packages/ui-kit/src/components/DataTable/DataTable';
  export type {
    DataTableProps,
    DataTableColumn,
    DataTableFilterOption,
    DataTableSortOrder
  } from '../../packages/ui-kit/src/components/DataTable/DataTable';
}
