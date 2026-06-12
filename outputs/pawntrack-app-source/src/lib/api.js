const API_BASE = import.meta.env.VITE_API_BASE || "";

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

export const api = {
  health: () => request("/api/health"),
  sheetData: () => request("/api/sheet-data"),
  batchUpdate: updates => request("/api/sheet-batch-update", {
    method: "POST",
    body: JSON.stringify({ updates })
  }),
  inventorySale: payload => request("/api/inventory-sale", {
    method: "POST",
    body: JSON.stringify(payload)
  }),
  assistantAction: payload => request("/api/assistant-action", {
    method: "POST",
    body: JSON.stringify(payload)
  }),
  analyze: payload => request("/api/analyze", {
    method: "POST",
    body: JSON.stringify(payload)
  })
};
