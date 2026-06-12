# PawnTrack Financial Forecasting Dashboard

Open the preview app at:

http://127.0.0.1:8790

Files:

- `pawntrack-forecast-dashboard.html` - the dashboard UI with Recharts, forecasts, voice mode, live controls, and assistant actions.
- `pawntrack-ai-bridge.mjs` - the local backend for ChatGPT, Claude, and Google Sheets read/write.
- `pawntrack-database-schema.sql` - Postgres/Supabase tables for inventory items and sales.

Current preview:

- Uses the synced snapshot from Google Sheets file `NEW ONE`.
- Shows growth, collections, cash forecast, profit forecast, inventory intelligence, borrower risk scoring, AI analysis, and live controls.
- The Live tab is ready for payment writes and assistant-driven edits.
- Inventory items can be marked sold. The app tracks listed price, pawned amount, sell price, and profit/loss.
- For pawned amount, the app uses `Amount paid` first. If that is missing, it tries to infer the pawned amount from `Active Pawns`.
- When sold, the app writes `Sold` to `Listed on Market place`, logs `Amount paid`, logs `Sell amount`, calculates `Profit/loss`, removes sold items from available inventory value, and tracks total sales earned.

To enable full live Google Sheets read/write:

1. Share the `NEW ONE` Google Sheet with a Google Cloud service account email.
2. Start the backend with:

```powershell
$env:GOOGLE_SERVICE_ACCOUNT_JSON='{"client_email":"...","private_key":"..."}'
$env:OPENAI_API_KEY='...'
$env:ANTHROPIC_API_KEY='...'
node .\pawntrack-ai-bridge.mjs
```

Optional:

- `GOOGLE_ACCESS_TOKEN` can be used instead of service account JSON.
- `GOOGLE_SHEET_ID` defaults to the `NEW ONE` sheet ID.
- `OPENAI_MODEL` and `ANTHROPIC_MODEL` can override the model names.

To connect a database instead of keeping preview-only browser state:

1. Create a Supabase project.
2. Run `pawntrack-database-schema.sql` in Supabase SQL editor.
3. Start the backend with:

```powershell
$env:SUPABASE_URL='https://your-project.supabase.co'
$env:SUPABASE_SERVICE_ROLE_KEY='your-service-role-key'
node .\pawntrack-ai-bridge.mjs
```

Inventory sales then write to both Google Sheets and the database.

Safety:

- The app prepares assistant sheet edits first.
- For money-changing actions, press `Confirm Sheet Edit` before it writes to Google Sheets.
