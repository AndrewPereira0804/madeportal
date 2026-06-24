import { formatMoney, type BudgetTransaction } from "../../lib/budget";
import {
  EmptyState,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "../ui";
import BudgetStatusBadge from "./BudgetStatusBadge";

type BudgetTransactionTableProps = {
  transactions: BudgetTransaction[];
};

function formatTransactionDate(value: string | null) {
  if (!value) {
    return "No date";
  }

  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function BudgetTransactionTable({ transactions }: BudgetTransactionTableProps) {
  if (transactions.length === 0) {
    return (
      <EmptyState
        compact
        title="No transactions yet"
        description="No transactions are visible for this budget account."
      />
    );
  }

  return (
    <Table minWidth={780} className="budget-table-wrap">
      <TableHead>
        <TableRow>
          <TableHeaderCell>Date</TableHeaderCell>
          <TableHeaderCell>Vendor</TableHeaderCell>
          <TableHeaderCell>Category</TableHeaderCell>
          <TableHeaderCell>Description</TableHeaderCell>
          <TableHeaderCell>Amount</TableHeaderCell>
          <TableHeaderCell>Status</TableHeaderCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {transactions.map((transaction) => (
          <TableRow
            key={transaction.id}
            className={transaction.status === "denied" ? "budget-transaction-row--denied" : undefined}
          >
            <TableCell>{formatTransactionDate(transaction.transaction_date)}</TableCell>
            <TableCell>{transaction.vendor ?? "No vendor"}</TableCell>
            <TableCell>{transaction.category ?? "Uncategorized"}</TableCell>
            <TableCell className="budget-description-cell">
              {transaction.description ?? "No description provided."}
              {transaction.denial_reason && (
                <div className="budget-table-meta">Denial reason: {transaction.denial_reason}</div>
              )}
            </TableCell>
            <TableCell className="budget-transaction-amount">{formatMoney(transaction.amount)}</TableCell>
            <TableCell>
              <BudgetStatusBadge status={transaction.status} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
