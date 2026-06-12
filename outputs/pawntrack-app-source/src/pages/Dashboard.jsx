import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import StatCard from "../components/StatCard.jsx";
import { money } from "../lib/model.js";

export default function Dashboard({ model }) {
  const data = [
    { name: "Principal", value: model.principalOutstanding },
    { name: "Expected", value: model.expectedRepayment },
    { name: "Inventory", value: model.inventoryValue },
    { name: "Sales", value: model.salesEarned }
  ];
  return (
    <div className="grid two">
      <section className="panel">
        <h2>Business Overview</h2>
        <div className="mini-grid">
          <StatCard label="Principal" value={money.format(model.principalOutstanding)} />
          <StatCard label="Expected repayment" value={money.format(model.expectedRepayment)} tone="green" />
          <StatCard label="Inventory value" value={money.format(model.inventoryValue)} tone="amber" />
          <StatCard label="Sales earned" value={money.format(model.salesEarned)} tone="green" />
        </div>
      </section>
      <section className="panel">
        <h2>Financial Position</h2>
        <div className="chart-area">
          <ResponsiveContainer>
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip formatter={v => money.format(v)} />
              <Bar dataKey="value" fill="#2563eb" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  );
}
