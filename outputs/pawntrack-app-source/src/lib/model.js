export const today = new Date("2026-06-12T12:00:00+02:00");
export const money = new Intl.NumberFormat("en-BW", { style: "currency", currency: "BWP", maximumFractionDigits: 0 });

export function parseNumber(value) {
  const match = String(value ?? "").replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  return match ? Number(match[0]) : 0;
}

export function parseDate(value) {
  if (!value) return null;
  const raw = String(value).trim();
  const months = { jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3, may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7, sep: 8, sept: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11 };
  let m = raw.match(/^(\d{1,2})[-/\s]([A-Za-z]{3,9})[-/\s](\d{4})$/);
  if (m) return new Date(Number(m[3]), months[m[2].toLowerCase()], Number(m[1]));
  m = raw.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function dateInputValue(date) {
  if (!date) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function daysBetween(a, b) {
  const ms = new Date(a.getFullYear(), a.getMonth(), a.getDate()) - new Date(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round(ms / 86400000);
}

function toObjects(rows) {
  const [headers, ...body] = rows || [[]];
  return body
    .map((row, index) => ({ row, rowNumber: index + 2 }))
    .filter(entry => entry.row?.some(cell => cell !== null && cell !== undefined && String(cell).trim() !== ""))
    .filter(entry => String(entry.row[0] || "").trim().toLowerCase() !== "totals")
    .map(entry => ({ ...Object.fromEntries(headers.map((h, i) => [String(h || `Column ${i + 1}`).trim(), entry.row[i] ?? null])), __rowNumber: entry.rowNumber }));
}

function tokensFor(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(token => token.length > 2);
}

function findPawnAmountMatch(product, category, candidates) {
  const productTokens = tokensFor(`${product} ${category}`);
  let best = null;
  for (const candidate of candidates) {
    const candidateTokens = tokensFor(candidate.item);
    const shared = productTokens.filter(token => candidateTokens.includes(token));
    const score = productTokens.length ? shared.length / productTokens.length : 0;
    if (score > 0 && (!best || score > best.score)) best = { ...candidate, score };
  }
  return best && best.score >= 0.45 ? best : null;
}

function riskBand(score) {
  if (score >= 70) return { label: "High risk", color: "#dc2626", fill: "rgba(220,38,38,.12)" };
  if (score >= 40) return { label: "Medium risk", color: "#f59e0b", fill: "rgba(245,158,11,.16)" };
  return { label: "Low risk", color: "#059669", fill: "rgba(5,150,105,.13)" };
}

export function buildModel(source) {
  const pawnCandidates = toObjects(source.activePawns).map((row, index) => {
    const item = String(row["Item Pawned"] || "").trim();
    const parts = item.split(",").map(p => p.trim()).filter(Boolean);
    const loan = parseNumber(row["Loan Amount"]);
    const expected = parseNumber(row["Total Payback"]) || loan + parseNumber(row["Interest Amount"]);
    return { id: `PAWN-${index + 1}`, item, loan, expectedRepayment: expected, amountPerItem: parts.length ? loan / parts.length : loan, expectedPerItem: parts.length ? expected / parts.length : expected, dateGiven: parseDate(row["Date Given"]) };
  }).filter(x => x.item && x.loan);

  const inventory = toObjects(source.companyOwnedItems).map((row, index) => {
    const product = String(row.Product || "Unknown item").trim();
    const category = String(row.Category || "Uncategorized").trim().toUpperCase();
    const value = parseNumber(row["List amount"]);
    const paid = parseNumber(row["Amount paid"]);
    const sold = parseNumber(row["Sell amount"]);
    const match = paid ? null : findPawnAmountMatch(product, category, pawnCandidates);
    const pawnAmount = paid || match?.amountPerItem || 0;
    const dateGiven = match?.dateGiven || null;
    const profit = parseNumber(row["Profit/loss"]) || (sold && pawnAmount ? sold - pawnAmount : 0);
    return {
      id: `I-${index + 1}`, sheetName: "Company Owned Items", rowNumber: row.__rowNumber,
      category, product, value, paid, sold, profit, pawnAmount,
      pawnAmountSource: paid ? "Amount paid column" : match ? `Active Pawns: ${match.item}` : "Missing",
      expectedRepayment: match?.expectedPerItem || 0, dateGiven,
      listed: String(row["Listed on Market place"] || "").trim(),
      isSold: sold > 0 || /sold/i.test(String(row["Listed on Market place"] || "")),
      daysHeld: dateGiven ? Math.max(0, daysBetween(today, dateGiven)) : null
    };
  });

  const mapLoan = (row, index, type, sheetName) => {
    const loan = parseNumber(row["Loan Amount"]);
    const interest = parseNumber(row["Interest Amount"]);
    const total = parseNumber(row["Total Payback"]) || loan + interest;
    const paid = parseNumber(row["Amount Paid"]);
    const dueDate = parseDate(row["Due Date"]);
    const remaining = parseNumber(row["Remaining Balance"]) || Math.max(total - paid, 0);
    const overdueDays = Math.max(parseNumber(row["Days Overdue"]), dueDate ? daysBetween(today, dueDate) : 0);
    const score = Math.min(100, (overdueDays > 0 ? Math.min(45, overdueDays * 1.5) : 0) + (paid > 0 && remaining > 0 ? 12 : 0) + (overdueDays > 0 && remaining > 0 ? 25 : 0) + (loan >= 5000 ? 20 : loan >= 2500 ? 12 : 6));
    return {
      id: `${sheetName === "Active Pawns" ? "P" : "O"}-${index + 1}`,
      sheetName, rowNumber: row.__rowNumber, type, loan, interest, total, paid, dueDate,
      remaining, overdueDays, riskScore: Math.round(score), risk: riskBand(score),
      client: String(row["Client Name"] || `${type} ${index + 1}`).trim(),
      item: String(row["Item Pawned"] || row["Column 1"] || "Loan item").trim(),
      dateGiven: parseDate(row["Date Given"]),
      location: String(row.Location || "").trim()
    };
  };

  const active = toObjects(source.activePawns).map((row, i) => mapLoan(row, i, "Active pawn", "Active Pawns"));
  const os = toObjects(source.osDebts).map((row, i) => mapLoan(row, i, "Outstanding debt", "OS Debts"));
  const loans = [...active, ...os].filter(x => x.loan || x.total || x.remaining);
  const availableInventory = inventory.filter(x => !x.isSold);
  const soldInventory = inventory.filter(x => x.isSold);
  const inventoryValue = availableInventory.reduce((s, x) => s + x.value, 0);
  const salesEarned = soldInventory.reduce((s, x) => s + x.sold, 0);
  const salesProfit = soldInventory.reduce((s, x) => s + x.profit, 0);

  return {
    source, inventory, availableInventory, soldInventory, active, os, loans,
    inventoryValue, salesEarned, salesProfit,
    principalOutstanding: loans.reduce((s, x) => s + x.loan, 0),
    expectedRepayment: loans.reduce((s, x) => s + x.total, 0),
    expectedInterest: loans.reduce((s, x) => s + x.interest, 0),
    remaining: loans.reduce((s, x) => s + x.remaining, 0),
    overdue: loans.filter(x => x.overdueDays > 0 && x.remaining > 0)
  };
}
