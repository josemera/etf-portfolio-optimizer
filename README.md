# Portfolio Backtest & Optimizer

A self-contained browser tool for backtesting ETF portfolios, selecting an ETF universe visually, exploring the efficient frontier, and running rolling-window optimization across historical market regimes. No server required; open the HTML file locally and everything runs in-browser off the bundled data (an optional local server enables live Yahoo Finance refresh — see [Running the Tool](#running-the-tool)).

---

## ETFs Included

| Ticker | Name | Role |
|--------|------|------|
| SCHD | Schwab US Dividend Equity ETF | Dividend growth · ~3.5% yield |
| VTI | Vanguard Total Stock Market ETF | Broad US market |
| QQQ | Invesco Nasdaq-100 ETF | Large-cap tech / growth |
| IVV | iShares Core S&P 500 ETF | S&P 500 index |
| VPU | Vanguard Utilities ETF | Defensive income · ~3% yield |
| IYF | iShares US Financials ETF | Financial sector |
| SMH | VanEck Semiconductor ETF | Semiconductor cycle |
| VGT | Vanguard Information Technology ETF | Pure US tech sector |
| XLE | Energy Select Sector SPDR | Energy producers · ~3.5% yield |
| DVY | iShares Select Dividend ETF | High-dividend US stocks · ~3.5% yield |

The app's bundled monthly total return data covers **Jan 2004-Apr 2026** (268 months per ETF).

**Not every ETF has data for the full range.** Most of the universe has complete Yahoo Finance history from Jan 2004, but SCHD's first data month is **Oct 2011** — its earlier months are stored as null and treated as unavailable. When the selected backtest start date predates an ETF's first data month, the app automatically deselects that ETF (its card turns amber); it becomes selectable again once the start date moves past its inception. The default backtest start is **Jan 2012**, at which point all 10 ETFs are available.

---

## How to Use

### 1. Build the ETF Universe

1. Set the **Start Month/Year** for the backtest period (selectable back to Jan 2004; defaults to Jan 2012). Starting before Oct 2011 auto-deselects SCHD, which has no earlier data.
2. Click ETF cards to **select or deselect** the universe you want the backtest and optimizer to use.
3. At least **2 ETFs must remain selected**. Deselecting below that is blocked.
4. Any selection change resets the portfolio to **equal weights** across the selected ETFs.
5. Equal weights are stored as integer percentages summing to 100. When 100 does not divide evenly, the remainder is distributed deterministically. For example, 3 ETFs reset to `34/33/33`.

### 2. Review the Active Portfolio

The active portfolio always starts from a **$100K notional value** for calculation purposes, but allocations are represented as **percentage weights**, not manually entered dollar amounts.

The control box shows:

- **Total Allocated** — should remain `$100K · 100%`
- **Final Value**
- **Portfolio CAGR**
- **Max Drawdown**
- **Total Portfolio Gain**

Use **↺ Reset to Equal Weights** at any time to restore equal weighting across the selected ETFs.

### 3. Read the Backtest Views

Use the chart tabs:

- **Growth Chart** — cumulative dollar value over time
- **Annual Returns** — calendar-year return bars for invested ETFs
- **% Gains** — all invested ETFs and the portfolio normalized to 0% at the selected start date

Use the tables:

- **Performance Summary** — per-ETF and portfolio metrics for the active portfolio
- **Year-by-Year Portfolio Values** — two grouped toggles:
  - **Display**: `$` or `%`
  - **Measure**: `Cumulative` or `Yearly`
  - Full years use year-end values; the current partial year uses the **latest closed month**
- **Year-by-Year Max Drawdown** — yearly intra-year peak-to-trough drawdown

Hover any ETF card to see the full ETF name and descriptor.

### 4. Run the Portfolio Optimizer

The optimizer works only on the **currently selected ETF cards** and solves for percentage weights in **1% steps**.

The optimizer now has its own in-sample training controls:

- **Optimizer Start** — independent from the main backtest start date, but it cannot be earlier than the main start date
- **Optimization Window** — `Full Period` or a fixed number of months from the optimizer start date

The UI shows the resolved optimization range explicitly, for example:

```text
Optimizing on Jan 2018-Dec 2020 (36 months)
```

Objective:

```text
Score = CAGR / MaxDrawdown^w
```

Risk slider behavior:

| w | Behavior |
|---|----------|
| 0.0 | Pure CAGR maximization |
| 1.0 | Balanced return vs drawdown |
| 2.0 | Aggressive drawdown minimization |

How it works:

1. **Random sampling** — generates 800 valid portfolios over the selected ETF universe
2. **Best seed selection** — keeps the highest score under the current `w`
3. **Hill-climbing** — performs 3,000 greedy 1%-step swaps between tickers

To use it:

1. Select the ETF cards you want included.
2. Set the **Optimizer Start** date if you want the training period to begin later than the main backtest start.
3. Choose an **Optimization Window** (`Full Period`, `12`, `24`, `36`, `60`, `84`, or `120` months).
4. Set the risk slider.
5. Use **Max Allocation / Ticker** to cap concentration (10%-100%).
6. Use **Min Allocation / Selected Ticker** (`0%`-`20%` in `5%` steps) if you want every selected ETF to keep at least a minimum weight.
7. Optionally set a **Max DD filter** to discard samples above a drawdown threshold.
8. Click **Run Optimizer**.
9. Click any frontier point to preview it.
10. Click **Apply This Allocation ↑** to make that previewed optimized allocation the active backtest portfolio.

Important behavior:

- With **Min Allocation / Selected Ticker = 0%**, selected ETFs are eligible for the run and may still be assigned `0%`.
- With **Min Allocation / Selected Ticker > 0%**, every selected ETF becomes a required holding for that run and must receive at least that minimum weight.
- Deselected ETFs are treated as if they do not exist; the optimizer does not see them.
- The optimizer trains on its own resolved range, not necessarily the full backtest period.
- The **applied allocation is still evaluated over the full backtest period** from the main `Start Month/Year`.
- Changing the main start date, optimizer start date, optimization window, max-allocation cap, or min-allocation floor clears stale optimizer results and requires a rerun.
- If the requested optimization window is longer than the available history from the optimizer start date, it is automatically clamped to the available period.
- The optimizer enforces feasibility for the selected universe. For example, if the chosen minimum and maximum cannot sum to `100%` across the selected ETFs, the run is disabled until the settings are feasible.

### 5. Run the Rolling Window Optimizer

The rolling optimizer runs the same optimization logic across **rolling 5-year windows**, starting at 2012-16 and stepping annually through the latest complete 5-year span in the data (currently 2021-25).

It uses the **currently selected ETF universe**. Within each window, ETFs whose inception postdates the window start are excluded from that window's optimization; a window is skipped (and flagged in the status line) if fewer than 2 ETFs remain or the max-allocation cap becomes infeasible.

Outputs:

- **Average Allocation** — average percentage weight by ETF across windows
- **Allocation Stability** — standard deviation of ETF weights across windows
- **Consistency** — count of windows where an ETF appears with allocation > 0%
- **Stacked allocation chart** — per-window weights
- **CAGR vs Max Drawdown chart**
- **Full rolling table** — window allocations, CAGR, max drawdown, score, and averages

---

## Notes

### Return Data

Monthly total returns include price appreciation and dividends reinvested, sourced from Yahoo Finance adjusted close prices. The bundled dataset contains **268 monthly points per ETF** (Jan 2004-Apr 2026); months before an ETF's inception (currently only SCHD, first data Oct 2011) are stored as null.

### Date Range Policy

- The bundled dataset starts at **Jan 2004** (`DATA_START_YEAR`)
- The bundled snapshot currently ends at **Apr 2026** (last fetch: April 2026)
- Only **closed calendar months** are ever included — the data pipeline fetches through the last completed month
- The bundle can be brought current with `npm run update-data` (rewrites `data/monthly_returns.json` and patches `BUNDLED_RETURNS` in `index.html`) or, in the browser, with the in-app **↻ Refresh** button (stores updates in localStorage)

### Max Drawdown

Max drawdown is calculated across **monthly snapshots**, not daily data. Intra-month drawdowns are not captured, so realized drawdown can be somewhat worse than the reported value.

### Weight Model

The app uses **integer percentage weights** summing to 100%, while keeping a **$100K notional starting portfolio** so backtest outputs remain intuitive in dollars.

### Allocation Constraints

The main optimizer supports both:

- **Max Allocation / Ticker** — caps concentration
- **Min Allocation / Selected Ticker** — prevents selected ETFs from being ignored when set above `0%`

The minimum-allocation control applies only to the **main optimizer**. The rolling optimizer still uses only the maximum-allocation cap.

### In-Sample vs Out-of-Sample

The main backtest period and the optimizer training period are intentionally separate.

- The main `Start Month/Year` defines the portfolio evaluation period shown in charts and tables
- `Optimizer Start` plus `Optimization Window` define the in-sample range used for optimization scoring
- This makes it possible to optimize on a later subset of history and then inspect how the resulting allocation behaves on the broader backtest window

### Overfitting Risk

With a small ETF universe and a fixed historical sample, the optimizer is prone to overfitting. Concentrated outputs should be interpreted as "worked best in this sample" rather than "should be held going forward."

### What the Optimizer Does Not Know

- Your retirement date or income requirements
- Tax implications of rebalancing
- Transaction costs or spreads
- Future correlation changes
- Existing concentration or external constraints

---

## Interpretation Framework

A single optimizer output is often less useful than separating the problem into two buckets:

**Bucket 1 — Safety / Diversification**  
Lower drawdown, broader diversification. SCHD + VPU + DVY or other defensive mixes. Higher `w` settings tend to approximate this.

**Bucket 2 — Growth**  
Higher CAGR, higher tolerated volatility. SMH + QQQ or VGT. Lower `w` settings tend to approximate this.

---

## Running the Tool

No installation required for the core app. Open `index.html` in any modern browser:

```bash
open index.html
```

Chart rendering requires an internet connection to load Chart.js from the Cloudflare CDN (`cdnjs.cloudflare.com`). The core calculations still run locally in the browser.

To enable the in-app **↻ Refresh** and **✓ Validate** buttons (live Yahoo Finance data), serve the app instead of opening it as a file:

```bash
npm start        # serves on http://localhost:3000 and proxies /api/yf/* to Yahoo Finance
```

Routing for live data: `file://` is blocked by Yahoo Finance (the app shows a clear error), `http://localhost` goes through the bundled `server.js` proxy, and `https://` hosting (e.g. GitHub Pages) routes through `corsproxy.io`. Refreshed data is persisted in localStorage on top of the bundled snapshot.

## Updating & Validating Data

The canonical pipeline is Node-based (requires Node ≥ 20; `npm install` once for `yahoo-finance2`):

```bash
npm run update-data     # fetches Yahoo Finance, updates data/monthly_returns.json and patches BUNDLED_RETURNS in index.html
npm run validate-data   # recomputes every bundled monthly return against Yahoo Finance
```

Both are anchored at **2004-01** and fetch only through the **last completed calendar month**. `update-data.js` supports `--refresh-all` and repeatable `--ticker` flags; `data/tickers.txt` defines the universe.

Validation recomputes each monthly return as:

```text
AdjClose[m] / AdjClose[m-1] - 1
```

and compares the rounded result against the stored value.

### Legacy Python scripts

The earlier Python tooling still exists but predates the Jan 2004 data extension — both scripts remain constrained to a **2012-01** start:

```bash
python3 scripts/validate_monthly_returns.py                      # validate index.html data
python3 scripts/validate_monthly_returns.py --source-format csv  # validate the CSV export
python3 scripts/update_monthly_returns_csv.py                    # long-format CSV export (data/monthly_returns.csv) for future Supabase ingestion
```

---

*Past performance does not guarantee future results. This tool is for educational and exploratory purposes only and does not constitute financial advice.*
