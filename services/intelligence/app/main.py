from __future__ import annotations

import os
from datetime import datetime

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from .db import init_schema, list_signals, product_dossier

app = FastAPI(title="Should Know Intelligence API", version="0.1.0")
origins = [item.strip() for item in os.environ.get("CORS_ORIGINS", "http://localhost:5173").split(",") if item.strip()]
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_credentials=False, allow_methods=["GET"], allow_headers=["*"])

@app.on_event("startup")
def startup() -> None:
    init_schema()

@app.get("/health")
def health() -> dict:
    return {"status": "ok", "time": datetime.utcnow().isoformat() + "Z"}

@app.get("/api/signals")
def signals(limit: int = Query(default=100, ge=1, le=250)) -> dict:
    rows = list_signals(limit)
    return {"signals": rows, "count": len(rows)}

@app.get("/api/dossiers/{slug}")
def dossier(slug: str) -> dict:
    value = product_dossier(slug)
    if not value:
        raise HTTPException(status_code=404, detail="Product not found")
    return value
