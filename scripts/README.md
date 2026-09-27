## Scripts

Node data pipeline for `data/monthly_returns.json`, the app's only source of return data. Requires Node ≥ 22; run `npm install` once for `yahoo-finance2`.

`update-data.js` fetches Yahoo Finance monthly adjusted closes, computes monthly total returns, and rewrites `data/monthly_returns.json`. It fetches only months missing from the store, through the last *settled* month (2 weekdays past month-end, so early-month dividend ex-dates have posted).

`validate-data.js` re-fetches adjusted closes, recomputes every stored return as `AdjClose[m] / AdjClose[m-1] - 1`, and compares it to the stored value. Exit codes: `0` pass, `1` mismatches found, `2` data file not found.

Both are anchored at **2004-01**.

Run:

```bash
npm run update-data
npm run validate-data
```

Optional flags:

- `--ticker VTI` limits the run to one ticker. Repeat the flag for several tickers. For `update-data.js` this narrows only what is **fetched** — every other ticker already in the store is preserved.
- `--refresh-all` (`update-data.js`) refetches from `2004-01` instead of only missing months. Combined with `--ticker`, only those tickers are refetched.
- `--show-all` (`validate-data.js`) prints every validated month instead of only mismatches.

The ticker universe written to the JSON comes from `data/tickers.txt`. A GitHub Actions workflow (`.github/workflows/update-data.yml`) runs `update-data.js --refresh-all` on the 5th of each month and commits the JSON if it changed.
