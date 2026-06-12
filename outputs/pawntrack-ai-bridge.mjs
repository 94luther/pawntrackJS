import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createSign } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function readLocalConfig() {
  try {
    return JSON.parse(await readFile(join(__dirname, "pawntrack-backend-config.json"), "utf8"));
  } catch {
    return {};
  }
}

const localConfig = await readLocalConfig();
const port = Number(process.env.PORT || localConfig.port || 8787);
const openAiKey = process.env.OPENAI_API_KEY;
const anthropicKey = process.env.ANTHROPIC_API_KEY;
const openAiModel = process.env.OPENAI_MODEL || "gpt-4.1-mini";
const anthropicModel = process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-latest";
const googleSheetId = process.env.GOOGLE_SHEET_ID || localConfig.googleSheetId || "1Ga4hP0Cbp51lGHcm60wNXl3ec5oUlkB_RJ-GNZKfE2o";
const googleAccessToken = process.env.GOOGLE_ACCESS_TOKEN;
const googleServiceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
const googleServiceAccountFile = process.env.GOOGLE_SERVICE_ACCOUNT_FILE || process.env.GOOGLE_APPLICATION_CREDENTIALS || localConfig.googleServiceAccountFile;
const supabaseUrl = process.env.SUPABASE_URL || localConfig.supabaseUrl;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || localConfig.supabaseKey;
let cachedGoogleToken = null;

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type"
  });
  res.end(JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 1_000_000) {
        req.destroy();
        reject(new Error("Request too large"));
      }
    });
    req.on("end", () => resolve(body ? JSON.parse(body) : {}));
    req.on("error", reject);
  });
}

function base64url(value) {
  return Buffer.from(value).toString("base64").replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

async function getGoogleToken() {
  if (googleAccessToken) return googleAccessToken;
  if (cachedGoogleToken && cachedGoogleToken.expiresAt > Date.now() + 60000) return cachedGoogleToken.token;
  if (!googleServiceAccountJson && !googleServiceAccountFile) throw new Error("Set GOOGLE_ACCESS_TOKEN, GOOGLE_SERVICE_ACCOUNT_JSON, or GOOGLE_SERVICE_ACCOUNT_FILE to enable live Google Sheets sync.");

  const account = JSON.parse(googleServiceAccountJson || await readFile(googleServiceAccountFile, "utf8"));
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64url(JSON.stringify({
    iss: account.client_email,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600
  }));
  const assertionBody = `${header}.${claim}`;
  const signature = createSign("RSA-SHA256").update(assertionBody).sign(account.private_key, "base64url");
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${assertionBody}.${signature}`
    })
  });
  if (!response.ok) throw new Error(`Google auth returned ${response.status}`);
  const data = await response.json();
  cachedGoogleToken = { token: data.access_token, expiresAt: Date.now() + (data.expires_in || 3600) * 1000 };
  return cachedGoogleToken.token;
}

async function googleSheetsFetch(path, options = {}) {
  const token = await getGoogleToken();
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${googleSheetId}${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
      ...(options.headers || {})
    }
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Google Sheets returned ${response.status}: ${errorText.slice(0, 220)}`);
  }
  return response.json();
}

async function getLiveSheetData() {
  const ranges = [
    "'Company Owned Items'!A1:AE1000",
    "'OS Debts'!A1:X999",
    "'Active Pawns'!A1:AA991",
    "'Damaged goods'!A1:Z1000"
  ];
  const params = new URLSearchParams();
  ranges.forEach(range => params.append("ranges", range));
  params.set("majorDimension", "ROWS");
  const data = await googleSheetsFetch(`/values:batchGet?${params}`);
  const values = Object.fromEntries((data.valueRanges || []).map(range => [range.range.split("!")[0].replaceAll("'", ""), range.values || []]));
  return {
    syncedAt: new Date().toISOString(),
    source: "Google Sheets: NEW ONE",
    companyOwnedItems: values["Company Owned Items"] || [],
    osDebts: values["OS Debts"] || [],
    activePawns: values["Active Pawns"] || [],
    damagedGoods: values["Damaged goods"] || []
  };
}

async function batchUpdateSheetValues(updates) {
  if (!Array.isArray(updates) || !updates.length) throw new Error("No sheet updates supplied.");
  return googleSheetsFetch("/values:batchUpdate", {
    method: "POST",
    body: JSON.stringify({
      valueInputOption: "USER_ENTERED",
      data: updates.map(update => ({
        range: update.range,
        majorDimension: "ROWS",
        values: update.values
      }))
    })
  });
}

