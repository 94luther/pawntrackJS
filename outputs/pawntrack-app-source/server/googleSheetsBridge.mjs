import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createSign } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const config = await readConfig();
const port = Number(process.env.PORT || config.port || 8803);
const googleSheetId = process.env.GOOGLE_SHEET_ID || config.googleSheetId;
const googleServiceAccountFile = process.env.GOOGLE_SERVICE_ACCOUNT_FILE || config.googleServiceAccountFile;
const googleServiceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
let cachedToken = null;

async function readConfig() {
  try {
    return JSON.parse(await readFile(join(__dirname, "googleSheets.config.json"), "utf8"));
  } catch {
    return {};
  }
}

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
    req.on("data", chunk => body += chunk);
    req.on("end", () => resolve(body ? JSON.parse(body) : {}));
    req.on("error", reject);
  });
}

function base64url(value) {
  return Buffer.from(value).toString("base64").replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

async function getGoogleToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60000) return cachedToken.token;
  if (!googleServiceAccountJson && !googleServiceAccountFile) throw new Error("Missing GOOGLE_SERVICE_ACCOUNT_FILE or GOOGLE_SERVICE_ACCOUNT_JSON.");
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
  const body = `${header}.${claim}`;
  const signature = createSign("RSA-SHA256").update(body).sign(account.private_key, "base64url");
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${body}.${signature}` })
  });
  if (!response.ok) throw new Error(`Google auth failed: ${response.status}`);
  const data = await response.json();
  cachedToken = { token: data.access_token, expiresAt: Date.now() + (data.expires_in || 3600) * 1000 };
  return cachedToken.token;
}

async function sheetsFetch(path, options = {}) {
  const token = await getGoogleToken();
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${googleSheetId}${path}`, {
    ...options,
    headers: { "content-type": "application/json", authorization: `Bearer ${token}`, ...(options.headers || {}) }
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

async function getSheetData() {
  const ranges = ["'Company Owned Items'!A1:AE1000", "'OS Debts'!A1:X999", "'Active Pawns'!A1:AA991", "'Damaged goods'!A1:Z1000"];
  const params = new URLSearchParams();
  ranges.forEach(range => params.append("ranges", range));
  const data = await sheetsFetch(`/values:batchGet?${params}`);
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

async function batchUpdate(updates) {
  return sheetsFetch("/values:batchUpdate", {
    method: "POST",
    body: JSON.stringify({ valueInputOption: "USER_ENTERED", data: updates.map(update => ({ range: update.range, values: update.values })) })
  });
}

createServer(async (req, res) => {
  if (req.method === "OPTIONS") return sendJson(res, 200, { ok: true });
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname === "/api/health") return sendJson(res, 200, { ok: true, googleSheets: Boolean(googleServiceAccountFile || googleServiceAccountJson) });
    if (url.pathname === "/api/sheet-data") return sendJson(res, 200, { ok: true, data: await getSheetData() });
    if (url.pathname === "/api/sheet-batch-update" && req.method === "POST") {
      const payload = await readBody(req);
      return sendJson(res, 200, { ok: true, result: await batchUpdate(payload.updates || []) });
    }
    if (url.pathname === "/api/inventory-sale" && req.method === "POST") {
      const payload = await readBody(req);
      return sendJson(res, 200, { ok: true, result: await batchUpdate(payload.updates || []), sale: payload.item });
    }
    return sendJson(res, 404, { error: "Not found" });
  } catch (error) {
    return sendJson(res, 500, { error: error.message });
  }
}).listen(port, () => {
  console.log(`PawnTrack Google Sheets bridge running on http://127.0.0.1:${port}`);
});
