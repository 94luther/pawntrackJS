import { useEffect, useMemo, useState } from "react";
import Shell from "./components/Shell.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import ActivePawns from "./pages/ActivePawns.jsx";
import Inventory from "./pages/Inventory.jsx";
import Loans from "./pages/Loans.jsx";
import { api } from "./lib/api.js";
import { buildModel, dateInputValue, money, parseNumber, today, daysBetween } from "./lib/model.js";
import { snapshot } from "./data/snapshot.js";

const tabs = ["Dashboard", "Active Pawns", "Loans", "Inventory"];

export default function App() {
  const [source, setSource] = useState(snapshot);
  const [view, setView] = useState("Dashboard");
  const [status, setStatus] = useState("Loading live Google Sheets");
  const [writeStatus, setWriteStatus] = useState("Ready");
  const [selectedLoanId, setSelectedLoanId] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [loanDueDate, setLoanDueDate] = useState("");
  const [selectedInventoryId, setSelectedInventoryId] = useState("");
  const [sellPrice, setSellPrice] = useState("");
  const [pawnedAmount, setPawnedAmount] = useState("");

  const model = useMemo(() => buildModel(source), [source]);

  async function refresh() {
    try {
      const result = await api.sheetData();
      setSource(result.data);
      setStatus("Live Google Sheets connected");
    } catch {
      setStatus("Using local snapshot");
    }
  }

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 10000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const firstLoan = model.loans.find(loan => loan.remaining > 0);
    if (!selectedLoanId && firstLoan) {
      setSelectedLoanId(firstLoan.id);
      setLoanDueDate(dateInputValue(firstLoan.dueDate));
    }
    const firstItem = model.availableInventory[0];
    if (!selectedInventoryId && firstItem) {
      setSelectedInventoryId(firstItem.id);
      setPawnedAmount(firstItem.pawnAmount ? String(Math.round(firstItem.pawnAmount)) : "");
    }
  }, [model, selectedLoanId, selectedInventoryId]);

  async function saveLoanUpdate() {
    const loan = model.loans.find(item => item.id === selectedLoanId);
    if (!loan) return setWriteStatus("Choose a loan first.");
    const amount = parseNumber(paymentAmount);
    const updates = [];
    if (amount > 0) {
      const paidColumn = loan.sheetName === "OS Debts" ? "I" : "J";
      const remainingColumn = loan.sheetName === "OS Debts" ? "J" : "K";
      const newPaid = loan.paid + amount;
      updates.push({ range: `'${loan.sheetName}'!${paidColumn}${loan.rowNumber}`, values: [[newPaid]] });
      updates.push({ range: `'${loan.sheetName}'!${remainingColumn}${loan.rowNumber}`, values: [[Math.max(loan.total - newPaid, 0)]] });
    }
    if (loanDueDate) {
      const dueColumn = loan.sheetName === "OS Debts" ? "G" : "H";
      updates.push({ range: `'${loan.sheetName}'!${dueColumn}${loan.rowNumber}`, values: [[loanDueDate]] });
    }
    if (!updates.length) return setWriteStatus("Enter repayment, due date, or both.");
    await api.batchUpdate(updates);
    setWriteStatus(`Updated ${loan.client}.`);
    setPaymentAmount("");
    await refresh();
  }

  async function markSold() {
    const item = model.availableInventory.find(record => record.id === selectedInventoryId);
    if (!item) return setWriteStatus("Choose an inventory item.");
    const price = parseNumber(sellPrice);
    const pawned = parseNumber(pawnedAmount);
    if (!price || !pawned) return setWriteStatus("Enter sell price and pawned amount.");
    const profit = price - pawned;
    const saleDate = dateInputValue(today);
    const dateGiven = item.dateGiven ? dateInputValue(item.dateGiven) : "";
    const daysHeld = item.dateGiven ? daysBetween(today, item.dateGiven) : "";
    const updates = [
      { range: `'${item.sheetName}'!K1:N1`, values: [["Sale Date", "Date Given", "Expected Repayment", "Days Held"]] },
      { range: `'${item.sheetName}'!D${item.rowNumber}`, values: [["Sold"]] },
      { range: `'${item.sheetName}'!G${item.rowNumber}`, values: [[pawned]] },
      { range: `'${item.sheetName}'!H${item.rowNumber}`, values: [[price]] },
      { range: `'${item.sheetName}'!I${item.rowNumber}`, values: [[profit]] },
      { range: `'${item.sheetName}'!K${item.rowNumber}:N${item.rowNumber}`, values: [[saleDate, dateGiven, item.expectedRepayment || "", daysHeld]] }
    ];
    await api.inventorySale({
      item: { id: item.id, product: item.product, category: item.category, listedAmount: item.value, pawnedAmount: pawned, expectedRepayment: item.expectedRepayment, dateGiven, daysHeld, saleDate, sellAmount: price, profit, sheetName: item.sheetName, rowNumber: item.rowNumber, pawnAmountSource: item.pawnAmountSource },
      updates
    });
    setWriteStatus(`Sold ${item.product} for ${money.format(price)}.`);
    setSellPrice("");
    await refresh();
  }

  return (
    <Shell tabs={tabs} view={view} setView={setView} status={status}>
      {view === "Dashboard" && <Dashboard model={model} />}
      {view === "Active Pawns" && <ActivePawns model={model} selectedLoanId={selectedLoanId} setSelectedLoanId={setSelectedLoanId} paymentAmount={paymentAmount} setPaymentAmount={setPaymentAmount} loanDueDate={loanDueDate} setLoanDueDate={setLoanDueDate} saveLoanUpdate={saveLoanUpdate} writeStatus={writeStatus} />}
      {view === "Loans" && <Loans model={model} setSelectedLoanId={setSelectedLoanId} paymentAmount={paymentAmount} setPaymentAmount={setPaymentAmount} loanDueDate={loanDueDate} setLoanDueDate={setLoanDueDate} saveLoanUpdate={saveLoanUpdate} writeStatus={writeStatus} />}
      {view === "Inventory" && <Inventory model={model} selectedInventoryId={selectedInventoryId} setSelectedInventoryId={setSelectedInventoryId} sellPrice={sellPrice} setSellPrice={setSellPrice} pawnedAmount={pawnedAmount} setPawnedAmount={setPawnedAmount} markSold={markSold} writeStatus={writeStatus} />}
    </Shell>
  );
}
