# Portfolio Backtest & Optimizer

A self-contained browser tool for backtesting ETF portfolios, selecting an ETF universe visually, exploring the efficient frontier, running rolling-window optimization across historical market regimes, and walk-forward testing the optimizer out-of-sample. Everything runs in-browser off a monthly return dataset (`data/monthly_returns.json`) that a scheduled GitHub Actions job keeps current — any static file server will do (see [Running the Tool](#running-the-tool)).

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
| IYT | iShares US Transportation ETF | Airlines, rail, trucking · cyclical |
| BND | Vanguard Total Bond Market ETF | US investment-grade bonds · ~3.5% yield |
| VTWO | Vanguard Russell 2000 ETF | US small-cap stocks |
| IYJ | iShares US Industrials ETF | Industrial sector |

The app's monthly total return data (`data/monthly_returns.json`) covers **Jan 2004-Aug 2026** (272 months per ETF).

**Not every ETF has data for the full range.** Most of the universe has complete Yahoo Finance history from Jan 2004, but several ETFs start later: BND's first monthly return is **May 2007**, VTWO's is **Oct 2010**, SCHD's is **Nov 2011**, and VPU, VGT and IYT's is **Feb 2004** — earlier months are stored as null and treated as unavailable. When the selected backtest start date predates an ETF's first data month, the app automatically deselects that ETF (its card turns amber); it becomes selectable again once the start date moves past its inception. The default backtest start is **Jan 2012**, at which point all 14 ETFs are available.

---

## How to Use

### 1. Build the ETF Universe

1. Set the **Start Month/Year** for the backtest period (selectable back to Jan 2004; defaults to Jan 2012). Starting before Nov 2011 auto-deselects SCHD, before Oct 2010 also VTWO, and before May 2007 also BND, since none has earlier data; starting at Jan 2004 also auto-deselects VPU, VGT and IYT, whose first monthly return is Feb 2004.
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

- **Growth Chart** — cumulative dollar value over time, with a **Linear / Log** y-axis toggle (log spreads out the slower ETFs that a linear axis crushes against the bottom, and turns equal percentage moves into equal vertical distances)
- **Annual Returns** — calendar-year return bars for invested ETFs
- **% Gains** — all invested ETFs and the portfolio normalized to 0% at the selected start date

The Linear/Log toggle appears on the Growth tab only — the other two views carry negative values, which a log axis can't plot. Your choice is remembered when you switch away and back.

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

### 6. Run the Walk-Forward Simulation

The rolling tab describes per-window optima after the fact; the **Walk-Forward** tab answers the question it cannot: *if you had actually rebalanced into the optimizer's output each year, what would have happened?* Each January it optimizes on the trailing **lookback window** (36/48/60 months, default 60), holds that allocation out-of-sample for the next 12 months, then re-optimizes — chaining the hold periods into one live equity curve.

Controls:

- **Risk slider `w`** and **Max Allocation / Ticker** — same semantics as the other optimizers
- **Lookback Window** — training length per step
- **Universe Mode**:
  - **Fixed** (default) — the simulation starts at the first January where **every** selected ETF has full lookback history (all 14 selected with a 60-month lookback → Jan 2017). The universe is constant across the curve, so results are directly comparable.
  - **Dynamic** — starts earlier, at the first January where **at least 2** selected ETFs have full lookback history; ETFs join the universe as their history matures (flagged with a vertical "enters universe" marker on the chart and a per-step universe count in the table). If another ETF's history would mature mid-hold-year, the start is rounded forward to the next January so each step's universe is stable (e.g. with SCHD deselected and a 60-month lookback, Feb 2009 is the first feasible month; the run anchors at Jan 2010).
- **Benchmarks** (all on by default; checkboxes only toggle display):
  - **Equal weight, annual rebalance** — reset to equal weights at each step
  - **Equal weight, buy & hold** — set once at the start, never rebalanced
  - **Momentum** — 100% in the prior calendar year's best-performing eligible ETF, rotated annually
  - **Static optimum (hindsight — not investable)** — a single optimization over the full evaluation span held buy & hold; an upper reference, not a strategy

Outputs: the equity-curve chart (linear/log toggle, $100K normalized), a summary table (CAGR, max drawdown, score, final value — sorted by score) with the **average one-way turnover per rebalance**, and a per-step table showing each year's training window, eligible universe size, chosen allocation, hold-period return, and running value. The final year is truncated at the last data month and labeled *(partial)*.

**Expect the walk-forward strategy to land below equal weight.** With all 14 ETFs selected (Jan 2017–Aug 2026, `w=1`, 60-month lookback) walk-forward re-optimization scores ≈ 0.53 versus ≈ 0.68 for annually rebalanced equal weight, while the naive momentum rotation scores ≈ 1.88. That is the point of the tab: the optimizer describes the past; it does not predict. The optimizer is stochastic, so results vary slightly between runs.

---

## Notes

### Return Data

Monthly total returns include price appreciation and dividends reinvested, sourced from Yahoo Finance adjusted close prices. The dataset contains **272 monthly points per ETF** (Jan 2004-Aug 2026); months before an ETF's first data month (SCHD from Nov 2011; VTWO from Oct 2010; BND from May 2007; VPU, VGT and IYT from Feb 2004) are stored as null.

### Date Range Policy

- The dataset starts at **Jan 2004** (`DATA_START_YEAR`)
- It currently ends at **Aug 2026**; the header shows **Data through <month>** (hover it for the last fetch date), and the footnote shows the full covered range
- Only **settled calendar months** are ever included — the pipeline waits 2 weekdays past month-end so early-month dividend adjustments have posted
- A GitHub Actions workflow (`.github/workflows/update-data.yml`) refreshes `data/monthly_returns.json` on the 5th of each month; `npm run update-data` does the same locally (see [Updating & Validating Data](#updating--validating-data))

### Max Drawdown

Max drawdown is calculated across **monthly snapshots**, not daily data. Intra-month drawdowns are not captured, so realized drawdown can be somewhat worse than the reported value.

### Weight Model

The app uses **integer percentage weights** summing to 100%, while keeping a **$100K notional starting portfolio** so backtest outputs remain intuitive in dollars.

### Allocation Constraints

The main optimizer supports both:

- **Max Allocation / Ticker** — caps concentration
- **Min Allocation / Selected Ticker** — prevents selected ETFs from being ignored when set above `0%`

The minimum-allocation control applies only to the **main optimizer**. The rolling optimizer and the walk-forward simulation use only the maximum-allocation cap.

### In-Sample vs Out-of-Sample

The main backtest period and the optimizer training period are intentionally separate.

- The main `Start Month/Year` defines the portfolio evaluation period shown in charts and tables
- `Optimizer Start` plus `Optimization Window` define the in-sample range used for optimization scoring
- This makes it possible to optimize on a later subset of history and then inspect how the resulting allocation behaves on the broader backtest window
- The **Walk-Forward tab** automates this discipline: every allocation it holds was optimized only on data available before the hold period began

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

The app loads `data/monthly_returns.json` at startup, so it must be served over HTTP — opening `index.html` directly as a `file://` URL can't load the data. Any static file server works from the repo root, for example:

```bash
npx http-server -p 8080 -c-1
```

then open `http://localhost:8080`. Static hosting such as GitHub Pages works the same way.

Chart rendering requires an internet connection to load Chart.js from the Cloudflare CDN (`cdnjs.cloudflare.com`). The core calculations still run locally in the browser.

## Updating & Validating Data

The data pipeline is Node-based (requires Node ≥ 22; `npm install` once for `yahoo-finance2`):

```bash
npm run update-data     # fetches missing months from Yahoo Finance and rewrites data/monthly_returns.json
npm run validate-data   # recomputes every stored monthly return against Yahoo Finance
```

Both are anchored at **2004-01** and fetch only through the **last settled calendar month**. `update-data.js` supports `--refresh-all` and repeatable `--ticker` flags; `data/tickers.txt` defines the universe. `--ticker` limits which tickers are fetched (combined with `--refresh-all`, it refetches only those from scratch) — every other ticker in the store is preserved.

Validation recomputes each monthly return as:

```text
AdjClose[m] / AdjClose[m-1] - 1
```

and compares the rounded result against the stored value.

### Adding an ETF

`data/monthly_returns.json` is generated, and GitHub Actions also commits it to `main` every month. Treat it as a build output: regenerate it, never hand-merge it. This repo has a single developer, so the local copy is always authoritative. The workflow below never pulls — it regenerates the data locally and force-pushes over the Action's data commits.

1. Append the ticker to `data/tickers.txt`.
2. Add it to `ETF_NAMES`, `TICKERS` and `COLORS` in `index.html`, plus an `ETF_INCEPTION` entry if its first monthly return is after Jan 2004 (so the app gates it by start date).
3. Run `npm run update-data`. It fetches full history for the new ticker and brings every ticker up to the latest settled month, so the local JSON is at least as current as anything the Action has committed.
4. Commit `data/tickers.txt`, `data/monthly_returns.json` and `index.html` together.
5. Push. If the push is rejected because the Action committed data since your last push, force-push:

   ```bash
   git push --force
   ```

**Always run `npm run update-data` immediately before force-pushing** — the same applies to any push after the 5th of the month, not just ticker additions. Force-pushing an older JSON would roll the published data back until the Action's next run. Use plain `--force`, not `--force-with-lease`: the lease compares against the last fetch, and since this workflow never fetches, it would reject every push.

The Action side is covered too: if your push lands while the Action is running, its push is rejected and it regenerates on top of your `main`, keeping your changes. It also fails loudly if `data/tickers.txt` and `TICKERS` in `index.html` ever disagree. Small ±0.01 rounding differences between your data and the Action's are harmless and even out on the next monthly `--refresh-all` run.

---

*Past performance does not guarantee future results. This tool is for educational and exploratory purposes only and does not constitute financial advice.*
