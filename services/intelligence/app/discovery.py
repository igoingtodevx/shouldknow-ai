from __future__ import annotations

import argparse
import json

from .adapters import SearXNGClient

QUERIES = (
    '"release notes" AI agent',
    '"changelog" AI coding',
    '"pricing update" AI',
    '"breaking change" AI API',
    '"free tier" AI tool',
    'site:github.com releases AI agent',
)


def discover() -> list[dict]:
    client = SearXNGClient()
    seen: set[str] = set()
    output: list[dict] = []
    for query in QUERIES:
        for item in client.search(query, time_range="month", limit=15):
            if item["url"] in seen:
                continue
            seen.add(item["url"])
            output.append({"query": query, **item})
    return output


def main() -> None:
    parser = argparse.ArgumentParser(description="Discovery is candidate generation only; it never publishes or auto-adds sources.")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()
    results = discover()
    if args.json:
        print(json.dumps(results, indent=2, ensure_ascii=False))
    else:
        for item in results:
            print(f"[{item['query']}] {item['title']}\n  {item['url']}\n  {item['content'][:180]}\n")


if __name__ == "__main__":
    main()
