#!/usr/bin/env python3
"""Fetch ETF monthly total returns from Yahoo Finance into a canonical CSV."""

from __future__ import annotations

import argparse
import calendar
import csv
import datetime as dt
import json
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CSV_PATH = REPO_ROOT / "data" / "monthly_returns.csv"
DEFAULT_TICKERS_PATH = REPO_ROOT / "data" / "tickers.txt"
DEFAULT_START_MONTH = "2012-01"
YAHOO_SOURCE = "Yahoo Finance adjusted close (1mo)"
USER_AGENT = "Mozilla/5.0"


@dataclass(frozen=True)
class Row:
    ticker: str
    month: str
    total_return_pct: str
    source: str
    fetched_at: str


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Fetch monthly adjusted-close returns from Yahoo Finance and store them as "
            "ticker,month,total_return_pct,source,fetched_at."
        )
    )
    parser.add_argument(
        "--csv",
        type=Path,
        default=DEFAULT_CSV_PATH,
        help="Target CSV path.",
    )
    parser.add_argument(
        "--tickers-file",
        type=Path,
        default=DEFAULT_TICKERS_PATH,
        help="Path to newline-delimited ticker symbols.",
    )
    parser.add_argument(
        "--ticker",
        action="append",
        dest="tickers",
        help="Ticker to fetch. Repeat to pass multiple tickers. Overrides --tickers-file.",
    )
    parser.add_argument(
        "--start-month",
        default=DEFAULT_START_MONTH,
        help="Earliest month to include, in YYYY-MM format. Defaults to 2012-01.",
    )
    parser.add_argument(
        "--through-month",
        help="Last completed month to include, in YYYY-MM format. Defaults to the previous calendar month.",
    )
    parser.add_argument(
        "--refresh-all",
        action="store_true",
        help="Ignore existing CSV checkpoints and refetch the full range for all selected tickers.",
    )
    return parser.parse_args()


def parse_month(month_str: str) -> tuple[int, int]:
    year_str, month_num_str = month_str.split("-", 1)
    year = int(year_str)
    month = int(month_num_str)
    if month < 1 or month > 12:
        raise ValueError(f"Invalid month: {month_str}")
    return year, month


def month_to_str(year: int, month: int) -> str:
    return f"{year:04d}-{month:02d}"


def previous_month(month_str: str) -> str:
    year, month = parse_month(month_str)
    month -= 1
    if month == 0:
        month = 12
        year -= 1
    return month_to_str(year, month)


def next_month(month_str: str) -> str:
    year, month = parse_month(month_str)
    month += 1
    if month == 13:
        month = 1
        year += 1
    return month_to_str(year, month)


def month_range(start_month: str, end_month: str) -> list[str]:
    months = []
    current = start_month
    while current <= end_month:
        months.append(current)
        current = next_month(current)
    return months


def default_through_month(today: dt.date | None = None) -> str:
    today = today or dt.date.today()
    year = today.year
    month = today.month - 1
    if month == 0:
        year -= 1
        month = 12
    return month_to_str(year, month)


def month_start_epoch(month_str: str) -> int:
    year, month = parse_month(month_str)
    return calendar.timegm(dt.datetime(year, month, 1, tzinfo=dt.timezone.utc).timetuple())


def first_day_of_next_month(month_str: str) -> int:
    return month_start_epoch(next_month(month_str))


def load_tickers(args: argparse.Namespace) -> list[str]:
    if args.tickers:
        tickers = args.tickers
    else:
        tickers = [
            line.strip().upper()
            for line in args.tickers_file.read_text().splitlines()
            if line.strip() and not line.strip().startswith("#")
        ]

    if not tickers:
        raise ValueError("No tickers supplied.")

    deduped = []
    seen: set[str] = set()
    for ticker in tickers:
        upper = ticker.upper()
        if upper not in seen:
            deduped.append(upper)
            seen.add(upper)
    return deduped


def load_existing_rows(csv_path: Path) -> dict[str, dict[str, Row]]:
    rows: dict[str, dict[str, Row]] = defaultdict(dict)
    if not csv_path.exists():
        return rows

    with csv_path.open(newline="") as handle:
        reader = csv.DictReader(handle)
        for raw in reader:
            row = Row(
                ticker=raw["ticker"],
                month=raw["month"],
                total_return_pct=raw["total_return_pct"],
                source=raw["source"],
                fetched_at=raw["fetched_at"],
            )
            rows[row.ticker][row.month] = row
    return rows


