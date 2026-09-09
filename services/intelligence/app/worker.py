from __future__ import annotations

import argparse
import os
import time

from .adapters import Crawl4AIClient
from .core import classify_materiality, content_hash, make_diff, normalize_markdown
from .db import init_schema, insert_candidate, insert_snapshot, latest_snapshot, publish_signal, upsert_product, upsert_source
from .reviewer import LLMReviewer
from .sources import SOURCES

THRESHOLD = int(os.environ.get("MATERIALITY_THRESHOLD", "45"))
AUTO_PUBLISH = os.environ.get("AUTO_PUBLISH", "false").lower() in {"1", "true", "yes"}
AUTO_PUBLISH_THRESHOLD = int(os.environ.get("AUTO_PUBLISH_THRESHOLD", "78"))
AUTO_PUBLISH_CONFIDENCE = float(os.environ.get("AUTO_PUBLISH_CONFIDENCE", "0.84"))
SCAN_INTERVAL_MINUTES = int(os.environ.get("SCAN_INTERVAL_MINUTES", "240"))


def scan_once() -> dict[str, int]:
    init_schema()
    crawler = Crawl4AIClient()
    reviewer = None
    try:
        reviewer = LLMReviewer()
    except RuntimeError:
        pass

    stats = {"checked": 0, "unchanged": 0, "baselined": 0, "noise": 0, "review": 0, "published": 0, "errors": 0}
    for source in SOURCES:
        stats["checked"] += 1
        try:
            upsert_product(source.product_slug, source.product_name)
            source_id = upsert_source(source.product_slug, source.url, source.source_type, source.first_party)
            before = latest_snapshot(source_id)
            markdown, metadata = crawler.crawl_markdown(source.url)
            canonical = normalize_markdown(markdown)
            digest = content_hash(canonical)
            if before and before["content_hash"] == digest:
                stats["unchanged"] += 1
                continue

            snapshot_id = insert_snapshot(source_id, digest, canonical, metadata)
            if not before:
                stats["baselined"] += 1
                continue

            diff = make_diff(before["markdown"], canonical)
            materiality = classify_materiality(diff, source.source_type)
            status = "noise" if materiality.score < THRESHOLD else "review"
            candidate_id = insert_candidate(
                source_id,
                int(before["id"]),
                snapshot_id,
                diff,
                materiality.score,
                materiality.kind,
                materiality.impact,
                list(materiality.reasons),
                status,
            )
            if status == "noise":
                stats["noise"] += 1
                continue

            stats["review"] += 1
            if not reviewer:
                continue
            review = reviewer.review(source.product_name, source.url, diff, materiality.score)
            if not review.publish or not review.title or not review.summary or not review.why_it_matters:
                continue
            if AUTO_PUBLISH and review.materiality >= AUTO_PUBLISH_THRESHOLD and review.confidence >= AUTO_PUBLISH_CONFIDENCE and source.first_party:
                publish_signal(candidate_id, review.title, review.summary, review.why_it_matters, review.action, review.confidence)
                stats["published"] += 1
        except Exception as exc:
            stats["errors"] += 1
            print(f"[scan-error] {source.product_name}: {exc}", flush=True)
    print(f"[scan] {stats}", flush=True)
    return stats


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--once", action="store_true")
    args = parser.parse_args()
    if args.once:
        scan_once()
        return
    while True:
        scan_once()
        time.sleep(max(60, SCAN_INTERVAL_MINUTES * 60))


if __name__ == "__main__":
    main()
