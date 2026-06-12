import { money, dateInputValue, today, daysBetween } from "../lib/model.js";

export default function Inventory({ model, selectedInventoryId, setSelectedInventoryId, sellPrice, setSellPrice, pawnedAmount, setPawnedAmount, markSold, writeStatus }) {
  const selected = model.availableInventory.find(item => item.id === selectedInventoryId);
  function selectItem(id) {
    const item = model.availableInventory.find(x => x.id === id);
    setSelectedInventoryId(id);
    if (item) {
      setPawnedAmount(item.pawnAmount ? String(Math.round(item.pawnAmount)) : "");
      setSellPrice(String(item.value || ""));
    }
  }
  return (
    <div className="grid two">
      <section className="panel">
        <h2>Inventory Sale</h2>
        <div className="form-grid">
          <label>Item<select value={selectedInventoryId} onChange={e => selectItem(e.target.value)}>{model.availableInventory.map(item => <option key={item.id} value={item.id}>{item.product} - listed {money.format(item.value)} - pawned {item.pawnAmount ? money.format(item.pawnAmount) : "missing"}</option>)}</select></label>
          <label>Sell price<input value={sellPrice} onChange={e => setSellPrice(e.target.value)} /></label>
          <label>Pawned for<input value={pawnedAmount} onChange={e => setPawnedAmount(e.target.value)} /></label>
          <button onClick={markSold}>Mark Sold</button>
        </div>
        {selected && <p className="note">Expected repayment: {selected.expectedRepayment ? money.format(selected.expectedRepayment) : "missing"} · Date given: {selected.dateGiven ? selected.dateGiven.toLocaleDateString("en-GB") : "missing"} · Days held: {selected.dateGiven ? daysBetween(today, selected.dateGiven) : "missing"}</p>}
        <div className="write-status">{writeStatus}</div>
      </section>
      <section className="panel">
        <h2>Inventory Totals</h2>
        <div className="mini-grid">
          <div className="stat"><span>Available</span><strong>{money.format(model.inventoryValue)}</strong></div>
          <div className="stat"><span>Sales earned</span><strong>{money.format(model.salesEarned)}</strong></div>
          <div className="stat"><span>Sales profit</span><strong>{money.format(model.salesProfit)}</strong></div>
          <div className="stat"><span>Sold items</span><strong>{model.soldInventory.length}</strong></div>
        </div>
      </section>
      <section className="panel wide">
        <h2>Sales Log</h2>
        <div className="table">
          {model.soldInventory.map(item => (
            <div className="detail-row" key={item.id}>
              <div><strong>{item.product}</strong><span>{item.pawnAmountSource}</span></div>
              <div><small>Pawned</small><b>{money.format(item.pawnAmount)}</b></div>
              <div><small>Expected</small><b>{item.expectedRepayment ? money.format(item.expectedRepayment) : "Missing"}</b></div>
              <div><small>Listed</small><b>{money.format(item.value)}</b></div>
              <div><small>Sold</small><b>{money.format(item.sold)}</b></div>
              <div><small>Profit</small><b>{money.format(item.profit)}</b></div>
              <div><small>Days held</small><b>{item.daysHeld ?? "Missing"}</b></div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
