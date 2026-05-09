#!/usr/bin/env node
/**
 * Fetch latest ETF monthly returns from Yahoo Finance and update:
 *   data/monthly_returns.json  — canonical persistent store
 *   index.html                 — patches BUNDLED_RETURNS for file:// use
 *
 * Usage:
 *   node scripts/update-data.js
 *   node scripts/update-data.js --refresh-all
 *   node scripts/update-data.js --ticker SCHD --ticker VTI
 */

import YahooFinance from 'yahoo-finance2';
const yahooFinance = new YahooFinance({ suppressNotices: ['ripHistorical'] });
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { parseArgs } from 'util';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT  = join(__dirname, '..');
const TICKERS_FILE = join(REPO_ROOT, 'data', 'tickers.txt');
const JSON_FILE    = join(REPO_ROOT, 'data', 'monthly_returns.json');
const HTML_FILE    = join(REPO_ROOT, 'index.html');
const DATA_START   = '2012-01';

// ── CLI args ──────────────────────────────────────────────────────────────────
const { values: argv } = parseArgs({
  options: {
    'refresh-all': { type: 'boolean', default: false },
    ticker:        { type: 'string',  multiple: true  },
  },
  strict: false,
});
const REFRESH_ALL     = argv['refresh-all'];
const TICKER_OVERRIDE = argv.ticker;

// ── Date / month helpers ──────────────────────────────────────────────────────

/** Count n weekdays (Mon–Fri) forward from date. */
function addWeekdays(date, n) {
  const d = new Date(date);
  let added = 0;
  while (added < n) {
    d.setDate(d.getDate() + 1);
    const day = d.getDay();
    if (day !== 0 && day !== 6) added++;
  }
  return d;
}

/**
 * Return the most recent month whose adjusted-close data is settled.
 *
 * Many ETFs have dividends with ex-dates in the first days of the month after
 * the ex-dividend month. Yahoo Finance's adjusted close for month M is not
 * final until those ex-dates settle. We wait 2 full weekdays past the last
 * calendar day of the candidate month before trusting it.
 */
