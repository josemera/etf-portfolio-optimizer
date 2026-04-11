# Portfolio Backtest & Optimizer

A self-contained browser tool for backtesting ETF portfolios, selecting an ETF universe visually, exploring the efficient frontier, and running rolling-window optimization across historical market regimes. No server required; open the HTML file locally and everything runs in-browser.

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
| GSG | iShares S&P GSCI Commodity-Indexed Trust | Broad commodities basket |

The app's embedded monthly total return data covers **Jan 2012-Mar 2026**.

The Jan 2012 start is intentional. Some ETFs have earlier Yahoo Finance history, but starting in November 2011 would only provide two months for that first calendar year. The app, CSV export, and validator are all normalized to **Jan 2012** so the backtest window begins on a full-year boundary.

---

## How to Use

### 1. Build the ETF Universe

1. Set the **Start Month/Year** (Jan 2012-Mar 2026).
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
2. Set the risk slider.
3. Use **Max Allocation / Ticker** to cap concentration (10%-100%).
4. Optionally set a **Max DD filter** to discard samples above a drawdown threshold.
5. Click **Run Optimizer**.
6. Click any frontier point to preview it.
7. Click **Apply This Allocation ↑** to make that previewed optimized allocation the active backtest portfolio.

Important behavior:

- Selected ETFs are **eligible** for the run, but the optimizer may still assign them **0%**.
- Deselected ETFs are treated as if they do not exist; the optimizer does not see them.
- The optimizer uses only the **selected start month/year** from the main controls.

### 5. Run the Rolling Window Optimizer

The rolling optimizer runs the same optimization logic across **10 rolling 5-year windows** from 2012-16 through 2021-25.

It uses the **currently selected ETF universe**.

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

Monthly total returns include price appreciation and dividends reinvested, sourced from Yahoo Finance adjusted close prices. The embedded app dataset contains **171 monthly points per ETF** (Jan 2012-Mar 2026).

### Date Range Policy

- The embedded app dataset starts at **Jan 2012**
- The canonical CSV export also starts at **Jan 2012**
- The validator rejects datasets that do not start at **2012-01**
- The current end month is **Mar 2026**, because April 2026 is still open as of **April 10, 2026**

This keeps the app aligned to closed monthly data only, on a clean calendar-year boundary.

### Max Drawdown

Max drawdown is calculated across **monthly snapshots**, not daily data. Intra-month drawdowns are not captured, so realized drawdown can be somewhat worse than the reported value.

### Weight Model

The app uses **integer percentage weights** summing to 100%, while keeping a **$100K notional starting portfolio** so backtest outputs remain intuitive in dollars.

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
Lower drawdown, broader diversification. SCHD + VPU + GSG or other defensive mixes. Higher `w` settings tend to approximate this.

**Bucket 2 — Growth**  
Higher CAGR, higher tolerated volatility. SMH + QQQ or VGT. Lower `w` settings tend to approximate this.

---

## Running the Tool

No installation required. Open `index.html` in any modern browser:

```bash
open index.html
```

Chart rendering requires an internet connection to load Chart.js from the Cloudflare CDN (`cdnjs.cloudflare.com`). The core calculations still run locally in the browser.

## Data Validation

Validate the hard-coded `MONTHLY_RETURNS` block in `index.html` against Yahoo Finance:

```bash
python3 scripts/validate_monthly_returns.py
```

Validate the canonical CSV export instead:

```bash
python3 scripts/validate_monthly_returns.py --source-format csv
```

The validator recomputes each monthly return as:

```text
AdjClose[m] / AdjClose[m-1] - 1
```

and compares the one-decimal rounded result against the stored value.

The validator is intentionally constrained to datasets that begin at **2012-01**.

## Canonical Data Export

Build or update a CSV that can later be ingested into Supabase:

```bash
python3 scripts/update_monthly_returns_csv.py
```

This writes [data/monthly_returns.csv](/Users/josemera/Sites/etf-portfolio-optimizer/data/monthly_returns.csv) in long format with:

- `ticker`
- `month`
- `total_return_pct`
- `source`
- `fetched_at`

Behavior:

- Uses `data/tickers.txt` as the default ETF list, so the export universe is easy to extend
- Enforces **2012-01** as the earliest supported month
- Fetches only through the **last completed calendar month**
- Reuses the existing CSV as a checkpoint and only fetches missing trailing months unless `--refresh-all` is passed

---

*Past performance does not guarantee future results. This tool is for educational and exploratory purposes only and does not constitute financial advice.*
