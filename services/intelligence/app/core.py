from __future__ import annotations

import hashlib
import ipaddress
import json
import re
from dataclasses import dataclass
from difflib import unified_diff
from urllib.parse import urlparse

MATERIAL_TERMS = {
    "breaking": 36,
    "deprecated": 28,
    "deprecation": 28,
    "removed": 34,
    "removal": 34,
    "price": 28,
    "pricing": 30,
    "free tier": 35,
    "rate limit": 28,
    "quota": 25,
    "security": 28,
    "privacy": 30,
    "retention": 30,
    "policy": 22,
    "general availability": 18,
    "ga": 10,
    "beta": 8,
    "new model": 24,
    "model": 8,
    "api": 12,
    "endpoint": 14,
    "migration": 24,
    "sunset": 32,
    "shutdown": 40,
    "acquired": 24,
    "acquisition": 24,
    "self-host": 20,
    "agent": 8,
}

NOISE_TERMS = {
    "minor ui": 16,
    "small ui": 14,
    "typo": 20,
    "copy update": 14,
    "visual polish": 12,
    "bug fixes and improvements": 8,
}

KIND_RULES = [
    ("pricing", ("price", "pricing", "free tier", "quota")),
    ("breaking", ("breaking", "deprecated", "deprecation", "removed", "removal", "sunset", "migration")),
    ("policy", ("policy", "privacy", "retention", "terms")),
    ("model", ("new model", "model", "inference")),
    ("integration", ("integration", "gateway", "connector", "plugin", "mcp")),
    ("feature", ("feature", "available", "launch", "release")),
]

@dataclass(frozen=True)
class Materiality:
    score: int
    kind: str
    impact: str
    reasons: tuple[str, ...]


def normalize_markdown(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    lines = [re.sub(r"[ \t]+", " ", line).strip() for line in text.splitlines()]
    compact: list[str] = []
    blank = False
    for line in lines:
        if not line:
            if not blank:
                compact.append("")
            blank = True
        else:
            compact.append(line)
            blank = False
    return "\n".join(compact).strip()


def content_hash(text: str) -> str:
    return hashlib.sha256(normalize_markdown(text).encode("utf-8")).hexdigest()


def make_diff(before: str, after: str, max_chars: int = 18_000) -> str:
    diff = "\n".join(
        unified_diff(
            normalize_markdown(before).splitlines(),
            normalize_markdown(after).splitlines(),
            fromfile="previous",
            tofile="current",
            lineterm="",
            n=3,
        )
    )
    return diff[:max_chars]


def classify_materiality(diff: str, source_type: str = "unknown") -> Materiality:
    haystack = diff.lower()
    score = 0
    reasons: list[str] = []
    for term, weight in MATERIAL_TERMS.items():
        if term in haystack:
            score += weight
            reasons.append(term)
    for term, weight in NOISE_TERMS.items():
        if term in haystack:
            score -= weight
            reasons.append(f"noise:{term}")

    if source_type in {"pricing", "policy", "changelog", "release"}:
        score += 8
    if len(diff) > 6_000:
        score += 4
    score = max(0, min(100, score))

    kind = "feature"
    for candidate, terms in KIND_RULES:
        if any(term in haystack for term in terms):
            kind = candidate
            break

    impact = "high" if score >= 72 else "medium" if score >= 45 else "low"
    return Materiality(score=score, kind=kind, impact=impact, reasons=tuple(reasons[:8]))


def safe_public_url(url: str) -> bool:
    try:
        parsed = urlparse(url)
        if parsed.scheme not in {"http", "https"} or not parsed.hostname:
            return False
        host = parsed.hostname.rstrip(".").lower()
        if host in {"localhost", "localhost.localdomain"} or host.endswith(".local") or host.endswith(".internal"):
            return False
        try:
            ip = ipaddress.ip_address(host)
        except ValueError:
            return True
        return not (ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast)
    except Exception:
        return False


def extract_json_object(text: str) -> dict:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned)
    try:
        value = json.loads(cleaned)
        return value if isinstance(value, dict) else {}
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", cleaned, flags=re.S)
        if not match:
            return {}
        try:
            value = json.loads(match.group(0))
            return value if isinstance(value, dict) else {}
        except json.JSONDecodeError:
            return {}
