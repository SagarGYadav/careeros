"use client";

import {
  columnFilteringFeature,
  columnVisibilityFeature,
  createColumnHelper,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  filterFn_includesString,
  globalFilteringFeature,
  rowPaginationFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_text,
  tableFeatures,
  useTable,
  type ColumnDef,
  type RowData,
} from "@tanstack/react-table";
import { Columns3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatNumber } from "@/lib/format";

// TanStack Table v9 only exposes the features registered here (sorting, text filter, column visibility,
// pagination). Defined once at module scope: the docs require stable `features` and `columns`.
export const dataTableFeatures = tableFeatures({
  rowSortingFeature,
  columnFilteringFeature,
  globalFilteringFeature,
  columnVisibilityFeature,
  rowPaginationFeature,
  sortedRowModel: createSortedRowModel(),
  filteredRowModel: createFilteredRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric, text: sortFn_text },
  filterFns: { includesString: filterFn_includesString },
});

export type DataTableFeatures = typeof dataTableFeatures;

/** Typed column helper for DataTable columns: `const col = dataTableColumns<Job>()`. */
export function dataTableColumns<TData extends RowData>() {
  return createColumnHelper<DataTableFeatures, TData>();
}

type DataTableProps<TData extends RowData> = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- columns mix value types, as in the TanStack docs
  columns: ColumnDef<DataTableFeatures, TData, any>[];
  data: TData[];
  /** Placeholder for the text filter; omit to hide the filter. */
  filterPlaceholder?: string;
  /** Shown when there are no rows at all (as opposed to no rows matching the filter). */
  emptyState?: React.ReactNode;
  pageSize?: number;
  /** Extra controls rendered on the right of the toolbar. */
  toolbar?: React.ReactNode;
};

/**
 * Standard table (SPEC §21): sorting, text filter, column visibility, pagination. Columns opt into sorting with
 * <SortableHeader>. Paginates client-side; server-side pagination is added where a list can exceed a few hundred rows.
 */
export function DataTable<TData extends RowData>({
  columns,
  data,
  filterPlaceholder,
  emptyState,
  pageSize = 50,
  toolbar,
}: DataTableProps<TData>) {
  const table = useTable({
    features: dataTableFeatures,
    columns,
    data,
    globalFilterFn: "includesString",
    initialState: { pagination: { pageIndex: 0, pageSize } },
  });

  if (data.length === 0 && emptyState) return <>{emptyState}</>;

  const hideableColumns = table.getAllLeafColumns().filter((column) => column.getCanHide());
  const filteredCount = table.getFilteredRowModel().rows.length;
  const { pageIndex } = table.state.pagination;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {filterPlaceholder && (
          <Input
            value={String(table.state.globalFilter ?? "")}
            onChange={(event) => table.setGlobalFilter(event.target.value)}
            placeholder={filterPlaceholder}
            aria-label={filterPlaceholder}
            className="h-8 w-full max-w-xs"
          />
        )}
        <div className="ml-auto flex items-center gap-2">
          {toolbar}
          {hideableColumns.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
                <Columns3 />
                Columns
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {hideableColumns.map((column) => (
                  <DropdownMenuCheckboxItem
                    key={column.id}
                    checked={column.getIsVisible()}
                    onCheckedChange={(value) => column.toggleVisibility(Boolean(value))}
                  >
                    {typeof column.columnDef.header === "string" ? column.columnDef.header : column.id}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      <table.FlexRender cell={cell} />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                  No rows match the filter.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {table.getPageCount() > 1 && (
        <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
          <span className="tabular-nums">
            {formatNumber(filteredCount)} {filteredCount === 1 ? "row" : "rows"} · page {pageIndex + 1} of{" "}
            {table.getPageCount()}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              Previous
            </Button>
            <Button variant="outline" size="sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
