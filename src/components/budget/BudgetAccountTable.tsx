import { calculateBudgetSummary, formatMoney, type BudgetAccount, type BudgetTransaction } from "../../lib/budget";
import {
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "../ui";

type BudgetAccountTableProps = {
  accounts: BudgetAccount[];
  transactions: BudgetTransaction[];
};

export default function BudgetAccountTable({ accounts, transactions }: BudgetAccountTableProps) {
  return (
    <Table minWidth={780} className="budget-table-wrap">
      <TableHead>
        <TableRow>
          <TableHeaderCell>Account</TableHeaderCell>
          <TableHeaderCell>Allocated</TableHeaderCell>
          <TableHeaderCell>Approved / reimbursed</TableHeaderCell>
          <TableHeaderCell>Pending</TableHeaderCell>
          <TableHeaderCell>Remaining</TableHeaderCell>
          <TableHeaderCell>Activity</TableHeaderCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {accounts.map((account) => {
          const accountTransactions = transactions.filter(
            (transaction) => transaction.budget_account_id === account.id
          );
          const summary = calculateBudgetSummary([account], accountTransactions);

          return (
            <TableRow key={account.id}>
              <TableCell>
                <div className="budget-table-primary">{account.role_slug}</div>
                {account.notes && <div className="budget-table-meta">{account.notes}</div>}
              </TableCell>
              <TableCell>{formatMoney(summary.allocated)}</TableCell>
              <TableCell>{formatMoney(summary.spent)}</TableCell>
              <TableCell>{formatMoney(summary.pending)}</TableCell>
              <TableCell className={summary.remaining < 0 ? "budget-remaining--negative" : "budget-remaining"}>
                {formatMoney(summary.remaining)}
              </TableCell>
              <TableCell>
                <Button to={`/app/budget/${account.id}`} variant="outline-secondary" size="sm">
                  View transactions
                </Button>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
