export type SignalImpact = 'high' | 'medium' | 'low'
export type SignalKind = 'model' | 'feature' | 'integration' | 'breaking' | 'policy' | 'pricing'

export type SignalSource = {
  label: string
  url: string
  firstParty: boolean
}

export type Signal = {
  id: string
  product: string
  title: string
  summary: string
  whyItMatters: string
  impact: SignalImpact
  kind: SignalKind
  publishedAt: string
  effectiveAt?: string
  action?: string
  tags: string[]
  sources: SignalSource[]
}

// Initial verified feed. These records are intentionally first-party sourced and static.
// The intelligence worker will replace this hand-maintained seed with continuously captured changes.
export const signals: Signal[] = [
  {
    id: 'openai-images-2-5-2026-09-08',
    product: 'ChatGPT Images',
    title: 'Images 2.5 adds sharper editing and new creation flows',
    summary: 'OpenAI added sharper image detail, more precise editing, templates, sketch-to-image, comments and prompt sharing. Existing image-generation limits are unchanged.',
    whyItMatters: 'This is a workflow change rather than a quota change: people already using ChatGPT for visual iteration get more control without a new limit model to account for.',
    impact: 'medium',
    kind: 'feature',
    publishedAt: '2026-09-08T12:00:00Z',
    tags: ['image', 'editing', 'creative'],
    sources: [
      { label: 'OpenAI release notes', url: 'https://help.openai.com/en/articles/6825453', firstParty: true },
    ],
  },
  {
    id: 'openai-gpt-6-astra-2026-09-03',
    product: 'OpenAI',
    title: 'GPT-6 Astra begins rolling out',
    summary: 'OpenAI introduced GPT-6 Astra for coding, research, computer use and complex multi-step work, including mid-turn steering and adjustable reasoning effort while preserving cached context.',
    whyItMatters: 'The useful part is not a benchmark headline. Mid-turn steering and long-running work directly change how agent workflows can be supervised and corrected while they are already in motion.',
    impact: 'high',
    kind: 'model',
    publishedAt: '2026-09-03T16:00:00Z',
    action: 'Check availability before designing production workflows around it; rollout is staged.',
    tags: ['model', 'agents', 'coding', 'research'],
    sources: [
      { label: 'OpenAI product release notes', url: 'https://openai.com/products/release-notes/', firstParty: true },
    ],
  },
  {
    id: 'vercel-astra-gateway-2026-09-04',
    product: 'Vercel AI Gateway',
    title: 'GPT-6 Astra is available through AI Gateway',
    summary: 'Vercel added GPT-6 Astra to AI Gateway under the model id openai/gpt-6-astra and documents use through AI SDK plus coding-agent integrations.',
    whyItMatters: 'Teams already standardising provider access behind Vercel can test Astra without introducing a separate provider integration path.',
    impact: 'medium',
    kind: 'integration',
    publishedAt: '2026-09-04T12:00:00Z',
    tags: ['gateway', 'agents', 'model-routing'],
    sources: [
      { label: 'Vercel changelog', url: 'https://vercel.com/changelog/gpt-6-astra-now-available-on-vercel-ai-gateway', firstParty: true },
    ],
  },
  {
    id: 'cursor-vercel-sandbox-2026-09-03',
    product: 'Cursor Cloud Agents',
    title: 'Cloud Agents can run inside Vercel Sandbox',
    summary: 'Cursor Cloud Agents can now use Vercel Sandbox as the execution environment, with isolated microVMs, scale-to-zero workers and durable orchestration. Cursor Enterprise is required for Self-Hosted Machines.',
    whyItMatters: 'This changes the control boundary for agent execution: the harness stays with Cursor while the compute environment can live in infrastructure you control.',
    impact: 'high',
    kind: 'integration',
    publishedAt: '2026-09-03T12:00:00Z',
    action: 'Relevant mainly if you need stronger control over agent execution infrastructure and already have Cursor Enterprise.',
    tags: ['coding-agents', 'sandbox', 'infrastructure'],
    sources: [
      { label: 'Vercel changelog', url: 'https://vercel.com/changelog/run-cursor-cloud-agents-vercel-sandbox', firstParty: true },
    ],
  },
  {
    id: 'github-copilot-policy-2026-08-28',
    product: 'GitHub Copilot',
    title: 'Unified Copilot policy and retention changes are coming',
    summary: 'GitHub plans to unify Copilot Chat on github.com, Mobile and cloud agent under one policy no earlier than September 28. The unified experience will be enabled by default, and github.com chat data will move from 28-day retention to account-lifetime retention.',
    whyItMatters: 'This is an administrative and data-governance change, not merely UI consolidation. Teams using managed Copilot should review policy and retention expectations before the rollout.',
    impact: 'high',
    kind: 'policy',
    publishedAt: '2026-08-28T12:00:00Z',
    effectiveAt: '2026-09-28T00:00:00Z',
    action: 'Business and enterprise admins should review the unified policy before September 28.',
    tags: ['policy', 'retention', 'enterprise', 'coding'],
    sources: [
      { label: 'GitHub changelog', url: 'https://github.blog/changelog/2026-08-28-upcoming-changes-to-github-copilot-policies-and-billing/', firstParty: true },
    ],
  },
  {
    id: 'supabase-logs-endpoint-2026-07-23',
    product: 'Supabase',
    title: 'logs.all is being removed from the Management API',
    summary: 'Supabase will remove the logs.all analytics endpoint on September 23. Log queries move to a ClickHouse-backed logs endpoint that uses ClickHouse SQL and a unified logs table.',
    whyItMatters: 'This can break scripts, integrations and older Supabase MCP tooling that call logs.all directly. The dashboard Logs Explorer is not affected.',
    impact: 'high',
    kind: 'breaking',
    publishedAt: '2026-07-23T12:00:00Z',
    effectiveAt: '2026-09-23T00:00:00Z',
    action: 'Migrate direct logs.all callers before September 23. Supabase notes that mcp-server-supabase v0.10.0 already uses the new endpoint.',
    tags: ['breaking-change', 'api', 'mcp', 'database'],
    sources: [
      { label: 'Supabase changelog', url: 'https://supabase.com/changelog/48235-migration-of-supabase-management-api-logs-all-analytics-endpoint-to-logs-endpoint', firstParty: true },
    ],
  },
]
