from __future__ import annotations

import os
from dataclasses import dataclass

import httpx

from .core import extract_json_object

@dataclass(frozen=True)
class Review:
    title: str
    summary: str
    why_it_matters: str
    action: str | None
    confidence: float
    materiality: int
    publish: bool


class LLMReviewer:
    def __init__(self) -> None:
        self.base_url = os.environ.get("LLM_BASE_URL", "").rstrip("/")
        self.api_key = os.environ.get("LLM_API_KEY", "")
        self.model = os.environ.get("LLM_MODEL", "")
        if not self.base_url or not self.model:
            raise RuntimeError("LLM_BASE_URL and LLM_MODEL are required for automated review")

    def review(self, product: str, source_url: str, diff: str, heuristic_score: int) -> Review:
        prompt = f"""You are the editorial gate for Should Know, a high-signal product-change feed.
Only publish changes that materially affect capability, cost, limits, APIs, security/privacy, policy, availability, integrations, or a repeated workflow.
Reject cosmetic UI changes, marketing copy, vague announcements, duplicated information, and changes whose consequence cannot be established from the diff.

Product: {product}
First-party source: {source_url}
Heuristic materiality: {heuristic_score}/100

Diff:
{diff[:14000]}

Return JSON only with:
{{
  "publish": boolean,
  "materiality": integer 0-100,
  "confidence": number 0-1,
  "title": string,
  "summary": string,
  "why_it_matters": string,
  "action": string or null
}}
Keep title factual. Do not invent details absent from the diff. If evidence is insufficient, publish=false.
"""
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        response = httpx.post(
            f"{self.base_url}/chat/completions",
            headers=headers,
            json={"model": self.model, "temperature": 0.1, "messages": [{"role": "user", "content": prompt}]},
            timeout=120,
        )
        response.raise_for_status()
        payload = response.json()
        text = payload["choices"][0]["message"]["content"]
        data = extract_json_object(text)
        return Review(
            title=str(data.get("title", "")).strip(),
            summary=str(data.get("summary", "")).strip(),
            why_it_matters=str(data.get("why_it_matters", "")).strip(),
            action=(str(data["action"]).strip() if data.get("action") else None),
            confidence=float(data.get("confidence", 0)),
            materiality=int(data.get("materiality", 0)),
            publish=bool(data.get("publish", False)),
        )
