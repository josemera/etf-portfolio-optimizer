## Scripts

`validate_monthly_returns.py` validates either the hard-coded `MONTHLY_RETURNS` block in `index.html` or the canonical CSV against Yahoo Finance monthly adjusted-close returns.

`update_monthly_returns_csv.py` fetches monthly ETF returns from Yahoo Finance and writes the canonical long-format CSV used for future data migration work.

Run:

```bash
python3 scripts/validate_monthly_returns.py
python3 scripts/validate_monthly_returns.py --source-format csv
python3 scripts/update_monthly_returns_csv.py
```

Optional flags:

- `--ticker VTI` limits validation to one ticker. Repeat the flag to validate several tickers.
- `--show-all` prints every validated month instead of only mismatches.
- `--source-format csv` validates `data/monthly_returns.csv` instead of `index.html`.
- `update_monthly_returns_csv.py` reads tickers from `data/tickers.txt` by default, writes `data/monthly_returns.csv`, and skips re-fetching tickers that are already current through the last completed month.
