# Portfolio Backtest & Optimizer

A self-contained browser tool for backtesting ETF portfolios, exploring the efficient frontier, and running rolling-window optimization across historical market regimes. No server required — open the HTML file locally and everything runs in-browser.

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
| JEPI | JPMorgan Equity Premium Income ETF | Covered-call income · ~7% yield · **data starts 2020** |

Monthly total return data (dividends reinvested) covers **Jan 2012–Dec 2025** — 168 monthly data points per ETF. 2025 reflects full-year actual returns. JEPI launched May 2020; returns before June 2020 are null (treated as 0% for portfolio math).

---

## How to Use

### 1. Backtest

1. Set **Start Month/Year** (Jan 2012–Dec 2020) using the month and year dropdowns.
2. Allocate capital across ETFs using the dropdowns — each in $5K increments up to $100K.
3. The **Total Allocated** badge turns green when allocations sum to exactly $100K.
4. Click **↺ Reset to $10K** to reset all ETFs to $10K each ($100K total).
5. Toggle between three chart views:
   - **Growth Chart** — cumulative dollar value over time
   - **Annual Returns** — year-by-year bar chart per ETF
   - **% Gains** — all ETFs and the portfolio normalized to 0% at period start, showing percent gain over time
6. Read the **Performance Summary** table for per-ETF and portfolio CAGR, max drawdown, and total gain.
7. Hover any card to see the ETF's full name and descriptor.
8. Review the **Year-by-Year Portfolio Values** table — toggle between **$ Value** (December month-end dollar amounts) and **% Gain** (cumulative percent gain from the selected start date).
9. Review the **Year-by-Year Max Drawdown** table for intra-year peak-to-trough drawdown per ETF and the combined portfolio (color-coded: green ≤ 10%, red > 20%).

> **Note on IVV vs VTI:** These two are nearly identical (0.99 correlation). You generally don't need both — VTI includes small/mid caps, IVV tracks the S&P 500 only.

> **Note on QQQ vs VGT:** Correlation ~0.93–0.95. QQQ includes non-tech Nasdaq names (Amazon, Meta); VGT is pure technology sector. Pick one as your tech/growth expression.

---

### 2. Portfolio Optimizer

The optimizer finds the $100K allocation (in $1K increments) that maximizes the objective function:

```
Score = CAGR / MaxDrawdown^w
```

Where **w** is the risk tolerance slider:

| w | Behavior |
|---|----------|
| 0.0 | Pure CAGR maximization — drawdown ignored |
| 1.0 | Balanced — CAGR per unit of drawdown |
| 2.0 | Aggressive drawdown minimization |

**Algorithm:**
1. **Random sampling** — generates 800 random valid portfolios ($100K total, $1K steps) using Fisher-Yates shuffle to avoid allocation bias toward any single ETF.
2. **Best seed selection** — finds the random portfolio with the highest score under the current w.
3. **Hill-climbing** — runs 3,000 greedy swap iterations from the best seed, moving $1K between ETFs and keeping improvements.

**To use:**
1. Set the risk slider to your preferred w value.
2. Optionally set a **Max DD filter** (e.g. `30`) to discard any sampled portfolio whose max drawdown exceeds that percentage. Only portfolios within the limit are shown on the frontier and used for hill-climbing. Leave blank for no filter.
3. Click **Run Optimizer**.
4. The **Efficient Frontier** scatter plot appears — blue dots are sampled portfolios, yellow dots are the Pareto frontier (lowest drawdown at each CAGR level), the green star is the hill-climb optimum.
5. Click any dot on the frontier to preview that allocation in the right panel without redrawing the chart.
6. Click **Apply This Allocation ↑** to load the previewed allocation into the main backtest (rounded to nearest $5K).

**Important caveats:**
- The optimizer uses only the **selected start month/year** from the main dropdowns. Results differ significantly between a Jan 2012 start (14 years including the 2022 bear market) and a Jan 2020 start (mostly bull market).
- With only 10 ETFs and 168 months of data, the optimizer is prone to **overfitting**. Concentrated single-ETF results (e.g., 100% SMH at w=0) reflect historical dominance, not forward-looking confidence.
- At w=0 the optimizer tends toward high-growth tech (SMH/QQQ/VGT). At w≥1.0 it converges toward defensive income names (SCHD, VPU). There is a sharp cliff between these poles — this is a structural feature of the data, not a bug.

---

### 3. Rolling Window Optimizer

