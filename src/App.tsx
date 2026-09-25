import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowRight,
  Bookmark,
  Check,
  Clock3,
  ExternalLink,
  GitBranch,
  Radio,
  Search,
  ShieldCheck,
  Shuffle,
  Sparkles,
  X,
  Zap,
} from 'lucide-react'
import rawTools from './data/tools.json'
import prototypeSignalsRaw from './data/signals.json'
import DiscoveryRadar from './DiscoveryRadar'

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
  score: number
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

type View = 'catalog' | 'signals' | 'radar' | 'saved'
type SortMode = 'score' | 'name' | 'signals' | 'number'

const tools = rawTools as Tool[]
const prototypeSignals = prototypeSignalsRaw as Signal[]
const API_BASE = ((import.meta.env.VITE_INTELLIGENCE_API as string | undefined) || '').replace(/\/$/, '')

const impactLabel: Record<string, string> = {
  high: 'P0 — HIGH IMPACT',
  medium: 'P1 — WORTH A LOOK',
  low: 'P2 — LOW SIGNAL',
}

const kindLabel: Record<string, string> = {
  capability: 'CAPABILITY',
  pricing: 'PRICING',
  model: 'MODEL',
  api: 'API',
  policy: 'POLICY',
  launch: 'LAUNCH',
}

