import { money } from "../lib/model.js";
import StatCard from "../components/StatCard.jsx";

export default function ActivePawns({ model, selectedLoanId, setSelectedLoanId, paymentAmount, setPaymentAmount, loanDueDate, setLoanDueDate, saveLoanUpdate, writeStatus }) {
  const activeTotal = model.active.reduce((s, x) => s + x.loan, 0);
  const payback = model.active.reduce((s, x) => s + x.total, 0);
  const interest = model.active.reduce((s, x) => s + x.interest, 0);
  const remaining = model.active.reduce((s, x) => s + x.remaining, 0);
  return (
    <div className="grid two">
      <section className="panel">
        <h2>Active Pawns</h2>
        <div className="mini-grid">
          <StatCard label="Principal" value={money.format(activeTotal)} />
          <StatCard label="Expected payback" value={money.format(payback)} tone="green" />
          <StatCard label="Interest" value={money.format(interest)} tone="green" />
          <StatCard label="Remaining" value={money.format(remaining)} tone="amber" />
        </div>
      </section>
      <section className="panel">
        <h2>Edit Active Pawn</h2>
        <div className="form-grid">
          <label>Pawn<select value={selectedLoanId} onChange={e => setSelectedLoanId(e.target.value)}>{model.active.map(loan => <option key={loan.id} value={loan.id}>{loan.item} - {money.format(loan.remaining)}</option>)}</select></label>
          <label>Repayment<input value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} placeholder="200" /></label>
          <label>New due date<input type="date" value={loanDueDate} onChange={e => setLoanDueDate(e.target.value)} /></label>
          <button onClick={saveLoanUpdate}>Save</button>
        </div>
        <div className="write-status">{writeStatus}</div>
      </section>
      <section className="panel wide">
        <h2>Active Pawn Details</h2>
        <div className="table">
          {model.active.map(loan => (
            <button className="detail-row" key={loan.id} onClick={() => setSelectedLoanId(loan.id)}>
              <div><strong>{loan.item}</strong><span>{loan.client || "No client name"} - {loan.location || "No location"}</span></div>
              <div><small>Loan</small><b>{money.format(loan.loan)}</b></div>
              <div><small>Interest</small><b>{money.format(loan.interest)}</b></div>
              <div><small>Payback</small><b>{money.format(loan.total)}</b></div>
              <div><small>Paid</small><b>{money.format(loan.paid)}</b></div>
              <div><small>Remaining</small><b>{money.format(loan.remaining)}</b></div>
              <div><small>Due</small><b>{loan.dueDate ? loan.dueDate.toLocaleDateString("en-GB") : "Missing"}</b></div>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
