import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowRight,
  Bookmark,
  Check,
  Clock3,
  ExternalLink,
  Search,
  Shuffle,
  X,
  Zap,
} from 'lucide-react'
import rawTools from './data/tools.json'
import rawDossiers from './data/dossiers.json'
import prototypeSignalsRaw from './data/signals.json'
import DiscoveryRadar from './DiscoveryRadar'

export type Axis = {
  label: 'LEVERAGE' | 'MATURITY' | 'SETUP' | 'CONTROL' | 'PRICE' | 'EVIDENCE'
  value: string
}

export type Dossier = {
  id: string
  name: string
  url: string
  verdict: string
  axes: Axis[]
  bestFor: string[]
  caveat: string
}

export type Tool = {
  id: string
  number: number
  name: string
  url: string
  category: string
  edition?: string
  job: string
  why: string
  caveat: string
  score?: number
  evidenceUrl?: string
}

export type Source = {
  label: string
  url: string
  firstParty?: boolean
}

export type Signal = {
  id: string
  toolId: string
  tool: string
  kind: string
  impact: string
  ageHours: number
  title: string
  summary: string
  whyItMatters: string
  sources: Source[]
  prototype?: boolean
  materiality?: string
  confidence?: number
  detectedAt?: string
  publishedAt?: string | null
}

type View = 'signals' | 'registry' | 'radar' | 'stack'
type SignalTimeframe = 'all' | 'today' | 'week'
type SignalImpact = 'all' | 'p0' | 'p1'
type ToolSort = 'number' | 'signals' | 'name'

const tools = rawTools as Tool[]
const dossiers = rawDossiers as Dossier[]
const prototypeSignals = prototypeSignalsRaw as Signal[]
const API_BASE = ((import.meta.env.VITE_INTELLIGENCE_API as string | undefined) || '').replace(/\/$/, '')

const dossiersMap = new Map<string, Dossier>()
for (const d of dossiers) {
  dossiersMap.set(d.id.toLowerCase(), d)
  dossiersMap.set(d.name.toLowerCase(), d)
}

