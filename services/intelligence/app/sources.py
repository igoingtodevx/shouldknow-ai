from __future__ import annotations

from dataclasses import dataclass

@dataclass(frozen=True)
class Source:
    product_slug: str
    product_name: str
    url: str
    source_type: str
    first_party: bool = True

# Deliberately small first-party watchset. Broad discovery is a separate queue,
# not an automatic publishing path.
SOURCES: tuple[Source, ...] = (
    Source("openai", "OpenAI", "https://openai.com/products/release-notes/", "changelog"),
    Source("openai-chatgpt", "ChatGPT", "https://help.openai.com/en/articles/6825453", "changelog"),
    Source("vercel", "Vercel", "https://vercel.com/changelog", "changelog"),
    Source("github-copilot", "GitHub Copilot", "https://github.blog/changelog/label/copilot/", "changelog"),
    Source("supabase", "Supabase", "https://supabase.com/changelog", "changelog"),
    Source("anthropic", "Anthropic", "https://docs.anthropic.com/en/release-notes/overview", "changelog"),
    Source("cursor", "Cursor", "https://www.cursor.com/changelog", "changelog"),
    Source("cloudflare", "Cloudflare", "https://developers.cloudflare.com/changelog/", "changelog"),
    Source("github", "GitHub", "https://github.blog/changelog/", "changelog"),
    Source("openrouter", "OpenRouter", "https://openrouter.ai/announcements", "changelog"),
)