function defaultThroughMonth(today = new Date()) {
  // Last calendar day of the previous month
  const lastDayPrev = new Date(today.getFullYear(), today.getMonth(), 0);
  const safeDate    = addWeekdays(lastDayPrev, 2);
  const target      = today >= safeDate
    ? lastDayPrev
    : new Date(today.getFullYear(), today.getMonth() - 1, 0); // one month earlier
  const y = target.getFullYear();
  const m = String(target.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function nextMonth(ym) {
  let [y, m] = ym.split('-').map(Number);
  if (++m > 12) { m = 1; y++; }
  return `${y}-${String(m).padStart(2, '0')}`;
}

function prevMonth(ym) {
  let [y, m] = ym.split('-').map(Number);
  if (--m < 1) { m = 12; y--; }
  return `${y}-${String(m).padStart(2, '0')}`;
}

function monthRange(start, end) {
  const months = [];
  let cur = start;
  while (cur <= end) { months.push(cur); cur = nextMonth(cur); }
  return months;
}

/** Convert index in the DATA_START-anchored array back to a 'YYYY-MM' string. */
function indexToMonth(i) {
  const [sy, sm] = DATA_START.split('-').map(Number);
  const total = (sy - 0) * 12 + (sm - 1) + i;
  const y = Math.floor(total / 12);
  const m = (total % 12) + 1;
  return `${y}-${String(m).padStart(2, '0')}`;
}

// ── Tickers ───────────────────────────────────────────────────────────────────
function loadTickers() {
  if (TICKER_OVERRIDE?.length) {
    return [...new Set(TICKER_OVERRIDE.map(t => t.toUpperCase()))];
  }
  return readFileSync(TICKERS_FILE, 'utf8')
    .split('\n')
    .map(l => l.trim().toUpperCase())
    .filter(l => l && !l.startsWith('#'));
}

// ── Persistent JSON store ─────────────────────────────────────────────────────

/**
 * Load the store as a sparse map: { TICKER: { 'YYYY-MM': value } }.
 * Converts from DataPayload array format if the file exists.
 */
function loadSparse() {
  if (!existsSync(JSON_FILE)) return {};
  const payload = JSON.parse(readFileSync(JSON_FILE, 'utf8'));
  if (!payload.returns) return {};
  const sparse = {};
  for (const [ticker, arr] of Object.entries(payload.returns)) {
    sparse[ticker] = {};
    arr.forEach((v, i) => {
      if (v !== null) sparse[ticker][indexToMonth(i)] = v;
    });
  }
  return sparse;
}

// ── Yahoo Finance fetch ───────────────────────────────────────────────────────
async function fetchTicker(ticker, fromMonth, throughMonth) {
  const [py, pm] = prevMonth(fromMonth).split('-').map(Number);
  const [ty, tm] = throughMonth.split('-').map(Number);

  // Last calendar day of throughMonth
  const lastDay = new Date(Date.UTC(ty, tm, 0)).getUTCDate();
  const period1 = `${py}-${String(pm).padStart(2, '0')}-01`;
  const period2 = `${ty}-${String(tm).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  const rows = await yahooFinance.historical(ticker, {
    period1,
    period2,
    interval: '1mo',
  });

  // Build adjClose map using UTC date components to avoid timezone shift
  const priceMap = {};
  for (const row of rows) {
    if (row.adjClose == null) continue;
    const d = new Date(row.date);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    priceMap[key] = row.adjClose;
  }

  // Compute 1-decimal monthly returns for each requested month
  const returns = {};
  for (const month of monthRange(fromMonth, throughMonth)) {
    const prev = prevMonth(month);
    if (priceMap[month] == null || priceMap[prev] == null) continue;
    const raw = (priceMap[month] / priceMap[prev] - 1) * 100;
    returns[month] = Math.round(raw * 100) / 100;
  }
  return returns;
}

// ── Build DataPayload from sparse maps ────────────────────────────────────────
function buildPayload(sparse, throughMonth) {
  const allMonths = monthRange(DATA_START, throughMonth);
  const [ey, em]  = throughMonth.split('-').map(Number);
  const returns   = {};
  for (const [ticker, monthMap] of Object.entries(sparse)) {
    returns[ticker] = allMonths.map(m => monthMap[m] ?? null);
  }
  return {
    returns,
    endYear:   ey,
    endMonth:  em,
    numMonths: allMonths.length,
    fetchedAt: new Date().toISOString(),
  };
}

// ── index.html patching ───────────────────────────────────────────────────────
const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun',
                     'Jul','Aug','Sep','Oct','Nov','Dec'];

/** Format one ticker's return array in the same style as the existing HTML. */
function formatReturnsArray(values, startYear) {
  const lines = [];
  const total = values.length;
  let idx = 0;
  let year = startYear;

  while (idx < total) {
    const count = Math.min(12, total - idx);
    const chunk = values.slice(idx, idx + count);
    const parts = chunk.map(v =>
      v === null ? 'null' : v.toFixed(2).padStart(6, ' ')
    );
    const trailingComma = idx + count < total ? ',' : '';
    lines.push(`    /* ${year} */ ${parts.join(', ')}${trailingComma}`);
    idx += count;
    year++;
  }
  return lines.join('\n');
}

function patchHtml(payload) {
  let html = readFileSync(HTML_FILE, 'utf8');
  const { returns, endYear, endMonth, numMonths } = payload;
  const monthLabel = MONTH_NAMES[endMonth - 1];
  const fetchedAt  = `${endYear}-${String(endMonth).padStart(2, '0')}`;

  // Patch scalar constants (handles both old and new names on first run)
  html = html
    .replace(
      /const (?:DATA_END_YEAR|BUNDLED_END_YEAR) = \d+;/,
      `const BUNDLED_END_YEAR = ${endYear};`
    )
    .replace(
      /const (?:DATA_END_MONTH|BUNDLED_END_MONTH) = \d+;/,
      `const BUNDLED_END_MONTH = ${endMonth};`
    )
    .replace(
      /const (?:NUM_MONTHS|BUNDLED_NUM_MONTHS) = \d+;[^\n]*/,
      `const BUNDLED_NUM_MONTHS = ${numMonths}; // Jan 2012 – ${monthLabel} ${endYear}`
    )
    .replace(
      /const BUNDLED_FETCHED_AT = "[^"]*";/,
      `const BUNDLED_FETCHED_AT = "${fetchedAt}";`
    );

  // Build the new BUNDLED_RETURNS block
  const tickers = Object.keys(returns);
  const body = tickers
    .map(t => `  ${t}: [\n${formatReturnsArray(returns[t], 2012)}\n  ]`)
    .join(',\n');
  const newBlock = body
    ? `const BUNDLED_RETURNS = {\n${body},\n};`
    : `const BUNDLED_RETURNS = {};`;

  // Replace old block (handles MONTHLY_RETURNS → BUNDLED_RETURNS on first run)
  html = html.replace(
    /const (?:MONTHLY_RETURNS|BUNDLED_RETURNS) = \{[\s\S]*?\n\};/,
    newBlock
  );

  writeFileSync(HTML_FILE, html, 'utf8');
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const tickers     = loadTickers();
  const throughMonth = defaultThroughMonth();
  console.log(`Updating through: ${throughMonth}`);

  const sparse  = REFRESH_ALL ? {} : loadSparse();
  const updated = [];

  for (const ticker of tickers) {
    const existing        = sparse[ticker] ?? {};
    const existingMonths  = Object.keys(existing).sort();
    const latestExisting  = existingMonths.at(-1);

    let fromMonth;
    if (!latestExisting) {
      fromMonth = DATA_START;
    } else if (latestExisting >= throughMonth) {
      console.log(`  ${ticker}: already current (${latestExisting})`);
      sparse[ticker] ??= existing; // ensure it's in sparse for payload
      continue;
    } else {
      fromMonth = nextMonth(latestExisting);
    }

    console.log(`  ${ticker}: fetching ${fromMonth}–${throughMonth}…`);
    try {
      const newData = await fetchTicker(ticker, fromMonth, throughMonth);
      sparse[ticker] = { ...existing, ...newData };
      updated.push(ticker);
    } catch (err) {
      console.error(`  ${ticker}: FAILED — ${err.message}`);
      process.exitCode = 1;
      sparse[ticker] = existing; // keep what we had
    }
  }

  if (updated.length === 0 && process.exitCode !== 1) {
    console.log('Everything already up to date — no changes written.');
    return;
  }

  // Only include tickers that have data
  const sparseWithData = Object.fromEntries(
    tickers
      .filter(t => sparse[t] && Object.keys(sparse[t]).length > 0)
      .map(t => [t, sparse[t]])
  );

  // Guard: don't wipe existing data if every single fetch failed
  if (Object.keys(sparseWithData).length === 0) {
    console.error('All fetches failed — no data to write. Existing files left unchanged.');
    process.exit(1);
  }

  const payload = buildPayload(sparseWithData, throughMonth);
  writeFileSync(JSON_FILE, JSON.stringify(payload, null, 2), 'utf8');

  patchHtml(payload);

  const totalValues = Object.values(payload.returns)
    .reduce((s, arr) => s + arr.filter(v => v !== null).length, 0);
  console.log(
    `Done. ${totalValues} values across ${tickers.length} tickers through ${throughMonth}.` +
    (updated.length ? ` Fetched: ${updated.join(', ')}.` : '')
  );
}

main().catch(err => { console.error(err); process.exit(1); });
