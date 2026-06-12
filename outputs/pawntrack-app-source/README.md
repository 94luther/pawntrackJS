# PawnTrack Live Dashboard

React/Vite source package for the PawnTrack pawnshop operations app.

## Run locally

```powershell
npm install
npm run start
```

Frontend: `http://127.0.0.1:5173/`

Backend: `http://127.0.0.1:8803/`

## Google Sheets

The backend reads and writes the `NEW ONE` spreadsheet through a Google service account.

Required env:

```powershell
$env:GOOGLE_SERVICE_ACCOUNT_FILE="C:\Users\94lut\Downloads\zippy-purpose-426703-q9-3048e05f6a58.json"
$env:GOOGLE_SHEET_ID="1Ga4hP0Cbp51lGHcm60wNXl3ec5oUlkB_RJ-GNZKfE2o"
```

Share the Google Sheet with the service account email as Editor.

## Key workflows

- Mark inventory sold
- Track pawned amount, listed amount, expected repayment, sale date, date given, days held, sell price, and profit/loss
- Update loan repayment amount
- Extend loan due date
- Forecast cash, profit, growth, collections, inventory, and active pawn exposure
