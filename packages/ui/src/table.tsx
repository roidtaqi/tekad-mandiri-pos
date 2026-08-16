import {
  forwardRef,
  type HTMLAttributes,
  type ReactNode,
  type TableHTMLAttributes,
  type TdHTMLAttributes,
  type ThHTMLAttributes,
} from "react";

import { classNames } from "./internal/class-names";

export interface TableWrapperProps
  extends Omit<
    HTMLAttributes<HTMLDivElement>,
    "aria-label" | "role" | "tabIndex"
  > {
  children: ReactNode;
  label: string;
}

export const TableWrapper = forwardRef<HTMLDivElement, TableWrapperProps>(
  function TableWrapper({ children, className, label, ...props }, ref) {
    return (
      <div
        {...props}
        aria-label={label}
        className={classNames("ks-table-wrapper", className)}
        ref={ref}
        role="region"
        tabIndex={0}
      >
        {children}
      </div>
    );
  },
);

export type TableDensity = "comfortable" | "compact";

export interface TableProps extends TableHTMLAttributes<HTMLTableElement> {
  children: ReactNode;
  density?: TableDensity;
}

export const Table = forwardRef<HTMLTableElement, TableProps>(function Table(
  { children, className, density = "comfortable", ...props },
  ref,
) {
  return (
    <table
      {...props}
      className={classNames("ks-table", className)}
      data-density={density}
      ref={ref}
    >
      {children}
    </table>
  );
});

export interface TableHeaderProps
  extends HTMLAttributes<HTMLTableSectionElement> {
  children: ReactNode;
}

export const TableHeader = forwardRef<
  HTMLTableSectionElement,
  TableHeaderProps
>(function TableHeader({ children, className, ...props }, ref) {
  return (
    <thead
      {...props}
      className={classNames("ks-table__head", className)}
      ref={ref}
    >
      {children}
    </thead>
  );
});

export interface TableBodyProps
  extends HTMLAttributes<HTMLTableSectionElement> {
  children: ReactNode;
}

export const TableBody = forwardRef<HTMLTableSectionElement, TableBodyProps>(
  function TableBody({ children, className, ...props }, ref) {
    return (
      <tbody
        {...props}
        className={classNames("ks-table__body", className)}
        ref={ref}
      >
        {children}
      </tbody>
    );
  },
);

export interface TableRowProps extends HTMLAttributes<HTMLTableRowElement> {
  children: ReactNode;
  selected?: boolean;
}

export const TableRow = forwardRef<HTMLTableRowElement, TableRowProps>(
  function TableRow(
    { children, className, selected = false, ...props },
    ref,
  ) {
    return (
      <tr
        {...props}
        className={classNames("ks-table__row", className)}
        data-selected={selected || undefined}
        ref={ref}
      >
        {children}
      </tr>
    );
  },
);

export type TableAlignment = "start" | "center" | "end";

export interface TableHeadProps
  extends Omit<ThHTMLAttributes<HTMLTableCellElement>, "align"> {
  align?: TableAlignment;
  children: ReactNode;
  numeric?: boolean;
}

export const TableHead = forwardRef<HTMLTableCellElement, TableHeadProps>(
  function TableHead(
    {
      align = "start",
      children,
      className,
      numeric = false,
      scope = "col",
      ...props
    },
    ref,
  ) {
    return (
      <th
        {...props}
        className={classNames(
          "ks-table__header",
          numeric && "ks-table__numeric",
          className,
        )}
        data-align={numeric ? "end" : align}
        data-numeric={numeric || undefined}
        ref={ref}
        scope={scope}
      >
        {children}
      </th>
    );
  },
);

export interface TableCellProps
  extends Omit<TdHTMLAttributes<HTMLTableCellElement>, "align"> {
  align?: TableAlignment;
  children: ReactNode;
  numeric?: boolean;
}

export const TableCell = forwardRef<HTMLTableCellElement, TableCellProps>(
  function TableCell(
    {
      align = "start",
      children,
      className,
      numeric = false,
      ...props
    },
    ref,
  ) {
    return (
      <td
        {...props}
        className={classNames(
          "ks-table__cell",
          numeric && "ks-table__numeric",
          className,
        )}
        data-align={numeric ? "end" : align}
        data-numeric={numeric || undefined}
        ref={ref}
      >
        {children}
      </td>
    );
  },
);
