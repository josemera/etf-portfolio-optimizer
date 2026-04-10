#!/usr/bin/env python3
"""Validate ETF monthly return datasets against Yahoo Finance."""

from __future__ import annotations

import argparse
import ast
import csv
import datetime as dt
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_HTML_PATH = REPO_ROOT / "index.html"
DEFAULT_CSV_PATH = REPO_ROOT / "data" / "monthly_returns.csv"
PERIOD1 = 1320105600  # 2011-11-01 UTC, so Jan 2012 can be compared to Dec 2011
USER_AGENT = "Mozilla/5.0"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Validate monthly ETF returns from either index.html or the canonical CSV "
            "against Yahoo Finance adjusted-close monthly returns."
        )
    )
    parser.add_argument(
        "--source-format",
        choices=("html", "csv"),
        default="html",
        help="Input format to validate. Defaults to html.",
    )
    parser.add_argument(
        "--input",
        type=Path,
        help="Path to the input file. Defaults to index.html for html mode and data/monthly_returns.csv for csv mode.",
    )
    parser.add_argument(
        "--ticker",
        action="append",
        dest="tickers",
        help="Limit validation to one or more tickers.",
    )
    parser.add_argument(
        "--show-all",
        action="store_true",
        help="Print a success line for each validated month instead of only mismatches.",
    )
    return parser.parse_args()


def resolve_input_path(args: argparse.Namespace) -> Path:
    if args.input:
        return args.input
    if args.source_format == "csv":
        return DEFAULT_CSV_PATH
    return DEFAULT_HTML_PATH


def extract_monthly_returns_from_html(html_path: Path) -> dict[str, dict[str, float | None]]:
    html = html_path.read_text()
    match = re.search(r"const MONTHLY_RETURNS = \{(.*?)\n\};", html, re.S)
    if not match:
        raise ValueError(f"Could not locate MONTHLY_RETURNS in {html_path}")

    arrays: dict[str, dict[str, float | None]] = {}
    body = match.group(1)
    for ticker, array_text in re.findall(r"\n\s*([A-Z]+): \[(.*?)\n\s*\],", body, re.S):
        cleaned = re.sub(r"/\*.*?\*/", "", array_text, flags=re.S)
        cleaned = cleaned.replace("null", "None")
        values = ast.literal_eval("[" + cleaned + "]")
        month_map: dict[str, float | None] = {}
        year = 2012
        month = 1
        for value in values:
            month_map[f"{year:04d}-{month:02d}"] = value
            month += 1
            if month == 13:
                month = 1
                year += 1
        arrays[ticker] = month_map

    if not arrays:
        raise ValueError(f"No ticker arrays parsed from {html_path}")

    return arrays


def extract_monthly_returns_from_csv(csv_path: Path) -> dict[str, dict[str, float | None]]:
    if not csv_path.exists():
        raise FileNotFoundError(csv_path)

    arrays: dict[str, dict[str, float | None]] = {}
    with csv_path.open(newline="") as handle:
        reader = csv.DictReader(handle)
        required = {"ticker", "month", "total_return_pct"}
        missing = required - set(reader.fieldnames or [])
        if missing:
            raise ValueError(f"CSV missing required columns: {', '.join(sorted(missing))}")
        for row in reader:
            ticker = row["ticker"].strip().upper()
            month = row["month"].strip()
            value = float(row["total_return_pct"])
            arrays.setdefault(ticker, {})[month] = value

    if not arrays:
        raise ValueError(f"No monthly rows parsed from {csv_path}")

    return arrays


def load_source_data(source_format: str, input_path: Path) -> dict[str, dict[str, float | None]]:
    if source_format == "csv":
        return extract_monthly_returns_from_csv(input_path)
    return extract_monthly_returns_from_html(input_path)


def next_month(month_key: str) -> str:
    year = int(month_key[:4])
    month = int(month_key[5:7]) + 1
    if month == 13:
        year += 1
        month = 1
    return f"{year:04d}-{month:02d}"


def month_start_epoch(month_key: str) -> int:
    year = int(month_key[:4])
    month = int(month_key[5:7])
    return int(dt.datetime(year, month, 1, tzinfo=dt.timezone.utc).timestamp())


