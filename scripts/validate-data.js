#!/usr/bin/env node
/**
 * Validate data/monthly_returns.json against live Yahoo Finance data.
 *
 * Re-fetches adjusted-close prices for each ticker and recomputes monthly
 * returns, then compares to the stored values (exact match after 1-decimal
 * rounding).
 *
 * Usage:
 *   node scripts/validate-data.js
 *   node scripts/validate-data.js --ticker SCHD --ticker VTI
 *   node scripts/validate-data.js --show-all
 *
 * Exit codes: 0 = pass, 1 = mismatches found, 2 = data file not found
 */

import YahooFinance from 'yahoo-finance2';
const yahooFinance = new YahooFinance({ suppressNotices: ['ripHistorical'] });
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { parseArgs } from 'util';

const __dirname  = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT  = join(__dirname, '..');
const JSON_FILE  = join(REPO_ROOT, 'data', 'monthly_returns.json');
const DATA_START = '2012-01';

// ── CLI args ──────────────────────────────────────────────────────────────────
const { values: argv } = parseArgs({
  options: {
    ticker:     { type: 'string', multiple: true },
    'show-all': { type: 'boolean', default: false },
  },
  strict: false,
});
const TICKER_OVERRIDE = argv.ticker;
const SHOW_ALL        = argv['show-all'];

// ── Month helpers (duplicated here to keep the script self-contained) ─────────
function prevMonth(ym) {
  let [y, m] = ym.split('-').map(Number);
  if (--m < 1) { m = 12; y--; }
  return `${y}-${String(m).padStart(2, '0')}`;
}

function nextMonth(ym) {
  let [y, m] = ym.split('-').map(Number);
  if (++m > 12) { m = 1; y++; }
  return `${y}-${String(m).padStart(2, '0')}`;
}

/** Convert index anchored at DATA_START to 'YYYY-MM'. */
function indexToMonth(i) {
  const [sy, sm] = DATA_START.split('-').map(Number);
  const total = sy * 12 + (sm - 1) + i;
  const y = Math.floor(total / 12);
  const m = (total % 12) + 1;
  return `${y}-${String(m).padStart(2, '0')}`;
}

// ── Load JSON store ───────────────────────────────────────────────────────────
function loadStore() {
  if (!existsSync(JSON_FILE)) {
    console.error(`Error: ${JSON_FILE} not found. Run "npm run update-data" first.`);
    process.exit(2);
  }
  return JSON.parse(readFileSync(JSON_FILE, 'utf8'));
}

/** Convert DataPayload arrays to sparse { TICKER: { 'YYYY-MM': value } }. */
function payloadToSparse(payload) {
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
async function fetchAdjClose(ticker, startMonth, throughMonth) {
  const [py, pm] = prevMonth(startMonth).split('-').map(Number);
  const [ty, tm] = throughMonth.split('-').map(Number);
  const lastDay   = new Date(Date.UTC(ty, tm, 0)).getUTCDate();
  const period1   = `${py}-${String(pm).padStart(2, '0')}-01`;
  const period2   = `${ty}-${String(tm).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  const rows = await yahooFinance.historical(ticker, {
    period1,
    period2,
    interval: '1mo',
  });

  const priceMap = {};
  for (const row of rows) {
    if (row.adjClose == null) continue;
    const d   = new Date(row.date);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    priceMap[key] = row.adjClose;
  }
  return priceMap;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const payload = loadStore();
  const sparse  = payloadToSparse(payload);

  const tickers = TICKER_OVERRIDE?.length
    ? [...new Set(TICKER_OVERRIDE.map(t => t.toUpperCase()))]
    : Object.keys(sparse).sort();

  const unknown = tickers.filter(t => !sparse[t]);
  if (unknown.length) {
    console.error(`Unknown ticker(s): ${unknown.join(', ')}`);
    process.exit(2);
  }

  let totalChecked   = 0;
  const mismatches   = [];

  for (const ticker of tickers) {
    const monthMap    = sparse[ticker];
    const months      = Object.keys(monthMap).sort();
    const throughMonth = months.at(-1);

    process.stdout.write(`  ${ticker}: fetching for validation…`);
    let priceMap;
    try {
      priceMap = await fetchAdjClose(ticker, months[0], throughMonth);
    } catch (err) {
      console.error(` FAILED — ${err.message}`);
      process.exitCode = 1;
      continue;
    }
    console.log(' done');

    for (const month of months) {
      const local = monthMap[month];
      const prev  = prevMonth(month);
      if (priceMap[month] == null || priceMap[prev] == null) continue;

      const raw     = (priceMap[month] / priceMap[prev] - 1) * 100;
      const rounded = Math.round(raw * 100) / 100;
      const diff    = Math.round((local - rounded) * 100) / 100;
      totalChecked++;

      if (Math.abs(diff) > 0.01) {
        mismatches.push({ ticker, month, local, yahoo: rounded, diff });
      } else if (SHOW_ALL) {
        console.log(
          `  OK  ${ticker} ${month}  local=${local.toFixed(2)}  yahoo=${rounded.toFixed(2)}`
        );
      }
    }
  }

  if (mismatches.length) {
    console.log('');
    for (const { ticker, month, local, yahoo, diff } of mismatches) {
      console.log(
        `  DIFF ${ticker} ${month}  local=${local.toFixed(2)}  yahoo=${yahoo.toFixed(2)}  diff=${diff > 0 ? '+' : ''}${diff.toFixed(2)}`
      );
    }
    console.error(
      `\nValidation FAILED: ${mismatches.length} mismatch(es) out of ${totalChecked} values checked.`
    );
    process.exit(1);
  }

  console.log(
    `\nValidation passed: ${totalChecked} values across ${tickers.length} ticker(s) match Yahoo Finance.`
  );
}

main().catch(err => { console.error(err); process.exit(1); });