Runs the full optimizer independently on each **5-year window** across the complete 2012–2025 dataset, regardless of the main start year dropdown. Produces 10 windows (2012–16, 2013–17 … 2021–25).

**JEPI is excluded** from rolling windows — only 5 years of data (2020–2025) is insufficient for meaningful 5-year window analysis.

**To use:**
1. Set the **rolling window risk slider** (independent of the main optimizer slider).
2. Click **Run Rolling Analysis** — takes approximately 10–15 seconds.
3. Three insight cards appear:
   - **Average Allocation** — which ETFs dominate across all windows by dollar weight
   - **Allocation Stability** — standard deviation of each ETF's allocation across windows (green = stable, red = regime-dependent)
   - **Consistency** — how many of the 10 windows each ETF appears in with allocation > $0
4. Two charts — stacked bar (allocations per window) and line chart (CAGR vs max drawdown per window).
5. Full table with per-window allocations, CAGR, max drawdown, score, and an average row.

**Interpreting the results:**

- **High instability (red)** for ETFs like XLE or SMH means regime-dependence — optimal in some environments, irrelevant in others. A high average allocation is not a signal to hold permanently.
- **Low instability (green)** may mean consistently included or consistently excluded. Check the consistency card to distinguish the two cases.
- The **2018–22 window** is the most analytically honest — it captures the full 2022 bear market, forcing a genuine return/drawdown tradeoff. The resulting allocation (heavy VPU + XLE + SCHD) is the closest analog to a defensive positioning template.
- The **most recent window (2021–25)** is the most forward-relevant for near-term positioning.

---

## Methodology Notes

### Return Data
Monthly total returns include price appreciation and dividends reinvested, sourced from Yahoo Finance adjusted close prices. 168 monthly data points per ETF (Jan 2012–Dec 2025). 2025 figures are full-year actual returns.

### Max Drawdown
Calculated as the maximum peak-to-trough decline in portfolio value across **monthly snapshots**. Because the tool uses monthly (not daily) data, intra-month drawdowns are not captured — actual realized drawdowns may be modestly larger than reported here. This is a significant improvement over annual data, which severely understated drawdowns by masking intra-year volatility.

### Score Function
`CAGR / DD^w` is a simplified Calmar-like ratio. It is not a standard financial metric and has known pathological behavior when DD approaches zero. It is intended as an exploratory tool, not a rigorous risk-adjusted return measure.

### Overfitting Risk
With 10 assets and 168 monthly data points (14 years), the ratio of data to parameters is reasonable but not large. Concentrated outputs should be interpreted as "this worked historically in this sample" rather than "this will work going forward." The rolling window analysis partially addresses this by showing whether allocations are stable across regimes — an allocation that dominates every window has more evidence behind it than one that dominates only one.

### What the Optimizer Does Not Know
- Your retirement date or income requirements
- Tax implications of rebalancing
- Transaction costs or bid-ask spreads
- How correlations may shift in future market regimes
- Individual position constraints or existing concentration

For retirement planning, the optimizer is best used as a **diagnostic tool** — identifying redundant positions, understanding regime sensitivity, and stress-testing drawdown tolerance — rather than as a direct allocation prescription.

---

## Two-Bucket Interpretation Framework

A single portfolio optimizer solves the wrong problem for investors with a hard retirement date. A more useful mental model:

**Bucket 1 — Safety / Income** (years 1–8 of retirement)
Target: low drawdown, reliable income. SCHD + JEPI + VPU + Treasury ladder. The optimizer at w ≥ 1.0 approximates this bucket's composition.

**Bucket 2 — Growth** (10+ year horizon, untouched until Bucket 1 is depleted)
Target: maximum CAGR; drawdown acceptable because this bucket won't be accessed for years. SMH + QQQ or VGT. The optimizer at w = 0 approximates this bucket.

Size each bucket to your annual spending needs and income bridge timeline. The blended single-portfolio optimizer will always underperform a properly sized two-bucket allocation because it tries to simultaneously minimize drawdown and maximize growth — two objectives that are fundamentally in tension.

---

## Running the Tool

No installation required. Open `index.html` in any modern browser (Chrome recommended). All computation runs client-side in JavaScript — no data leaves your machine.

```bash
open index.html
```

Chart rendering requires an internet connection to load Chart.js from the Cloudflare CDN (`cdnjs.cloudflare.com`). The optimizer and all calculations work offline; only the chart visualizations require the CDN.

---

*Past performance does not guarantee future results. This tool is for educational and exploratory purposes only and does not constitute financial advice.*