async function supabaseFetch(path, options = {}) {
  if (!supabaseUrl || !supabaseKey) return null;
  const response = await fetch(`${supabaseUrl.replace(/\/$/, "")}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: supabaseKey,
      authorization: `Bearer ${supabaseKey}`,
      "content-type": "application/json",
      prefer: "return=representation",
      ...(options.headers || {})
    }
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Database returned ${response.status}: ${errorText.slice(0, 220)}`);
  }
  return response.status === 204 ? null : response.json();
}

async function insertInventorySale(item) {
  return supabaseFetch("inventory_sales", {
    method: "POST",
    body: JSON.stringify({
      inventory_item_id: item.id,
      product: item.product,
      category: item.category,
      listed_amount: item.listedAmount,
      pawned_amount: item.pawnedAmount,
      expected_repayment: item.expectedRepayment,
      sell_amount: item.sellAmount,
      profit_loss: item.profit,
      sale_date: item.saleDate,
      date_given: item.dateGiven || null,
      days_held: item.daysHeld === "" ? null : item.daysHeld,
      sheet_name: item.sheetName,
      sheet_row_number: item.rowNumber,
      pawn_amount_source: item.pawnAmountSource,
      sold_at: new Date().toISOString()
    })
  });
}

async function upsertInventorySnapshot(item, status = "Sold") {
  const query = "inventory_items?on_conflict=sheet_name,sheet_row_number";
  return supabaseFetch(query, {
    method: "POST",
    headers: { prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({
      inventory_item_id: item.id,
      product: item.product,
      category: item.category,
      listed_amount: item.listedAmount,
      pawned_amount: item.pawnedAmount,
      expected_repayment: item.expectedRepayment,
      sell_amount: item.sellAmount,
      profit_loss: item.profit,
      sale_date: item.saleDate,
      date_given: item.dateGiven || null,
      days_held: item.daysHeld === "" ? null : item.daysHeld,
      status,
      sheet_name: item.sheetName,
      sheet_row_number: item.rowNumber,
      pawn_amount_source: item.pawnAmountSource,
      updated_at: new Date().toISOString()
    })
  });
}

function localAssistantAction(payload) {
  const rawCommand = String(payload.command || "");
  const command = rawCommand.toLowerCase();
  const pricedMatch = command.match(/\b(?:for|at|price)\s*(?:p|bwp)?\s*(\d+(?:\.\d+)?)/);
  const saleAmount = pricedMatch ? Number(pricedMatch[1]) : Number((command.replace(/,/g, "").match(/\d+(\.\d+)?/) || [0])[0]);
  const amount = Number((command.replace(/,/g, "").match(/\d+(\.\d+)?/) || [0])[0]);
  const extensionMatch = rawCommand.match(/extend(?:ed)?\s+(?:to|until)\s+(\d{4}-\d{2}-\d{2}|\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4})/i);
  const dueDate = extensionMatch ? extensionMatch[1] : "";
  const loan = (payload.loans || []).find(item => command.includes(String(item.client || "").toLowerCase()));
  const inventoryItem = (payload.inventory || []).find(item => command.includes(String(item.product || "").toLowerCase()) || command.includes(String(item.category || "").toLowerCase()));
  if ((command.includes("sold") || command.includes("sell") || command.includes("mark")) && inventoryItem && saleAmount > 0) {
    return { type: "mark_inventory_sold", itemId: inventoryItem.id, amount: saleAmount, pawnedAmount: inventoryItem.pawnAmount, message: `Ready to mark ${inventoryItem.product} sold for ${saleAmount}. Pawned amount: ${inventoryItem.pawnAmount || "missing"}.` };
  }
  if ((command.includes("paid") || command.includes("payment") || command.includes("record")) && loan && amount > 0) {
    return { type: "add_payment", loanId: loan.id, amount, dueDate, message: `Ready to record payment of ${amount} for ${loan.client}${dueDate ? ` and extend to ${dueDate}` : ""}.` };
  }
  if ((command.includes("extend") || command.includes("due date")) && loan && dueDate) {
    return { type: "add_payment", loanId: loan.id, amount: 0, dueDate, message: `Ready to extend ${loan.client} to ${dueDate}.` };
  }
  if (command.includes("overdue")) return { type: "show_dashboard", view: "Collections", message: "Opening overdue loans." };
  if (command.includes("profit")) return { type: "show_dashboard", view: "Profit", message: "Opening profit forecast." };
  if (command.includes("inventory")) return { type: "show_dashboard", view: "Inventory", message: "Opening inventory." };
  return { type: "needs_review", message: "I need a clearer action before modifying the sheet." };
}

