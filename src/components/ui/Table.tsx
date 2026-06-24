import type { HTMLAttributes, ReactNode, TdHTMLAttributes, ThHTMLAttributes } from "react";
import { cx } from "./utils";

export type TableProps = HTMLAttributes<HTMLTableElement> & {
  children: ReactNode;
  minWidth?: number | string;
  stickyHeader?: boolean;
};

export type TableSectionProps = HTMLAttributes<HTMLTableSectionElement> & {
  children: ReactNode;
};

export type TableRowProps = HTMLAttributes<HTMLTableRowElement> & {
  children: ReactNode;
};

export type TableHeaderCellProps = ThHTMLAttributes<HTMLTableCellElement> & {
  children: ReactNode;
};

export type TableCellProps = TdHTMLAttributes<HTMLTableCellElement> & {
  children: ReactNode;
};

export function Table({
  children,
  minWidth,
  stickyHeader = false,
  className,
  style,
  ...props
}: TableProps) {
  return (
    <div className={cx("ui-table-wrap", stickyHeader && "ui-table-wrap--sticky", className)}>
      <table
        className="ui-table"
        style={{
          ...style,
          ...(minWidth !== undefined ? { minWidth: typeof minWidth === "number" ? `${minWidth}px` : minWidth } : {}),
        }}
        {...props}
      >
        {children}
      </table>
    </div>
  );
}

export function TableHead({ children, className, ...props }: TableSectionProps) {
  return (
    <thead className={cx("ui-table__head", className)} {...props}>
      {children}
    </thead>
  );
}

export function TableBody({ children, className, ...props }: TableSectionProps) {
  return (
    <tbody className={cx("ui-table__body", className)} {...props}>
      {children}
    </tbody>
  );
}

export function TableRow({ children, className, ...props }: TableRowProps) {
  return (
    <tr className={cx("ui-table__row", className)} {...props}>
      {children}
    </tr>
  );
}

export function TableHeaderCell({ children, className, ...props }: TableHeaderCellProps) {
  return (
    <th scope="col" className={cx("ui-table__th", className)} {...props}>
      {children}
    </th>
  );
}

export function TableCell({ children, className, ...props }: TableCellProps) {
  return (
    <td className={cx("ui-table__td", className)} {...props}>
      {children}
    </td>
  );
}
