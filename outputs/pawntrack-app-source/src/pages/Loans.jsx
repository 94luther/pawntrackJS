import { money } from "../lib/model.js";

export default function Loans({ model, setSelectedLoanId, paymentAmount, setPaymentAmount, loanDueDate, setLoanDueDate, saveLoanUpdate, writeStatus }) {
  return (
    <div className="grid two">
      <section className="panel">
        <h2>Loan Management</h2>
        <div className="risk-list">
          {model.loans.filter(loan => loan.remaining > 0).map(loan => (
            <button className="risk-card" key={loan.id} onClick={() => setSelectedLoanId(loan.id)} style={{ borderColor: loan.risk.color, background: loan.risk.fill }}>
              <div><b>{loan.client}</b><span>{loan.type} · {loan.item}</span></div>
              <strong style={{ color: loan.risk.color }}>{loan.riskScore}</strong>
              <em>{loan.risk.label}</em>
              <small>{money.format(loan.remaining)}</small>
            </button>
          ))}
        </div>
      </section>
      <section className="panel">
        <h2>Edit Selected Loan</h2>
        <div className="form-grid">
          <label>Repayment<input value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} /></label>
          <label>New due date<input type="date" value={loanDueDate} onChange={e => setLoanDueDate(e.target.value)} /></label>
          <button onClick={saveLoanUpdate}>Save Loan Update</button>
        </div>
        <div className="write-status">{writeStatus}</div>
      </section>
    </div>
  );
}
