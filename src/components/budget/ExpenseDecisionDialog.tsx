import { useEffect, useRef, useState } from "react";
import type { BudgetTransaction } from "../../lib/budget";
import { formatMoney } from "../../lib/budget";
import { Button, Card, Textarea } from "../ui";

export default function ExpenseDecisionDialog({ transaction, action, onCancel, onConfirm }: {
  transaction: BudgetTransaction;
  action: "approve" | "void";
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState("");
  const approving = action === "approve";
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} className="expense-decision-dialog" aria-labelledby="expense-decision-title"
    onCancel={(event) => { event.preventDefault(); onCancel(); }}>
    <Card padding="md">
      <form onSubmit={(event) => { event.preventDefault(); if (approving || reason.trim()) onConfirm(reason.trim()); }}>
        <h2 id="expense-decision-title">{approving ? "Confirm expense approval" : "Void approved expense"}</h2>
        <p><strong>{formatMoney(transaction.amount)}</strong> · {transaction.vendor ?? "No vendor"} · {transaction.transaction_date ?? "No date"}</p>
        <p>{transaction.description}</p>
        <p>{transaction.is_house_card ? "House Card — no reimbursement" : "Paid personally — reimbursement requested"}</p>
        {approving ? <p>Check the amount, vendor, date, and existing expenses for duplicates. Approval locks these details and prevents deletion. Corrections will require a recorded void.</p>
          : <p>This expense will remain in history and stop counting toward budget spending. Reimbursed expenses cannot be voided.</p>}
        {!approving && <Textarea id="expenseVoidReason" label="Reason for voiding" required maxLength={2000} value={reason} onChange={(event) => setReason(event.target.value)} />}
        <div className="d-flex gap-2 mt-3">
          <Button type="button" variant="outline-secondary" onClick={onCancel}>Cancel</Button>
          <Button type="submit" variant={approving ? "primary" : "danger"} disabled={!approving && !reason.trim()}>{approving ? "Approve expense" : "Void expense"}</Button>
        </div>
      </form>
    </Card>
  </dialog>;
}