function promptFor(payload) {
  return [
    "You are a financial analyst for a Botswana pawnshop using live Google Sheets data.",
    "Give concise, practical guidance. Flag risks, collections priorities, cash timing, and inventory discount actions.",
    "Do not invent records. Use only the JSON data supplied.",
    "",
    `Requested action: ${payload.action}`,
    `Local model baseline: ${payload.localAnalysis}`,
    "",
    JSON.stringify({
      metrics: payload.metrics,
      riskyClients: payload.riskyClients,
      inventory: payload.inventory
    }, null, 2)
  ].join("\n");
}

async function callOpenAi(payload) {
  if (!openAiKey) return null;
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${openAiKey}`
    },
    body: JSON.stringify({
      model: openAiModel,
      input: promptFor(payload),
      max_output_tokens: 700
    })
  });
  if (!response.ok) throw new Error(`OpenAI returned ${response.status}`);
  const data = await response.json();
  return data.output_text || data.output?.flatMap(item => item.content || []).map(part => part.text || "").join("\n").trim();
}

async function callAnthropic(payload) {
  if (!anthropicKey) return null;
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": anthropicKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: anthropicModel,
      max_tokens: 700,
      messages: [{ role: "user", content: promptFor(payload) }]
    })
  });
  if (!response.ok) throw new Error(`Claude returned ${response.status}`);
  const data = await response.json();
  return data.content?.map(part => part.text || "").join("\n").trim();
}

async function analyze(payload) {
  const calls = await Promise.allSettled([callOpenAi(payload), callAnthropic(payload)]);
  const [openAi, claude] = calls.map(result => result.status === "fulfilled" ? result.value : null);
  const sections = [];
  if (openAi) sections.push(`ChatGPT analysis\n${openAi}`);
  if (claude) sections.push(`Claude analysis\n${claude}`);
  if (!sections.length) {
    return {
      provider: "Local model fallback",
      analysis: payload.localAnalysis || "No API keys found. Add OPENAI_API_KEY and ANTHROPIC_API_KEY to enable AI analysis."
    };
  }
  return {
    provider: [openAi && "ChatGPT", claude && "Claude"].filter(Boolean).join(" + "),
    analysis: sections.join("\n\n")
  };
}

createServer(async (req, res) => {
  if (req.method === "OPTIONS") return sendJson(res, 200, { ok: true });

  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname === "/api/health") {
      return sendJson(res, 200, {
        ok: true,
        chatgpt: Boolean(openAiKey),
        claude: Boolean(anthropicKey),
        googleSheets: Boolean(googleAccessToken || googleServiceAccountJson || googleServiceAccountFile),
        database: Boolean(supabaseUrl && supabaseKey)
      });
    }
    if (url.pathname === "/api/sheet-data" && req.method === "GET") {
      const data = await getLiveSheetData();
      return sendJson(res, 200, { ok: true, syncedAt: data.syncedAt, data });
    }
    if (url.pathname === "/api/sheet-batch-update" && req.method === "POST") {
      const payload = await readBody(req);
      const result = await batchUpdateSheetValues(payload.updates);
      return sendJson(res, 200, { ok: true, result });
    }
    if (url.pathname === "/api/inventory-sale" && req.method === "POST") {
      const payload = await readBody(req);
      if (!payload.item) throw new Error("Missing sale item.");
      const sheetResult = await batchUpdateSheetValues(payload.updates);
      const dbResults = await Promise.allSettled([
        upsertInventorySnapshot(payload.item, "Sold"),
        insertInventorySale(payload.item)
      ]);
      return sendJson(res, 200, {
        ok: true,
        sheetResult,
        database: Boolean(supabaseUrl && supabaseKey),
        dbResults: dbResults.map(result => result.status)
      });
    }
    if (url.pathname === "/api/assistant-action" && req.method === "POST") {
      const payload = await readBody(req);
      return sendJson(res, 200, { ok: true, provider: "Local command parser", action: localAssistantAction(payload) });
    }
    if (url.pathname === "/api/analyze" && req.method === "POST") {
      const payload = await readBody(req);
      return sendJson(res, 200, await analyze(payload));
    }
    if (url.pathname === "/" || url.pathname === "/pawntrack-forecast-dashboard.html") {
      const html = await readFile(join(__dirname, "pawntrack-forecast-dashboard.html"), "utf8");
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      return res.end(html);
    }
    return sendJson(res, 404, { error: "Not found" });
  } catch (error) {
    return sendJson(res, 500, { error: error.message });
  }
}).listen(port, () => {
  console.log(`PawnTrack dashboard running at http://localhost:${port}`);
  console.log("Set OPENAI_API_KEY and ANTHROPIC_API_KEY to enable ChatGPT + Claude analysis.");
});