def fetch_monthly_adjclose(ticker: str, start_month: str, through_month: str) -> dict[str, float]:
    query = urllib.parse.urlencode(
        {
            "period1": month_start_epoch(start_month),
            "period2": first_day_of_next_month(through_month),
            "interval": "1mo",
            "events": "div,splits",
            "includeAdjustedClose": "true",
        }
    )
    url = f"https://query2.finance.yahoo.com/v8/finance/chart/{ticker}?{query}"
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


def compute_rows_for_ticker(
    ticker: str,
    start_month: str,
    through_month: str,
    fetched_at: str,
    existing_rows: dict[str, Row],
    refresh_all: bool,
) -> tuple[list[Row], bool]:
    if refresh_all or not existing_rows:
        fetch_start = previous_month(start_month)
        write_from = start_month
    else:
        existing_months = sorted(existing_rows)
        latest_existing = existing_months[-1]
        if latest_existing >= through_month:
            return [], False
        write_from = next_month(latest_existing)
        fetch_start = previous_month(write_from)

    yahoo_months = fetch_monthly_adjclose(ticker, fetch_start, through_month)
    new_rows: list[Row] = []

    for month in month_range(write_from, through_month):
        prev_month = previous_month(month)
        if month not in yahoo_months or prev_month not in yahoo_months:
            continue
        raw_return = (yahoo_months[month] / yahoo_months[prev_month] - 1) * 100
        new_rows.append(
            Row(
                ticker=ticker,
                month=month,
                total_return_pct=f"{round(raw_return, 1):.1f}",
                source=YAHOO_SOURCE,
                fetched_at=fetched_at,
            )
        )

    return new_rows, True


def write_csv(csv_path: Path, rows_by_ticker: dict[str, dict[str, Row]]) -> None:
    csv_path.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = ["ticker", "month", "total_return_pct", "source", "fetched_at"]

    with csv_path.open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames, lineterminator="\n")
        writer.writeheader()
        for ticker in sorted(rows_by_ticker):
            for month in sorted(rows_by_ticker[ticker]):
                row = rows_by_ticker[ticker][month]
                writer.writerow(
                    {
                        "ticker": row.ticker,
                        "month": row.month,
                        "total_return_pct": row.total_return_pct,
                        "source": row.source,
                        "fetched_at": row.fetched_at,
                    }
                )


def main() -> int:
    args = parse_args()
    tickers = load_tickers(args)
    through_month = args.through_month or default_through_month()
    start_month = args.start_month
    fetched_at = dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()

    if start_month != DEFAULT_START_MONTH:
        raise ValueError(f"--start-month must be {DEFAULT_START_MONTH}")
    if start_month > through_month:
        raise ValueError("--start-month must be <= --through-month")

    rows_by_ticker = load_existing_rows(args.csv)
    fetched_tickers: list[str] = []
    appended_rows = 0

    if args.refresh_all:
        rows_by_ticker = defaultdict(dict)

    for ticker in tickers:
        new_rows, fetched = compute_rows_for_ticker(
            ticker=ticker,
            start_month=start_month,
            through_month=through_month,
            fetched_at=fetched_at,
            existing_rows=rows_by_ticker.get(ticker, {}),
            refresh_all=args.refresh_all,
        )
        if fetched:
            fetched_tickers.append(ticker)
        for row in new_rows:
            rows_by_ticker[row.ticker][row.month] = row
            appended_rows += 1

    write_csv(args.csv, rows_by_ticker)

    total_rows = sum(len(months) for months in rows_by_ticker.values())
    if fetched_tickers:
        print(
            f"Wrote {total_rows} rows to {args.csv} through {through_month}. "
            f"Added {appended_rows} row(s); fetched {len(fetched_tickers)} ticker(s): {', '.join(fetched_tickers)}."
        )
    else:
        print(
            f"No fetch needed. {args.csv} already contains all selected tickers through {through_month} "
            f"({total_rows} total row(s))."
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