function clean(text: string) {
  return (text || '').replace(/\*\*/g, '').replace(/`/g, '').trim()
}

function relativeHours(hours: number) {
  if (hours < 1) return '< 1h ago'
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export default function App() {
  const [view, setView] = useState<View>('signals')
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('All')
  const [toolSort, setToolSort] = useState<ToolSort>('number')
  const [timeframe, setTimeframe] = useState<SignalTimeframe>('all')
  const [impactFilter, setImpactFilter] = useState<SignalImpact>('all')
  const [kindFilter, setKindFilter] = useState<string>('all')
  const [stackOnlySignals, setStackOnlySignals] = useState(false)

  const [saved, setSaved] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('shouldknow-saved') || '[]')
    } catch {
      return []
    }
  })

  const [selectedTool, setSelectedTool] = useState<Tool | null>(null)
  const [lastVisit, setLastVisit] = useState<number | null>(null)
  const [liveSignals, setLiveSignals] = useState<Signal[]>(prototypeSignals)
  const [isLiveApi, setIsLiveApi] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Track visit timestamp in localStorage
  useEffect(() => {
    const prev = Number(localStorage.getItem('shouldknow-last-visit') || 0)
    if (prev) setLastVisit(prev)
    localStorage.setItem('shouldknow-last-visit', String(Date.now()))
  }, [])

  // Sync saved tools to localStorage
  useEffect(() => {
    localStorage.setItem('shouldknow-saved', JSON.stringify(saved))
  }, [saved])

  // Fetch live signals from Intelligence API
  useEffect(() => {
    if (!API_BASE) return
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 6000)

    fetch(`${API_BASE}/v1/signals?hours=${24 * 90}`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`API error ${res.status}`)
        return res.json()
      })
      .then((data: unknown) => {
        if (Array.isArray(data) && data.length > 0) {
          setLiveSignals(data as Signal[])
          setIsLiveApi(true)
        }
      })
      .catch(() => {
        setLiveSignals(prototypeSignals)
      })
      .finally(() => window.clearTimeout(timeout))

    return () => {
      window.clearTimeout(timeout)
      controller.abort()
    }
  }, [])

  // Keyboard navigation (⌘K for search, Esc to close modal)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        searchInputRef.current?.focus()
      } else if (e.key === 'Escape') {
        setSelectedTool(null)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Map signals to tools
  const toolSignalsMap = useMemo(() => {
    const map = new Map<string, Signal[]>()
    for (const signal of liveSignals) {
      const toolIdKey = signal.toolId.toLowerCase()
      const toolNameKey = signal.tool.toLowerCase()
      const existing = map.get(toolIdKey) || map.get(toolNameKey) || []
      existing.push(signal)
      map.set(toolIdKey, existing)
      map.set(toolNameKey, existing)
    }
    return map
  }, [liveSignals])

  // Unique categories list
  const categories = useMemo(() => {
    const set = new Set<string>()
    for (const t of tools) {
      if (t.category) set.add(t.category)
    }
    return Array.from(set).sort()
  }, [])

  // Filtered & sorted signals
  const filteredSignals = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return liveSignals.filter((signal) => {
      if (stackOnlySignals && !saved.includes(signal.toolId)) return false
      if (timeframe === 'today' && signal.ageHours > 24) return false
      if (timeframe === 'week' && signal.ageHours > 168) return false
      if (impactFilter === 'p0' && signal.impact !== 'high') return false
      if (impactFilter === 'p1' && signal.impact !== 'medium') return false
      if (kindFilter !== 'all' && signal.kind !== kindFilter) return false
      if (needle) {
        const text = [signal.tool, signal.title, signal.summary, signal.whyItMatters, signal.kind].join(' ').toLowerCase()
        if (!text.includes(needle)) return false
      }
      return true
    })
  }, [impactFilter, kindFilter, liveSignals, query, saved, stackOnlySignals, timeframe])

  // Filtered & sorted tools
  const filteredTools = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return tools
      .filter((t) => {
        if (view === 'stack' && !saved.includes(t.id)) return false
        if (category !== 'All' && t.category !== category) return false
        if (needle) {
          const haystack = [t.name, t.job, t.why, t.category, t.caveat].join(' ').toLowerCase()
          if (!haystack.includes(needle)) return false
        }
        return true
      })
      .sort((a, b) => {
        if (toolSort === 'name') return a.name.localeCompare(b.name)
        if (toolSort === 'signals') {
          const sigsA = toolSignalsMap.get(a.id.toLowerCase())?.length || 0
          const sigsB = toolSignalsMap.get(b.id.toLowerCase())?.length || 0
          return sigsB - sigsA || a.number - b.number
        }
        return (a.number || 0) - (b.number || 0)
      })
  }, [category, query, saved, toolSignalsMap, toolSort, view])

  // Count signals landed since last visit
  const sinceCount = useMemo(() => {
    if (!lastVisit) return 0
    const elapsedHours = (Date.now() - lastVisit) / 3_600_000
    return liveSignals.filter((s) => s.ageHours <= elapsedHours).length
  }, [lastVisit, liveSignals])

  const toggleSave = (id: string) => {
    setSaved((curr) => (curr.includes(id) ? curr.filter((x) => x !== id) : [...curr, id]))
  }

  const openToolModal = (toolIdOrName: string) => {
    const target =
      tools.find((t) => t.id.toLowerCase() === toolIdOrName.toLowerCase()) ||
      tools.find((t) => t.name.toLowerCase() === toolIdOrName.toLowerCase())
    if (target) {
      setSelectedTool(target)
    }
  }

  const surpriseMe = () => {
    const random = tools[Math.floor(Math.random() * tools.length)]
    setSelectedTool(random)
  }

  return (
    <div className="site-shell">
      {/* Topbar Navigation */}
      <header className="topbar">
        <div className="topbar-left">
          <button className="brand-logo" onClick={() => setView('signals')} aria-label="Should Know home">
            <span className="brand-mark">S</span>
            <span className="brand-name">
              SHOULD <i>KNOW</i>
            </span>
          </button>
          <span className="brand-badge">PRODUCT INTELLIGENCE</span>
        </div>

        <nav className="topbar-nav" aria-label="Main navigation">
          <button
            className={`nav-link ${view === 'signals' ? 'active' : ''}`}
            onClick={() => setView('signals')}
          >
            <span className="pulse-dot" aria-hidden="true" />
            Signals <b>{liveSignals.length}</b>
          </button>
          <button
            className={`nav-link ${view === 'registry' ? 'active' : ''}`}
            onClick={() => setView('registry')}
          >
            Registry <b>{tools.length}</b>
          </button>
          <button
            className={`nav-link ${view === 'radar' ? 'active' : ''}`}
            onClick={() => setView('radar')}
          >
            Radar <b>55</b>
          </button>
          <button
            className={`nav-link ${view === 'stack' ? 'active' : ''}`}
            onClick={() => setView('stack')}
          >
            My Stack <b>{saved.length}</b>
          </button>
        </nav>

        <div className="topbar-actions">
          <button className="btn-surprise" onClick={surpriseMe} title="Inspect a random curated tool">
            <Shuffle size={13} /> Surprise
          </button>
        </div>
      </header>

      <main id="content">
        {/* Monolithic Editorial Hero */}
        <section className="hero-editorial">
          <div className="hero-main-col">
            <div className="telemetry-pill">
              <span className="telemetry-live-tag">{isLiveApi ? 'ENGINE LIVE' : 'REVIEWED FEED'}</span>
              <span>CONTINUOUS HEADLESS CRAWL // ZERO SPONSORED LISTINGS</span>
            </div>

            <h1 className="hero-title">
              Know what changed.
              <br />
              <em>Know what matters.</em>
            </h1>

            <p className="hero-desc">
              Evidence-first AI intelligence across 79 curated frontier products. We monitor official changelogs, pricing tables, and GitHub releases with headless browser crawls, filter out marketing noise, and enforce mandatory caveats on every tool.
            </p>

            <div className="hero-segmented-tabs">
              <button
                className={`tab-btn ${view === 'signals' ? 'active' : ''}`}
                onClick={() => setView('signals')}
              >
                Verified Signals ({liveSignals.length})
              </button>
              <button
                className={`tab-btn ${view === 'registry' ? 'active' : ''}`}
                onClick={() => setView('registry')}
              >
                Curated Registry ({tools.length})
              </button>
              <button
                className={`tab-btn ${view === 'radar' ? 'active' : ''}`}
                onClick={() => setView('radar')}
              >
                Discovery Radar (55)
              </button>
            </div>
          </div>

          <aside className="hero-telemetry-sidebar">
            <div className="telemetry-box">
              <span className="telemetry-heading">THE EDITORIAL LEDGER</span>
              <div className="telemetry-stat-row">
                <span className="telemetry-num">{tools.length}</span>
                <span className="telemetry-meta">
                  <strong>Curated Tools</strong>
                  <small>Explicit jobs &amp; honest caveats</small>
                </span>
              </div>
              <div className="telemetry-stat-row">
                <span className="telemetry-num">72</span>
                <span className="telemetry-meta">
                  <strong>Monitored Targets</strong>
                  <small>Crawl4AI headless Chromium</small>
                </span>
              </div>
              <div className="telemetry-stat-row">
                <span className="telemetry-num">{liveSignals.length}</span>
                <span className="telemetry-meta">
                  <strong>Verified Signals</strong>
                  <small>P0/P1 reviewed publications</small>
                </span>
              </div>
              <div className="telemetry-stat-row">
                <span className="telemetry-num">55</span>
                <span className="telemetry-meta">
                  <strong>Radar Candidates</strong>
                  <small>Cross-source directory tracking</small>
                </span>
              </div>
            </div>
          </aside>
        </section>

        {/* Return Strip */}
        {lastVisit && sinceCount > 0 && (
          <div className="return-notification-strip">
            <div className="return-strip-left">
              <Clock3 size={15} />
              <span>SINCE YOUR LAST VISIT</span>
              <strong>{sinceCount} new signal{sinceCount === 1 ? '' : 's'} landed across monitored tools</strong>
            </div>
            <button className="return-strip-cta" onClick={() => { setView('signals'); setTimeframe('today') }}>
              Review updates <ArrowRight size={13} />
            </button>
          </div>
        )}

        {/* ===================== VIEW 1: SIGNALS ===================== */}
        {view === 'signals' && (
          <section className="feed-section" aria-labelledby="feed-heading">
            <div className="section-toolbar">
              <div className="toolbar-header">
                <span className="section-eyebrow">INTELLIGENCE PULSE</span>
                <h2 id="feed-heading" className="section-title">
                  {stackOnlySignals ? 'Changes touching your stack' : 'Changes worth your attention'}
                </h2>
              </div>

              <div className="toolbar-controls">
                <div className="search-box">
                  <Search size={14} className="search-icon" />
                  <input
                    ref={searchInputRef}
                    type="search"
                    placeholder="Filter signals, tools, APIs... (⌘K)"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                  {query && (
                    <button className="search-clear" onClick={() => setQuery('')} aria-label="Clear query">
                      <X size={13} />
                    </button>
                  )}
                </div>

                <div className="filter-button-group">
                  <button
                    className={`filter-btn ${timeframe === 'all' ? 'active' : ''}`}
                    onClick={() => setTimeframe('all')}
                  >
                    All Time
                  </button>
                  <button
                    className={`filter-btn ${timeframe === 'today' ? 'active' : ''}`}
                    onClick={() => setTimeframe('today')}
                  >
                    Today (24h)
                  </button>
                  <button
                    className={`filter-btn ${timeframe === 'week' ? 'active' : ''}`}
                    onClick={() => setTimeframe('week')}
                  >
                    7 Days
                  </button>
                </div>

                <div className="filter-button-group">
                  <button
                    className={`filter-btn ${impactFilter === 'all' ? 'active' : ''}`}
                    onClick={() => setImpactFilter('all')}
                  >
                    All Tiers
                  </button>
                  <button
                    className={`filter-btn ${impactFilter === 'p0' ? 'active' : ''}`}
                    onClick={() => setImpactFilter('p0')}
                  >
                    P0 Should Know
                  </button>
                  <button
                    className={`filter-btn ${impactFilter === 'p1' ? 'active' : ''}`}
                    onClick={() => setImpactFilter('p1')}
                  >
                    P1 Worth a Look
                  </button>
                </div>

                <button
                  className={`filter-btn ${stackOnlySignals ? 'active' : ''}`}
                  onClick={() => setStackOnlySignals(!stackOnlySignals)}
                >
                  <Bookmark size={13} /> My Stack ({saved.length})
                </button>
              </div>
            </div>

            {/* Signal Stream */}
            <div className="signal-ledger">
              {filteredSignals.map((signal, idx) => {
                const isSaved = saved.includes(signal.toolId)
                return (
                  <article className="signal-entry" key={signal.id}>
                    <div className="signal-index-col">
                      <span className="entry-index">{String(idx + 1).padStart(2, '0')}</span>
                    </div>

                    <div className="signal-content-col">
                      <div className="signal-meta-bar">
                        <span className={`materiality-tag ${signal.impact}`}>
                          {signal.impact === 'high' ? 'P0 — SHOULD KNOW' : 'P1 — WORTH A LOOK'}
                        </span>
                        <span className="kind-tag">{signal.kind.toUpperCase()}</span>
                        <span className="timestamp-tag">{relativeHours(signal.ageHours)}</span>
                        {signal.prototype && <span className="prototype-tag">DEMO DIFF</span>}
                      </div>

                      <div className="signal-heading-group">
                        <button
                          className="tool-trigger-btn"
                          onClick={() => openToolModal(signal.toolId || signal.tool)}
                          title="Open tool dossier"
                        >
                          {signal.tool} <ArrowRight size={12} />
                        </button>
                        <h3 className="signal-headline">{clean(signal.title)}</h3>
                      </div>

                      <p className="signal-body">{clean(signal.summary)}</p>

                      <div className="signal-consequence-box">
                        <span className="consequence-label">WHY IT MATTERS</span>
                        <p>{clean(signal.whyItMatters)}</p>
                      </div>

                      <div className="signal-footer-row">
                        <div className="signal-sources-list">
                          {signal.sources.map((src) => (
                            <a
                              key={src.url}
                              href={src.url}
                              target="_blank"
                              rel="noreferrer"
                              className="source-evidence-link"
                            >
                              <span>{src.label}</span>
                              <ExternalLink size={11} />
                            </a>
                          ))}
                        </div>

                        <div className="signal-actions">
                          <button
                            className="btn-text-link"
                            onClick={() => openToolModal(signal.toolId || signal.tool)}
                          >
                            Open Dossier &rarr;
                          </button>
                          <button
                            className={`btn-icon-watch ${isSaved ? 'active' : ''}`}
                            onClick={() => toggleSave(signal.toolId)}
                            title={isSaved ? 'In your stack' : 'Add tool to My Stack'}
                            aria-label={`Save ${signal.tool}`}
                          >
                            <Bookmark size={15} fill={isSaved ? 'currentColor' : 'none'} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </article>
                )
              })}

              {filteredSignals.length === 0 && (
                <div className="empty-ledger-state">
                  <p>No verified signals matched your current filter criteria.</p>
                  <button
                    className="btn-reset"
                    onClick={() => {
                      setTimeframe('all')
                      setImpactFilter('all')
                      setKindFilter('all')
                      setStackOnlySignals(false)
                      setQuery('')
                    }}
                  >
                    Reset all filters
                  </button>
                </div>
              )}
            </div>
          </section>
        )}

        {/* ===================== VIEW 2: REGISTRY ===================== */}
        {view === 'registry' && (
          <section className="registry-section" aria-labelledby="registry-heading">
            <div className="section-toolbar">
              <div className="toolbar-header">
                <span className="section-eyebrow">THE LIVING REGISTRY</span>
                <h2 id="registry-heading" className="section-title">
                  79 hand-curated tools. Zero directory slop.
                </h2>
                <p className="section-subtitle">
                  Every tool in this catalog has passed editorial review: a mandatory single-line job, explicit assessment axes, and an unvarnished caveat.
                </p>
              </div>

              {/* Category Chips */}
              <div className="category-scroll-bar">
                <button
                  className={`category-chip ${category === 'All' ? 'active' : ''}`}
                  onClick={() => setCategory('All')}
                >
                  All ({tools.length})
                </button>
                {categories.map((cat) => {
                  const count = tools.filter((t) => t.category === cat).length
                  return (
                    <button
                      key={cat}
                      className={`category-chip ${category === cat ? 'active' : ''}`}
                      onClick={() => setCategory(cat)}
                    >
                      {cat} ({count})
                    </button>
                  )
                })}
              </div>

              {/* Search & Sort */}
              <div className="toolbar-controls">
                <div className="search-box">
                  <Search size={14} className="search-icon" />
                  <input
                    ref={searchInputRef}
                    type="search"
                    placeholder="Search 79 curated tools... (⌘K)"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                  {query && (
                    <button className="search-clear" onClick={() => setQuery('')} aria-label="Clear query">
                      <X size={13} />
                    </button>
                  )}
                </div>

                <div className="sort-group">
                  <span className="sort-label">SORT:</span>
                  <button
                    className={`filter-btn ${toolSort === 'number' ? 'active' : ''}`}
                    onClick={() => setToolSort('number')}
                  >
                    Index
                  </button>
                  <button
                    className={`filter-btn ${toolSort === 'signals' ? 'active' : ''}`}
                    onClick={() => setToolSort('signals')}
                  >
                    Recent Changes
                  </button>
                  <button
                    className={`filter-btn ${toolSort === 'name' ? 'active' : ''}`}
                    onClick={() => setToolSort('name')}
                  >
                    A &ndash; Z
                  </button>
                </div>
              </div>
            </div>

            {/* Architectural Tool Ledger */}
            <div className="registry-grid">
              {filteredTools.map((tool) => {
                const dossier = dossiersMap.get(tool.id.toLowerCase()) || dossiersMap.get(tool.name.toLowerCase())
                const signals = toolSignalsMap.get(tool.id.toLowerCase()) || toolSignalsMap.get(tool.name.toLowerCase()) || []
                const isSaved = saved.includes(tool.id)

                const leverageVal = dossier?.axes?.find((a) => a.label === 'LEVERAGE')?.value || 'High'
                const maturityVal = dossier?.axes?.find((a) => a.label === 'MATURITY')?.value || 'Proven'
                const priceVal = dossier?.axes?.find((a) => a.label === 'PRICE')?.value || '$$'

                return (
                  <article
                    className={`registry-card ${signals.length > 0 ? 'has-signals' : ''}`}
                    key={tool.id}
                    onClick={() => setSelectedTool(tool)}
                  >
                    <div className="card-top-bar">
                      <span className="card-index">#{String(tool.number || 0).padStart(2, '0')}</span>
                      <span className="card-category-tag">{tool.category}</span>
                      <button
                        className={`card-bookmark-btn ${isSaved ? 'active' : ''}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          toggleSave(tool.id)
                        }}
                        title={isSaved ? 'In your stack' : 'Add to My Stack'}
                        aria-label={`Bookmark ${tool.name}`}
                      >
                        <Bookmark size={15} fill={isSaved ? 'currentColor' : 'none'} />
                      </button>
                    </div>

                    <div className="card-identity">
                      <h3 className="card-tool-name">
                        {tool.name}
                        <span className="card-open-arrow">&rarr;</span>
                      </h3>
                      <p className="card-job-line">{clean(tool.job)}</p>
                    </div>

                    {/* Swiss Telemetry Badges */}
                    <div className="card-axes-row">
                      <span className="axis-mini-badge">LEVERAGE: {leverageVal}</span>
                      <span className="axis-mini-badge">{maturityVal}</span>
                      <span className="axis-mini-badge">{priceVal}</span>
                    </div>

                    {/* Signals Indicator */}
                    <div className="card-bottom-bar">
                      {signals.length > 0 ? (
                        <span className="pulse-signal-tag">
                          <Zap size={11} /> {signals.length} verified change{signals.length === 1 ? '' : 's'}
                        </span>
                      ) : (
                        <span className="quiescent-tag">NO RECENT BREAKING DIFFS</span>
                      )}
                      <span className="card-dossier-cta">Open Dossier</span>
                    </div>
                  </article>
                )
              })}
            </div>

            {filteredTools.length === 0 && (
              <div className="empty-ledger-state">
                <p>No tools matched your search or category filter.</p>
                <button
                  className="btn-reset"
                  onClick={() => {
                    setCategory('All')
                    setQuery('')
                  }}
                >
                  Show all 79 tools
                </button>
              </div>
            )}
          </section>
        )}

        {/* ===================== VIEW 3: RADAR ===================== */}
        {view === 'radar' && <DiscoveryRadar />}

        {/* ===================== VIEW 4: MY STACK ===================== */}
        {view === 'stack' && (
          <section className="stack-section" aria-labelledby="stack-heading">
            <div className="section-toolbar">
              <div className="toolbar-header">
                <span className="section-eyebrow">PERSONAL WATCHLIST</span>
                <h2 id="stack-heading" className="section-title">
                  My Stack ({saved.length} tools watched)
                </h2>
                <p className="section-subtitle">
                  Tools saved here are highlighted across the signal feed. You receive immediate diff alerts whenever our headless crawler detects a breaking capability or pricing change.
                </p>
              </div>
            </div>

            {saved.length === 0 ? (
              <div className="empty-stack-guide">
                <h3>Your stack is currently empty.</h3>
                <p>
                  Browse the curated registry or verified signals and click the bookmark icon on any tool you use in your workflow.
                </p>
                <button className="btn-primary" onClick={() => setView('registry')}>
                  Explore 79 Curated Tools &rarr;
                </button>
              </div>
            ) : (
              <div className="registry-grid">
                {filteredTools.map((tool) => {
                  const dossier = dossiersMap.get(tool.id.toLowerCase()) || dossiersMap.get(tool.name.toLowerCase())
                  const signals = toolSignalsMap.get(tool.id.toLowerCase()) || toolSignalsMap.get(tool.name.toLowerCase()) || []

                  return (
                    <article
                      className="registry-card"
                      key={tool.id}
                      onClick={() => setSelectedTool(tool)}
                    >
                      <div className="card-top-bar">
                        <span className="card-index">#{String(tool.number || 0).padStart(2, '0')}</span>
                        <span className="card-category-tag">{tool.category}</span>
                        <button
                          className="card-bookmark-btn active"
                          onClick={(e) => {
                            e.stopPropagation()
                            toggleSave(tool.id)
                          }}
                          title="Remove from stack"
                        >
                          <Bookmark size={15} fill="currentColor" />
                        </button>
                      </div>

                      <div className="card-identity">
                        <h3 className="card-tool-name">{tool.name}</h3>
                        <p className="card-job-line">{clean(tool.job)}</p>
                      </div>

                      <div className="card-axes-row">
                        <span className="axis-mini-badge">
                          LEVERAGE: {dossier?.axes?.find((a) => a.label === 'LEVERAGE')?.value || 'High'}
                        </span>
                        <span className="axis-mini-badge">
                          {dossier?.axes?.find((a) => a.label === 'MATURITY')?.value || 'Proven'}
                        </span>
                      </div>

                      <div className="card-bottom-bar">
                        {signals.length > 0 ? (
                          <span className="pulse-signal-tag">
                            <Zap size={11} /> {signals.length} verified change{signals.length === 1 ? '' : 's'}
                          </span>
                        ) : (
                          <span className="quiescent-tag">NO RECENT BREAKING DIFFS</span>
                        )}
                        <span className="card-dossier-cta">Open Dossier</span>
                      </div>
                    </article>
                  )
                })}
              </div>
            )}
          </section>
        )}

        {/* Editorial Standards Accordion */}
        <section className="editorial-contract-section">
          <div className="contract-header">
            <span className="section-eyebrow">THE EDITORIAL CONTRACT</span>
            <h2>How signals are filtered &amp; verified.</h2>
          </div>

          <div className="contract-grid">
            <div className="contract-col">
              <span className="contract-tier p0">P0 — SHOULD KNOW</span>
              <h4>Pricing shifts, breaking APIs, major capabilities</h4>
              <p>
                Published when a tool alters its unit economics, changes data/privacy terms, deprecates a key API, or introduces an fundamentally new workflow capability.
              </p>
            </div>

            <div className="contract-col">
              <span className="contract-tier p1">P1 — WORTH A LOOK</span>
              <h4>Meaningful features &amp; ecosystem expansions</h4>
              <p>
                Published when a new integration, model tier, or workflow improvement reduces friction in a measurable, repeatable way.
              </p>
            </div>

            <div className="contract-col">
              <span className="contract-tier p2">P2 — DROPPED NOISE</span>
              <h4>Cosmetic UI tweaks &amp; marketing buzzwords</h4>
              <p>
                Button renames, minor CSS polish, vague promotional claims, and repetitive release-note churn are automatically filtered out.
              </p>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="site-footer">
        <div className="footer-left">
          <span className="brand-mark">S</span>
          <div>
            <strong>SHOULD KNOW</strong>
            <p>Evidence-first AI product intelligence &amp; curated registry.</p>
          </div>
        </div>

        <div className="footer-center">
          <p>
            Zero affiliate bias. Zero sponsored placements. Every tool must have a concrete job and an honest caveat.
          </p>
        </div>

        <div className="footer-right">
          <a
            href="https://github.com/igoingtodevx/shouldknow-ai"
            target="_blank"
            rel="noreferrer"
            className="footer-link"
          >
            GitHub Repository &rarr;
          </a>
        </div>
      </footer>

      {/* Deep Dossier Modal / Drawer */}
      {selectedTool && (
        <DossierModal
          tool={selectedTool}
          dossier={
            dossiersMap.get(selectedTool.id.toLowerCase()) ||
            dossiersMap.get(selectedTool.name.toLowerCase()) || {
              id: selectedTool.id,
              name: selectedTool.name,
              url: selectedTool.url,
              verdict: clean(selectedTool.why),
              axes: [
                { label: 'LEVERAGE', value: 'High' },
                { label: 'MATURITY', value: 'Proven' },
                { label: 'SETUP', value: 'Low' },
                { label: 'CONTROL', value: 'Medium' },
                { label: 'PRICE', value: '$$' },
                { label: 'EVIDENCE', value: 'Strong' },
              ],
              bestFor: [clean(selectedTool.job)],
              caveat: clean(selectedTool.caveat),
            }
          }
          signals={
            toolSignalsMap.get(selectedTool.id.toLowerCase()) ||
            toolSignalsMap.get(selectedTool.name.toLowerCase()) ||
            []
          }
          isSaved={saved.includes(selectedTool.id)}
          onToggleSave={() => toggleSave(selectedTool.id)}
          onClose={() => setSelectedTool(null)}
        />
      )}
    </div>
  )
}