def fetch_yahoo_monthly_adjclose(ticker: str, through_month: str) -> dict[str, float]:
    params = urllib.parse.urlencode(
        {
            "period1": PERIOD1,
            "period2": month_start_epoch(next_month(through_month)),
            "interval": "1mo",
            "events": "div,splits",
            "includeAdjustedClose": "true",
        }
    )
    url = f"https://query2.finance.yahoo.com/v8/finance/chart/{ticker}?{params}"
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})

    last_error: Exception | None = None
    for attempt in range(3):
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                payload = json.load(response)
            result = payload["chart"]["result"][0]
            timestamps = result["timestamp"]
            adjclose = result["indicators"]["adjclose"][0]["adjclose"]
            return {
                dt.datetime.utcfromtimestamp(ts).strftime("%Y-%m"): adj
                for ts, adj in zip(timestamps, adjclose)
                if adj is not None
            }
        except urllib.error.HTTPError as exc:
            last_error = exc
            if exc.code != 429 or attempt == 2:
                break
            time.sleep(1.5 * (attempt + 1))
        except Exception as exc:  # pragma: no cover - network/runtime safeguard
            last_error = exc
            break

    raise RuntimeError(f"Yahoo fetch failed for {ticker}: {last_error}")


def previous_month(month_key: str) -> str:
    year = int(month_key[:4])
    month = int(month_key[5:7]) - 1
    if month == 0:
        year -= 1
        month = 12
    return f"{year:04d}-{month:02d}"


def iter_validation_rows(
    local_values: dict[str, float | None],
    yahoo_adjclose: dict[str, float],
) -> list[tuple[str, float | None, float | None, float | None, float | None]]:
    rows = []
    for month_key in sorted(local_values):
        local_value = local_values[month_key]
        prev_key = previous_month(month_key)

        if local_value is None and month_key not in yahoo_adjclose:
            rows.append((month_key, local_value, None, None, None))
            continue

        if month_key not in yahoo_adjclose:
            raise KeyError(f"Missing Yahoo adjusted close for {month_key}")
        if prev_key not in yahoo_adjclose and local_value is not None:
            raise KeyError(f"Missing Yahoo adjusted close for prior month {prev_key}")

        if local_value is None:
            raw_return = None
            rounded_return = None
            diff = None
        else:
            raw_return = (yahoo_adjclose[month_key] / yahoo_adjclose[prev_key] - 1) * 100
            rounded_return = round(raw_return, 1)
            diff = local_value - rounded_return

        rows.append((month_key, local_value, raw_return, rounded_return, diff))
    return rows


def main() -> int:
    args = parse_args()
    input_path = resolve_input_path(args)
    arrays = load_source_data(args.source_format, input_path)
    tickers = [ticker.upper() for ticker in (args.tickers or sorted(arrays))]
    missing = [ticker for ticker in tickers if ticker not in arrays]
    if missing:
        print(f"Unknown ticker(s): {', '.join(missing)}", file=sys.stderr)
        return 2

    mismatches: list[tuple[str, str, float, float, float, float]] = []
    checked = 0

    for ticker in tickers:
        through_month = max(arrays[ticker])
        yahoo_adjclose = fetch_yahoo_monthly_adjclose(ticker, through_month)
        rows = iter_validation_rows(arrays[ticker], yahoo_adjclose)
        for month_key, local_value, raw_return, rounded_return, diff in rows:
            if local_value is None:
                continue
            checked += 1
            if diff != 0:
                mismatches.append(
                    (ticker, month_key, local_value, raw_return, rounded_return, diff)
                )
                continue
            if args.show_all:
                print(
                    f"OK {ticker} {month_key} "
                    f"local={local_value:.1f} yahoo={rounded_return:.1f} raw={raw_return:.6f}"
                )

    if mismatches:
        for ticker, month_key, local_value, raw_return, rounded_return, diff in mismatches:
            print(
                f"DIFF {ticker} {month_key} "
                f"local={local_value:.1f} yahoo={rounded_return:.1f} raw={raw_return:.6f} diff={diff:+.1f}"
            )
        print(
            f"\nValidation failed: {len(mismatches)} mismatch(es) across {checked} non-null monthly values.",
            file=sys.stderr,
        )
        return 1

    print(
        f"Validation passed: {checked} non-null monthly values across {len(tickers)} ticker(s) "
        f"in {input_path} match Yahoo Finance after one-decimal rounding."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
