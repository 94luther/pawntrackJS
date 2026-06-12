export default function Shell({ tabs, view, setView, status, children }) {
  return (
    <main>
      <header className="topbar">
        <div>
          <p>PawnTrack</p>
          <h1>Pawnshop operations</h1>
        </div>
        <div className="sync-pill">{status}</div>
      </header>
      <nav className="tabs">
        {tabs.map(tab => <button key={tab} className={view === tab ? "active" : ""} onClick={() => setView(tab)}>{tab}</button>)}
      </nav>
      {children}
    </main>
  );
}