function DossierModal({
  tool,
  dossier,
  signals,
  isSaved,
  onToggleSave,
  onClose,
}: {
  tool: Tool
  dossier: Dossier
  signals: Signal[]
  isSaved: boolean
  onToggleSave: () => void
  onClose: () => void
}) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <article
        className="dossier-modal-window"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dossier-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button className="modal-close-btn" onClick={onClose} aria-label="Close dossier">
          <X size={18} />
        </button>

        <div className="dossier-header-strip">
          <div className="dossier-eyebrow-row">
            <span className="dossier-edition-badge">{tool.edition || 'Core 50'}</span>
            <span className="dossier-category-badge">{tool.category}</span>
          </div>

          <div className="dossier-title-row">
            <h2 id="dossier-title" className="dossier-tool-title">
              {tool.name}
            </h2>
            <button
              className={`btn-dossier-stack ${isSaved ? 'active' : ''}`}
              onClick={onToggleSave}
            >
              {isSaved ? <Check size={14} /> : <Bookmark size={14} />}
              {isSaved ? 'In My Stack' : 'Watch in Stack'}
            </button>
          </div>
        </div>

        {/* The Concrete Job */}
        <section className="dossier-section">
          <span className="dossier-section-tag">THE CONCRETE JOB</span>
          <p className="dossier-job-text">{clean(tool.job)}</p>
        </section>

        {/* Why it made the cut / Verdict */}
        <section className="dossier-section">
          <span className="dossier-section-tag">WHY IT MADE THE CUT (EDITORIAL VERDICT)</span>
          <p className="dossier-verdict-text">{clean(dossier.verdict || tool.why)}</p>
        </section>

        {/* The 6 Assessment Axes (Swiss Grid) */}
        <section className="dossier-section">
          <span className="dossier-section-tag">ASSESSMENT AXES</span>
          <div className="axes-telemetry-grid">
            {dossier.axes.map((axis) => (
              <div className="axis-telemetry-cell" key={axis.label}>
                <span className="axis-label">{axis.label}</span>
                <strong className="axis-value">{axis.value}</strong>
              </div>
            ))}
          </div>
        </section>

        {/* Honest Caveat */}
        <section className="dossier-caveat-section">
          <span className="dossier-caveat-tag">KEEP IN MIND (THE HONEST CAVEAT)</span>
          <p className="dossier-caveat-text">{clean(dossier.caveat || tool.caveat)}</p>
        </section>

        {/* Best For */}
        {dossier.bestFor && dossier.bestFor.length > 0 && (
          <section className="dossier-section">
            <span className="dossier-section-tag">BEST FOR</span>
            <ul className="dossier-bullets">
              {dossier.bestFor.map((item) => (
                <li key={item}>{clean(item)}</li>
              ))}
            </ul>
          </section>
        )}

        {/* Verified Crawler Changelog */}
        <section className="dossier-section dossier-signals-block">
          <span className="dossier-section-tag">VERIFIED CRAWLER DIFFS &amp; SIGNALS</span>
          {signals.length > 0 ? (
            <div className="dossier-signals-list">
              {signals.map((sig) => (
                <div className="dossier-signal-card" key={sig.id}>
                  <div className="dossier-sig-meta">
                    <span className={`materiality-tag ${sig.impact}`}>
                      {sig.impact === 'high' ? 'P0 — SHOULD KNOW' : 'P1 — WORTH A LOOK'}
                    </span>
                    <span className="kind-tag">{sig.kind.toUpperCase()}</span>
                    <span className="timestamp-tag">{relativeHours(sig.ageHours)}</span>
                  </div>
                  <strong className="dossier-sig-title">{clean(sig.title)}</strong>
                  <p className="dossier-sig-summary">{clean(sig.summary)}</p>
                  <div className="signal-consequence-box">
                    <span className="consequence-label">WHY IT MATTERS</span>
                    <p>{clean(sig.whyItMatters)}</p>
                  </div>
                  {sig.sources.length > 0 && (
                    <div className="signal-sources-list">
                      {sig.sources.map((s) => (
                        <a
                          key={s.url}
                          href={s.url}
                          target="_blank"
                          rel="noreferrer"
                          className="source-evidence-link"
                        >
                          <span>{s.label}</span>
                          <ExternalLink size={11} />
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="dossier-empty-signals">
              <p>Monitored on 6h crawler cycle. No breaking changes detected in the last 30 days.</p>
            </div>
          )}
        </section>

        {/* Modal Action Bar */}
        <div className="dossier-actions-bar">
          <a
            className="btn-action-primary"
            href={tool.url}
            target="_blank"
            rel="noreferrer"
          >
            Visit official site <ExternalLink size={14} />
          </a>
          {tool.evidenceUrl && (
            <a
              className="btn-action-secondary"
              href={tool.evidenceUrl}
              target="_blank"
              rel="noreferrer"
            >
              Source evidence trail &rarr;
            </a>
          )}
        </div>
      </article>
    </div>
  )
}