function clean(text: string) {
  return (text || '').replace(/\*\*/g, '').replace(/`/g, '')
}

function relativeHours(hours: number) {
  if (hours < 1) return '< 1h ago'
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export default function App() {
  const [view, setView] = useState<View>('catalog')
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('All')
  const [sort, setSort] = useState<SortMode>('score')
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

  // Track visit timestamp
  useEffect(() => {
    const previous = Number(localStorage.getItem('shouldknow-last-visit') || 0)
    if (previous) setLastVisit(previous)
    localStorage.setItem('shouldknow-last-visit', String(Date.now()))
  }, [])

  // Sync saved list
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
        // Fallback to local signals
        setLiveSignals(prototypeSignals)
      })
      .finally(() => window.clearTimeout(timeout))

    return () => {
      window.clearTimeout(timeout)
      controller.abort()
    }
  }, [])

  // Keyboard shortcuts (⌘K for search, Esc to close modal)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setView('catalog')
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

  // Categories list
  const categories = useMemo(() => {
    const set = new Set<string>()
    for (const t of tools) {
      if (t.category) set.add(t.category)
    }
    return Array.from(set)
  }, [])

  // Filtered & sorted tools
  const filteredTools = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return tools
      .filter((t) => {
        if (view === 'saved' && !saved.includes(t.id)) return false
        if (category !== 'All' && t.category !== category) return false
        if (needle) {
          const haystack = [t.name, t.job, t.why, t.category, t.caveat].join(' ').toLowerCase()
          if (!haystack.includes(needle)) return false
        }
        return true
      })
      .sort((a, b) => {
        if (sort === 'score') return b.score - a.score
        if (sort === 'name') return a.name.localeCompare(b.name)
        if (sort === 'signals') {
          const sigsA = toolSignalsMap.get(a.id.toLowerCase())?.length || 0
          const sigsB = toolSignalsMap.get(b.id.toLowerCase())?.length || 0
          return sigsB - sigsA || b.score - a.score
        }
        return (b.number || 0) - (a.number || 0)
      })
  }, [category, query, saved, sort, toolSignalsMap, view])

  // Signals for the signal feed
  const feedSignals = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return liveSignals.filter((signal) => {
      if (view === 'saved' && !saved.includes(signal.toolId)) return false
      if (needle) {
        const text = [signal.tool, signal.title, signal.summary, signal.whyItMatters, signal.kind].join(' ').toLowerCase()
        if (!text.includes(needle)) return false
      }
      return true
    })
  }, [liveSignals, query, saved, view])

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
        <a className="brand" href="#top" onClick={() => setView('catalog')} aria-label="Should Know home">
          <span className="brand-mark">S</span>
          <span>
            should <i>know</i>
          </span>
        </a>

        <div className="topbar-right">
          <nav>
            <button
              className={`nav-btn ${view === 'catalog' ? 'active' : ''}`}
              onClick={() => setView('catalog')}
            >
              Collection <b>{tools.length}</b>
            </button>
            <button
              className={`nav-btn ${view === 'signals' ? 'active' : ''}`}
              onClick={() => setView('signals')}
            >
              Signals <b>{liveSignals.length}</b>
            </button>
            <button
              className={`nav-btn ${view === 'radar' ? 'active' : ''}`}
              onClick={() => setView('radar')}
            >
              Radar
            </button>
            <button
              className={`nav-btn ${view === 'saved' ? 'active' : ''}`}
              onClick={() => setView('saved')}
            >
              My Stack <b>{saved.length}</b>
            </button>
          </nav>

          <button className="shuffle-btn" onClick={surpriseMe} title="Pick a random high-signal tool">
            <Shuffle size={14} /> Surprise
          </button>
        </div>
      </header>

      <main id="top">
        {/* Hero Section */}
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow">
              <Sparkles size={14} />
              <span>Curated AI Intelligence — Zero Slop</span>
            </div>
            <h1>
              AI tools<br />
              <em>worth your time.</em>
            </h1>
            <p>
              {tools.length} hand-curated tools that improve a real workflow — with concrete jobs, honest caveats and verified change intelligence.
            </p>

            <div className="hero-actions">
              <button className="btn-primary" onClick={() => { setView('catalog'); document.querySelector('#collection')?.scrollIntoView({ behavior: 'smooth' }) }}>
                Explore collection <ArrowRight size={16} />
              </button>
              <button className="btn-secondary" onClick={() => setView('signals')}>
                <Zap size={15} /> Verified signals ({liveSignals.length})
              </button>
            </div>
          </div>

          <aside className="proof-card">
            <div className="proof-top">
              <span>EDITORIAL STANDARD</span>
              <ShieldCheck size={18} />
            </div>
            <p>Every tool gets one concrete job, an honest caveat, and a verified evidence trail.</p>
            <div className="proof-grid">
              <div>
                <strong>{tools.length}</strong>
                <small>Curated tools</small>
              </div>
              <div>
                <strong>100%</strong>
                <small>Official links</small>
              </div>
              <div>
                <strong>{liveSignals.length}</strong>
                <small>{isLiveApi ? 'Live verified diffs' : 'Curated signals'}</small>
              </div>
            </div>
          </aside>
        </section>

        {/* Return Strip */}
        {lastVisit && sinceCount > 0 && (
          <section className="return-strip">
            <div>
              <Clock3 size={16} />
              <span>Since your last visit</span>
            </div>
            <strong>{sinceCount} new signal{sinceCount === 1 ? '' : 's'} verified across watched tools</strong>
            <button onClick={() => setView('signals')}>
              Review updates <ArrowRight size={14} />
            </button>
          </section>
        )}

        {/* Editorial Principles */}
        <section className="principles">
          <div>
            <span className="mini-label">THE THREE RULES</span>
            <h2>
              Not another <em>AI tool list.</em>
            </h2>
          </div>
          <div className="principle-list">
            <div>
              <span>01</span>
              <b>Concrete jobs only.</b>
              <p>Every entry answers what you can get done in 5 minutes. No vague marketing fluff.</p>
            </div>
            <div>
              <span>02</span>
              <b>A caveat is mandatory.</b>
              <p>Real reviews state where a tool fails, its setup costs, and where human review remains essential.</p>
            </div>
            <div>
              <span>03</span>
              <b>Living change telemetry.</b>
              <p>Continuous diff-crawlers track breaking API changes, pricing tier updates, and new capabilities.</p>
            </div>
          </div>
        </section>

        {/* MAIN VIEW SWITCHER */}
        {view === 'catalog' || view === 'saved' ? (
          <section id="collection" className="catalog-section">
            <div className="section-head">
              <div>
                <span className="mini-label">
                  {view === 'saved' ? 'MY STACK' : 'CURATED COLLECTION'}
                </span>
                <h2>
                  {view === 'saved'
                    ? 'Your bookmarked AI stack.'
                    : 'Researched tools for real leverage.'}
                </h2>
              </div>
              <div className="result-count">
                {filteredTools.length} <span>tools</span>
              </div>
            </div>

            {/* Controls */}
            <div className="controls">
              <label className="search-bar">
                <Search size={17} />
                <input
                  ref={searchInputRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search a job, workflow, or tool name..."
                />
                <kbd>⌘ K</kbd>
              </label>

              <label className="sort-select">
                <span>Sort by:</span>
                <select value={sort} onChange={(e) => setSort(e.target.value as SortMode)}>
                  <option value="score">Highest editorial score</option>
                  <option value="signals">Recent verified changes</option>
                  <option value="name">Alphabetical (A–Z)</option>
                  <option value="number">Curated order</option>
                </select>
              </label>
            </div>

            {/* Category Filter Chips */}
            {view !== 'saved' && (
              <div className="chips">
                <button
                  className={`chip-btn ${category === 'All' ? 'active' : ''}`}
                  onClick={() => setCategory('All')}
                >
                  All <span>{tools.length}</span>
                </button>
                {categories.map((c) => {
                  const count = tools.filter((t) => t.category === c).length
                  return (
                    <button
                      key={c}
                      className={`chip-btn ${category === c ? 'active' : ''}`}
                      onClick={() => setCategory(c)}
                    >
                      {c} <span>{count}</span>
                    </button>
                  )
                })}
              </div>
            )}

            {/* Tool Cards Grid */}
            <div className="tool-grid">
              {filteredTools.map((tool) => {
                const signals = toolSignalsMap.get(tool.id.toLowerCase()) || []
                const latestSignal = signals[0]
                const isSaved = saved.includes(tool.id)

                return (
                  <article className="tool-card" key={tool.id}>
                    <div className="card-header">
                      <span className="card-tag">{tool.category}</span>
                      <button
                        className={`save-btn ${isSaved ? 'active' : ''}`}
                        onClick={() => toggleSave(tool.id)}
                        aria-label={`Save ${tool.name} to My Stack`}
                      >
                        <Bookmark size={16} fill={isSaved ? 'currentColor' : 'none'} />
                      </button>
                    </div>

                    <div className="card-title-row">
                      <h3>{tool.name}</h3>
                      <span className="score-badge">{tool.score.toFixed(1)}</span>
                    </div>

                    <p className="card-job">{clean(tool.job)}</p>
                    <p className="card-why">{clean(tool.why)}</p>

                    {/* Active Signal Banner */}
                    {latestSignal && (
                      <div className="card-signal-banner">
                        <Zap size={13} />
                        <div>
                          <strong>{latestSignal.materiality || 'UPDATE'}:</strong> {latestSignal.title.replace(`${tool.name}: `, '')}
                        </div>
                      </div>
                    )}

                    <div className="card-footer">
                      <button onClick={() => setSelectedTool(tool)}>
                        Why it matters <ArrowRight size={13} />
                      </button>
                      <a href={tool.url} target="_blank" rel="noreferrer">
                        Visit <ExternalLink size={13} />
                      </a>
                    </div>
                  </article>
                )
              })}
            </div>

            {!filteredTools.length && (
              <div className="empty-state">
                <Search size={24} />
                <h3>No tools matching your filters</h3>
                <p>
                  {view === 'saved'
                    ? 'You have not saved any tools to My Stack yet.'
                    : 'Try clearing your search query or switching category.'}
                </p>
                <button
                  onClick={() => {
                    setQuery('')
                    setCategory('All')
                    if (view === 'saved') setView('catalog')
                  }}
                >
                  Show all tools
                </button>
              </div>
            )}
          </section>
        ) : null}

        {/* SIGNAL FEED VIEW */}
        {view === 'signals' && (
          <section className="signal-feed-section">
            <div className="section-head">
              <div>
                <span className="mini-label">VERIFIED CHANGE INTELLIGENCE</span>
                <h2>What changed in tools that matter.</h2>
              </div>
              <div className="result-count">
                {feedSignals.length} <span>signals</span>
              </div>
            </div>

            <div className="signal-feed-list">
              {feedSignals.map((signal, index) => (
                <article className="signal-row" key={signal.id}>
                  <div className="signal-index">{String(index + 1).padStart(2, '0')}</div>

                  <div className="signal-main">
                    <div className="signal-meta">
                      <span className={signal.impact === 'high' ? 'badge-p0' : 'badge-p1'}>
                        {impactLabel[signal.impact] || signal.impact.toUpperCase()}
                      </span>
                      <span className="badge-kind">
                        {kindLabel[signal.kind] || signal.kind.toUpperCase()}
                      </span>
                      <span className="signal-age">{relativeHours(signal.ageHours)}</span>
                    </div>

                    <button
                      className="signal-tool-btn"
                      onClick={() => openToolModal(signal.toolId || signal.tool)}
                    >
                      {signal.tool} <ArrowRight size={13} />
                    </button>

                    <h3>{signal.title}</h3>
                    <p>{signal.summary}</p>

                    {signal.whyItMatters && (
                      <div className="signal-why">
                        <b>Why it matters:</b>
                        <span>{signal.whyItMatters}</span>
                      </div>
                    )}

                    <div className="signal-sources">
                      {signal.sources.map((source) => (
                        <a key={source.url} href={source.url} target="_blank" rel="noreferrer">
                          {source.label || 'Official evidence'} <ExternalLink size={12} />
                        </a>
                      ))}
                    </div>
                  </div>

                  <button
                    className={`save-btn ${saved.includes(signal.toolId) ? 'active' : ''}`}
                    onClick={() => toggleSave(signal.toolId)}
                    aria-label={`Save ${signal.tool}`}
                  >
                    <Bookmark size={18} fill={saved.includes(signal.toolId) ? 'currentColor' : 'none'} />
                  </button>
                </article>
              ))}

              {!feedSignals.length && (
                <div className="empty-state">
                  <Radio size={24} />
                  <h3>No signals found</h3>
                  <p>All active signals have been reviewed or filtered.</p>
                </div>
              )}
            </div>
          </section>
        )}

        {/* DISCOVERY RADAR VIEW OR FOOTER COMPONENT */}
        {(view === 'radar' || view === 'catalog') && <DiscoveryRadar />}
      </main>

      {/* FOOTER */}
      <footer>
        <div className="brand">
          <span className="brand-mark">S</span>
          <span>
            should <i>know</i>
          </span>
        </div>
        <p>Curated from official product sources, research and verified change intelligence.</p>
        <a href="https://github.com/igoingtodevx/shouldknow-ai" target="_blank" rel="noreferrer">
          <GitBranch size={15} /> Source
        </a>
      </footer>

      {/* TOOL DOSSIER MODAL */}
      {selectedTool && (
        <ToolModal
          tool={selectedTool}
          isSaved={saved.includes(selectedTool.id)}
          signals={toolSignalsMap.get(selectedTool.id.toLowerCase()) || []}
          onToggleSave={() => toggleSave(selectedTool.id)}
          onClose={() => setSelectedTool(null)}
        />
      )}
    </div>
  )
}

function ToolModal({
  tool,
  isSaved,
  signals,
  onToggleSave,
  onClose,
}: {
  tool: Tool
  isSaved: boolean
  signals: Signal[]
  onToggleSave: () => void
  onClose: () => void
}) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <article
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button className="modal-close" onClick={onClose} aria-label="Close modal">
          <X size={18} />
        </button>

        <span className="card-tag">{tool.category}</span>

        <div className="modal-header">
          <h2 id="modal-title">{tool.name}</h2>
          <strong>
            {tool.score.toFixed(1)} <small style={{ fontSize: 13, color: '#7c8694' }}>/ 10</small>
          </strong>
        </div>

        <section>
          <span className="section-tag">THE CONCRETE JOB</span>
          <p>{clean(tool.job)}</p>
        </section>

        <section>
          <span className="section-tag">WHY IT MADE THE CUT</span>
          <p>{clean(tool.why)}</p>
        </section>

        <section className="modal-caveat">
          <span className="section-tag" style={{ color: 'var(--accent-lime)' }}>
            KEEP IN MIND (HONEST CAVEAT)
          </span>
          <p>{clean(tool.caveat)}</p>
        </section>

        {signals.length > 0 && (
          <section style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 18 }}>
            <span className="section-tag">VERIFIED CHANGES & SIGNALS</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {signals.map((sig) => (
                <div
                  key={sig.id}
                  style={{
                    background: 'var(--bg-panel)',
                    padding: 12,
                    borderRadius: 6,
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: 11,
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--accent-lime)',
                      marginBottom: 4,
                    }}
                  >
                    <span>{sig.materiality || 'CHANGE'}</span>
                    <span>{relativeHours(sig.ageHours)}</span>
                  </div>
                  <strong style={{ display: 'block', fontSize: 14, marginBottom: 4 }}>{sig.title}</strong>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{sig.summary}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        <div className="modal-actions">
          <a className="btn-primary" href={tool.url} target="_blank" rel="noreferrer">
            Visit official site <ExternalLink size={15} />
          </a>
          {tool.evidenceUrl && (
            <a className="btn-secondary" href={tool.evidenceUrl} target="_blank" rel="noreferrer">
              Source trail <ArrowRight size={14} />
            </a>
          )}
          <button className="btn-secondary" onClick={onToggleSave}>
            {isSaved ? <Check size={15} /> : <Bookmark size={15} />}{' '}
            {isSaved ? 'In My Stack' : 'Save to Stack'}
          </button>
        </div>
      </article>
    </div>
  )
}
