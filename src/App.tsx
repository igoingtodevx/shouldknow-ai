import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowRight,
  Bookmark,
  Check,
  Clock3,
  ExternalLink,
  Layers,
  Search,
  Shuffle,
  Table,
  X,
} from 'lucide-react'
import rawTools from './data/tools.json'
import rawDossiers from './data/dossiers.json'
import prototypeSignalsRaw from './data/signals.json'
import DiscoveryRadar from './DiscoveryRadar'

export type Language = 'de' | 'en'

export type Axis = {
  label: 'LEVERAGE' | 'MATURITY' | 'SETUP' | 'CONTROL' | 'PRICE' | 'EVIDENCE'
  value: string
}

export type Dossier = {
  id: string
  name: string
  url: string
  verdict: string
  verdict_de?: string
  verdict_en?: string
  axes: Axis[]
  bestFor: string[]
  bestFor_de?: string[]
  bestFor_en?: string[]
  caveat: string
  caveat_de?: string
  caveat_en?: string
}

export type Tool = {
  id: string
  number: number
  name: string
  url: string
  category: string
  edition?: string
  job: string
  job_en?: string
  why: string
  why_en?: string
  caveat: string
  caveat_en?: string
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
  title_de?: string
  summary: string
  summary_de?: string
  whyItMatters: string
  whyItMatters_de?: string
  sources: Source[]
  prototype?: boolean
  materiality?: string
  confidence?: number
  detectedAt?: string
  publishedAt?: string | null
}

type View = 'signals' | 'registry' | 'radar' | 'stack'
type RegistryMode = 'ledger' | 'specimen'
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

function formatRelativeTime(hours: number, lang: Language) {
  if (hours < 1) return lang === 'de' ? '< 1 Std. her' : '< 1h ago'
  if (hours < 24) return lang === 'de' ? `vor ${hours} Std.` : `${hours}h ago`
  const days = Math.floor(hours / 24)
  return lang === 'de' ? `vor ${days} T.` : `${days}d ago`
}

const CATEGORY_NAMES: Record<string, { de: string; en: string }> = {
  'UI & Design Systems': { de: 'UI & Designsysteme', en: 'UI & Design Systems' },
  'Code & Engineering': { de: 'Code & Engineering', en: 'Code & Engineering' },
  'Research & Data': { de: 'Recherche & Daten', en: 'Research & Data' },
  'Knowledge & Workflows': { de: 'Wissenssysteme & Workflows', en: 'Knowledge & Workflows' },
  'Creative & Media': { de: 'Kreation & Medien', en: 'Creative & Media' },
  'Language & Learning': { de: 'Sprache & Verständnis', en: 'Language & Learning' },
  'Productivity & Flow': { de: 'Fokus & Produktivität', en: 'Productivity & Flow' },
}

export default function App() {
  const [lang, setLang] = useState<Language>(() => {
    try {
      const stored = localStorage.getItem('shouldknow-lang')
      if (stored === 'de' || stored === 'en') return stored
      return 'de'
    } catch {
      return 'de'
    }
  })

  const [view, setView] = useState<View>('signals')
  const [registryMode, setRegistryMode] = useState<RegistryMode>('ledger')
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

  // Persist language
  useEffect(() => {
    try {
      localStorage.setItem('shouldknow-lang', lang)
    } catch {
      // ignore
    }
  }, [lang])

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

  // Keyboard navigation (⌘K for search, Esc to close drawer)
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
        const text = [
          signal.tool,
          signal.title,
          signal.title_de || '',
          signal.summary,
          signal.summary_de || '',
          signal.whyItMatters,
          signal.whyItMatters_de || '',
          signal.kind,
        ]
          .join(' ')
          .toLowerCase()
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
          const haystack = [
            t.name,
            t.job,
            t.job_en || '',
            t.why,
            t.why_en || '',
            t.category,
            t.caveat,
            t.caveat_en || '',
          ]
            .join(' ')
            .toLowerCase()
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

  // Selected tool dossier lookup
  const selectedDossier = useMemo(() => {
    if (!selectedTool) return null
    return (
      dossiersMap.get(selectedTool.id.toLowerCase()) ||
      dossiersMap.get(selectedTool.name.toLowerCase()) ||
      null
    )
  }, [selectedTool])

  const selectedToolSignals = useMemo(() => {
    if (!selectedTool) return []
    return (
      toolSignalsMap.get(selectedTool.id.toLowerCase()) ||
      toolSignalsMap.get(selectedTool.name.toLowerCase()) ||
      []
    )
  }, [selectedTool, toolSignalsMap])

  return (
    <div className="site-shell">
      {/* Topbar Architecture */}
      <header className="topbar">
        <div className="topbar-main-bar">
          <div className="topbar-left">
            <button className="brand-logo" onClick={() => setView('signals')} aria-label="Should Know home">
              <span className="brand-mark">S</span>
              <span className="brand-name">
                SHOULD <i>KNOW</i>
              </span>
            </button>
            <span className="brand-badge">
              {lang === 'de' ? 'PRODUKT-INTELLIGENCE' : 'PRODUCT INTELLIGENCE'}
            </span>
          </div>

          <div className="topbar-actions">
            {/* Architectural Language Switch */}
            <div className="lang-switcher" role="group" aria-label="Language selector">
              <button
                className={`lang-btn ${lang === 'de' ? 'active' : ''}`}
                onClick={() => setLang('de')}
                title="Deutsch"
              >
                DE
              </button>
              <span className="lang-divider">/</span>
              <button
                className={`lang-btn ${lang === 'en' ? 'active' : ''}`}
                onClick={() => setLang('en')}
                title="English"
              >
                EN
              </button>
            </div>

            <button className="btn-surprise" onClick={surpriseMe} title={lang === 'de' ? 'Zufälliges Werkzeug öffnen' : 'Inspect a random curated tool'}>
              <Shuffle size={12} /> {lang === 'de' ? 'Zufall' : 'Surprise'}
            </button>
          </div>
        </div>

        <nav className="topbar-nav" aria-label="Main navigation">
          <button
            className={`nav-link ${view === 'signals' ? 'active' : ''}`}
            onClick={() => setView('signals')}
          >
            <span className="nav-index">01</span>
            {lang === 'de' ? 'Signale' : 'Signals'} <b>{liveSignals.length}</b>
          </button>
          <button
            className={`nav-link ${view === 'registry' ? 'active' : ''}`}
            onClick={() => setView('registry')}
          >
            <span className="nav-index">02</span>
            {lang === 'de' ? 'Register' : 'Registry'} <b>{tools.length}</b>
          </button>
          <button
            className={`nav-link ${view === 'radar' ? 'active' : ''}`}
            onClick={() => setView('radar')}
          >
            <span className="nav-index">03</span>
            Radar <b>55</b>
          </button>
          <button
            className={`nav-link ${view === 'stack' ? 'active' : ''}`}
            onClick={() => setView('stack')}
          >
            <span className="nav-index">04</span>
            {lang === 'de' ? 'Mein Stack' : 'My Stack'} <b>{saved.length}</b>
          </button>
        </nav>
      </header>

      <main id="content">
        {/* Monolithic Classical Hero (Awwwards Standard) */}
        <section className="hero-editorial">
          <div className="hero-grid-container">
            <div className="hero-editorial-col">
              <div className="telemetry-stamp">
                <span className="telemetry-status-dot" aria-hidden="true" />
                <span className="telemetry-lead">{isLiveApi ? 'ENGINE LIVE' : 'VERIFIED AUDIT'}</span>
                <span className="telemetry-sep">·</span>
                <span>
                  {lang === 'de'
                    ? 'AUSGABE 04 · 79 FRONTIER-WERKZEUGE · EVIDENZ-PROTOKOLL'
                    : 'ISSUE 04 · 79 FRONTIER TOOLS · EVIDENCE PROTOCOL'}
                </span>
              </div>

              <h1 className="hero-title">
                {lang === 'de' ? (
                  <>
                    EVIDENZ STATT MARKETING.
                    <br />
                    <em>Was sich wirklich verändert.</em>
                  </>
                ) : (
                  <>
                    EVIDENCE OVER NOISE.
                    <br />
                    <em>Know what changed. Know what matters.</em>
                  </>
                )}
              </h1>

              <p className="hero-desc">
                {lang === 'de'
                  ? 'Evidenzbasierte Produkt-Intelligence über 79 handkuratierte Frontier-Werkzeuge. Wir überwachen Changelogs, Pricing-Tabellen und GitHub-Releases per Headless-Browser. Keine gesponserten Einträge, ausnahmslos mit ungeschminkten Grenzen (Honest Caveats).'
                  : 'Evidence-first product intelligence across 79 curated frontier tools. Continuous headless monitoring of official changelogs, pricing tables, and GitHub releases. Zero pay-to-play listings, mandatory honest caveats.'}
              </p>

              <div className="hero-segmented-tabs">
                <button
                  className={`tab-btn ${view === 'signals' ? 'active' : ''}`}
                  onClick={() => setView('signals')}
                >
                  {lang === 'de' ? 'Verifizierte Signale' : 'Verified Signals'} ({liveSignals.length})
                </button>
                <button
                  className={`tab-btn ${view === 'registry' ? 'active' : ''}`}
                  onClick={() => setView('registry')}
                >
                  {lang === 'de' ? 'Kuratierte Werkzeuge' : 'Curated Registry'} ({tools.length})
                </button>
                <button
                  className={`tab-btn ${view === 'radar' ? 'active' : ''}`}
                  onClick={() => setView('radar')}
                >
                  {lang === 'de' ? 'Ökosystem-Radar' : 'Ecosystem Radar'} (55)
                </button>
              </div>
            </div>

            {/* Asymmetrical Telemetry Ledger */}
            <div className="hero-telemetry-col">
              <div className="telemetry-ledger-card">
                <span className="telemetry-card-label">
                  {lang === 'de' ? 'SYSTEM-TELEMETRIE & AUDIT' : 'SYSTEM TELEMETRY & AUDIT'}
                </span>
                
                <div className="telemetry-metric-item">
                  <div className="metric-number">79</div>
                  <div className="metric-info">
                    <strong>{lang === 'de' ? 'Kuratierte Werkzeuge' : 'Curated Products'}</strong>
                    <small>{lang === 'de' ? 'Ausnahmslos mit Honest Caveat' : 'With mandatory caveats'}</small>
                  </div>
                </div>

                <div className="telemetry-metric-item">
                  <div className="metric-number">{liveSignals.length}</div>
                  <div className="metric-info">
                    <strong>{lang === 'de' ? 'Verifizierte Signale' : 'Verified Signals'}</strong>
                    <small>{lang === 'de' ? 'First-Party Diffs & Releases' : 'First-party diffs & releases'}</small>
                  </div>
                </div>

                <div className="telemetry-metric-item">
                  <div className="metric-number">55</div>
                  <div className="metric-info">
                    <strong>{lang === 'de' ? 'Radar-Kandidaten' : 'Radar Candidates'}</strong>
                    <small>{lang === 'de' ? 'In redaktioneller Quarantäne' : 'In editorial quarantine'}</small>
                  </div>
                </div>

                <div className="telemetry-metric-item">
                  <div className="metric-number zero-bias">0</div>
                  <div className="metric-info">
                    <strong>{lang === 'de' ? 'Gekaufte Platzierungen' : 'Sponsored Bias'}</strong>
                    <small>{lang === 'de' ? '100% Unabhängig kuratiert' : '100% Independent audit'}</small>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Return Visitor Strip */}
        {sinceCount > 0 && (
          <aside className="return-notification-strip">
            <div className="return-strip-left">
              <span className="pulse-dot-clean" />
              <span>
                <strong>{sinceCount}</strong> {lang === 'de' ? 'neue verifizierte Signale seit Ihrem letzten Besuch erfasst.' : 'new verified signals landed across monitored tools.'}
              </span>
            </div>
            <button
              className="return-strip-cta"
              onClick={() => {
                setView('signals')
                setTimeframe('today')
              }}
            >
              {lang === 'de' ? 'Zu den Neuerungen ansehen' : 'Inspect recent updates'} <ArrowRight size={12} />
            </button>
          </aside>
        )}

        {/* Section Toolbar & Controls */}
        {view !== 'radar' && (
          <section className="section-toolbar">
          <div className="toolbar-header">
            <div>
              <span className="section-eyebrow">
                {view === 'signals' && (lang === 'de' ? 'INTELLIGENCE-FEED' : 'INTELLIGENCE FEED')}
                {view === 'registry' && (lang === 'de' ? 'WERKZEUG-REGISTER' : 'PRODUCT REGISTRY')}
                {view === 'stack' && (lang === 'de' ? 'MEIN STACK' : 'MY STACK')}
              </span>
              <h2 className="section-title">
                {view === 'signals' && (lang === 'de' ? 'Was sich verändert hat.' : 'What changed.')}
                {view === 'registry' && (lang === 'de' ? '79 Werkzeuge, die ihre Zeit wert sind.' : '79 tools worth your time.')}
                {view === 'stack' && (lang === 'de' ? 'Ihre beobachteten Werkzeuge.' : 'Your monitored toolstack.')}
              </h2>
              <p className="section-subtitle">
                {view === 'signals' &&
                  (lang === 'de'
                    ? 'Verifizierte Changelogs, Pricing-Anpassungen und API-Releases. Nach redaktioneller Relevanz gewichtet.'
                    : 'Verified changelogs, pricing tier shifts, and API releases filtered for architectural consequence.')}
                {view === 'registry' &&
                  (lang === 'de'
                    ? 'Jedes Werkzeug mit genau einem konkreten Einsatzzweck, redaktioneller Begründung und ungeschminkter Schwachstelle.'
                    : 'Every tool evaluated with one concrete job, editorial rationale, and mandatory honest caveat.')}
                {view === 'stack' &&
                  (lang === 'de'
                    ? 'Ihre gemerkten Werkzeuge. Filtern Sie Signale direkt auf Ihren persönlichen Arbeits-Stack.'
                    : 'Your saved tools. Filter verified signals down to the products your team relies on.')}
              </p>
            </div>
          </div>

          <div className="toolbar-controls">
            {/* Search Input */}
            <div className="search-box">
              <Search size={13} className="search-icon" />
              <input
                ref={searchInputRef}
                type="search"
                placeholder={
                  lang === 'de'
                    ? 'Werkzeuge, Jobs oder Signale suchen... (⌘K)'
                    : 'Search tools, jobs, or signals... (⌘K)'
                }
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {query && (
                <button className="search-clear" onClick={() => setQuery('')} aria-label="Clear query">
                  <X size={12} />
                </button>
              )}
            </div>

            {/* Registry Specific View Modes */}
            {(view === 'registry' || view === 'stack') && (
              <div className="view-mode-toggle" role="group" aria-label="Registry layout switch">
                <button
                  className={`mode-btn ${registryMode === 'ledger' ? 'active' : ''}`}
                  onClick={() => setRegistryMode('ledger')}
                  title={lang === 'de' ? 'Archiv-Ledger (Breite Tabelle)' : 'Archive Ledger (Broadsheet Table)'}
                >
                  <Table size={12} /> {lang === 'de' ? 'Ledger' : 'Ledger'}
                </button>
                <button
                  className={`mode-btn ${registryMode === 'specimen' ? 'active' : ''}`}
                  onClick={() => setRegistryMode('specimen')}
                  title={lang === 'de' ? 'Exemplar-Zellen (Raster)' : 'Specimen Cells (Grid)'}
                >
                  <Layers size={12} /> {lang === 'de' ? 'Zellen' : 'Cells'}
                </button>
              </div>
            )}

            {/* Signals Specific Filters */}
            {view === 'signals' && (
              <>
                <div className="filter-button-group">
                  <button
                    className={`filter-btn ${timeframe === 'all' ? 'active' : ''}`}
                    onClick={() => setTimeframe('all')}
                  >
                    {lang === 'de' ? 'Alle Zeiten' : 'All Time'}
                  </button>
                  <button
                    className={`filter-btn ${timeframe === 'today' ? 'active' : ''}`}
                    onClick={() => setTimeframe('today')}
                  >
                    {lang === 'de' ? '24 Stunden' : 'Today'}
                  </button>
                  <button
                    className={`filter-btn ${timeframe === 'week' ? 'active' : ''}`}
                    onClick={() => setTimeframe('week')}
                  >
                    {lang === 'de' ? '7 Tage' : 'This Week'}
                  </button>
                </div>

                <div className="filter-button-group">
                  <button
                    className={`filter-btn ${impactFilter === 'all' ? 'active' : ''}`}
                    onClick={() => setImpactFilter('all')}
                  >
                    {lang === 'de' ? 'Alle Relevanzen' : 'All Impact'}
                  </button>
                  <button
                    className={`filter-btn ${impactFilter === 'p0' ? 'active' : ''}`}
                    onClick={() => setImpactFilter('p0')}
                  >
                    P0 · Critical
                  </button>
                  <button
                    className={`filter-btn ${impactFilter === 'p1' ? 'active' : ''}`}
                    onClick={() => setImpactFilter('p1')}
                  >
                    P1 · Capability
                  </button>
                </div>

                {saved.length > 0 && (
                  <button
                    className={`filter-btn ${stackOnlySignals ? 'active' : ''}`}
                    onClick={() => setStackOnlySignals(!stackOnlySignals)}
                  >
                    <Bookmark size={11} /> {lang === 'de' ? 'Nur mein Stack' : 'My Stack Only'}
                  </button>
                )}
              </>
            )}

            {/* Sorters */}
            {(view === 'registry' || view === 'stack') && (
              <div className="sort-group">
                <span className="sort-label">{lang === 'de' ? 'SORTIERUNG:' : 'SORT:'}</span>
                <button
                  className={`filter-btn ${toolSort === 'number' ? 'active' : ''}`}
                  onClick={() => setToolSort('number')}
                >
                  № Index
                </button>
                <button
                  className={`filter-btn ${toolSort === 'signals' ? 'active' : ''}`}
                  onClick={() => setToolSort('signals')}
                >
                  {lang === 'de' ? 'Diffs' : 'Signals'}
                </button>
                <button
                  className={`filter-btn ${toolSort === 'name' ? 'active' : ''}`}
                  onClick={() => setToolSort('name')}
                >
                  A–Z
                </button>
              </div>
            )}
          </div>

          {/* Category Bar for Registry */}
          {(view === 'registry' || view === 'stack') && (
            <div className="category-scroll-bar">
              <button
                className={`category-chip ${category === 'All' ? 'active' : ''}`}
                onClick={() => setCategory('All')}
              >
                {lang === 'de' ? 'Alle Werkzeuge' : 'All Categories'} ({tools.length})
              </button>
              {categories.map((cat) => {
                const count = tools.filter((t) => t.category === cat).length
                const label = CATEGORY_NAMES[cat] ? (lang === 'de' ? CATEGORY_NAMES[cat].de : CATEGORY_NAMES[cat].en) : cat
                return (
                  <button
                    key={cat}
                    className={`category-chip ${category === cat ? 'active' : ''}`}
                    onClick={() => setCategory(cat)}
                  >
                    {label} ({count})
                  </button>
                )
              })}
            </div>
          )}
        </section>
      )}

        {/* VIEW 1: SIGNALS WIRE (THE GAZETTE) */}
        {view === 'signals' && (
          <section className="signal-ledger" aria-label="Live Signals Wire">
            {filteredSignals.map((signal, idx) => {
              const sigTitle = lang === 'de' && signal.title_de ? signal.title_de : signal.title
              const sigSummary = lang === 'de' && signal.summary_de ? signal.summary_de : signal.summary
              const sigWhy = lang === 'de' && signal.whyItMatters_de ? signal.whyItMatters_de : signal.whyItMatters
              const isP0 = signal.impact === 'high'

              return (
                <article key={signal.id} className="signal-entry">
                  {/* Column 1: Swiss Telemetry Stamp */}
                  <div className="entry-telemetry-col">
                    <span className="entry-index">{String(idx + 1).padStart(2, '0')}</span>
                    <span className={`materiality-badge ${isP0 ? 'p0' : 'p1'}`}>
                      {isP0 ? 'P0 · CRITICAL' : 'P1 · UPDATE'}
                    </span>
                    <span className="time-badge">{formatRelativeTime(signal.ageHours, lang)}</span>
                    <span className="kind-badge">{signal.kind}</span>
                  </div>

                  {/* Column 2: Journalistic Synthesis */}
                  <div className="entry-content-col">
                    <div className="signal-heading-group">
                      <button
                        className="tool-trigger-btn"
                        onClick={() => openToolModal(signal.toolId || signal.tool)}
                        title={lang === 'de' ? 'Dossier dieses Werkzeugs öffnen' : 'Open tool dossier'}
                      >
                        {signal.tool} <ArrowRight size={11} />
                      </button>
                      <h3 className="signal-headline">{sigTitle}</h3>
                    </div>

                    <p className="signal-body">{clean(sigSummary)}</p>

                    <div className="signal-consequence-box">
                      <span className="consequence-label">
                        {lang === 'de' ? 'REDAKTIONELLE EINORDNUNG & RELEVANZ' : 'STRATEGIC CONSEQUENCE & VERDICT'}
                      </span>
                      <p>{clean(sigWhy)}</p>
                    </div>

                    <div className="signal-footer-row">
                      <div className="signal-sources-list">
                        {signal.sources.map((s) => (
                          <a
                            key={s.url}
                            href={s.url}
                            target="_blank"
                            rel="noreferrer"
                            className="source-evidence-link"
                          >
                            <span>{s.label || (lang === 'de' ? 'Primärquelle' : 'Primary Source')}</span>
                            <ExternalLink size={10} />
                          </a>
                        ))}
                      </div>

                      <div className="signal-actions">
                        <button
                          className="btn-text-link"
                          onClick={() => openToolModal(signal.toolId || signal.tool)}
                        >
                          {lang === 'de' ? 'Dossier einsehen →' : 'Inspect Dossier →'}
                        </button>
                        <button
                          className={`btn-icon-watch ${saved.includes(signal.toolId) ? 'active' : ''}`}
                          onClick={() => toggleSave(signal.toolId)}
                          title={lang === 'de' ? 'Zu Mein Stack hinzufügen' : 'Toggle tool in My Stack'}
                        >
                          <Bookmark size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              )
            })}

            {filteredSignals.length === 0 && (
              <div className="empty-ledger-state">
                <p>
                  {lang === 'de'
                    ? 'Keine Signale für diese Filtereinstellungen gefunden.'
                    : 'No verified signals match the current filter selection.'}
                </p>
                <button
                  className="btn-reset"
                  onClick={() => {
                    setQuery('')
                    setTimeframe('all')
                    setImpactFilter('all')
                    setKindFilter('all')
                    setStackOnlySignals(false)
                  }}
                >
                  {lang === 'de' ? 'Filter zurücksetzen' : 'Reset Filters'}
                </button>
              </div>
            )}
          </section>
        )}

        {/* VIEW 2 & 4: MASTER REGISTRY & MY STACK */}
        {(view === 'registry' || view === 'stack') && (
          <>
            {/* View Mode 1: Architectural Archive Ledger (Default) */}
            {registryMode === 'ledger' && (
              <div className="archive-ledger-container">
                <div className="ledger-header-row">
                  <div className="col-idx">{lang === 'de' ? '№' : '№'}</div>
                  <div className="col-entity">{lang === 'de' ? 'WERKZEUG & EDITION' : 'TOOL & EDITION'}</div>
                  <div className="col-job">{lang === 'de' ? 'DER KONKRETE EINSATZZWECK' : 'THE CONCRETE JOB'}</div>
                  <div className="col-caveat">{lang === 'de' ? 'EHRLICHE GRENZE (CAVEAT)' : 'MANDATORY CAVEAT'}</div>
                  <div className="col-telemetry">{lang === 'de' ? 'TELEMETRIE' : 'TELEMETRY'}</div>
                  <div className="col-action">{lang === 'de' ? 'AKTION' : 'ACTION'}</div>
                </div>

                <div className="ledger-body">
                  {filteredTools.map((t) => {
                    const sigs = toolSignalsMap.get(t.id.toLowerCase()) || []
                    const tJob = lang === 'en' && t.job_en ? t.job_en : t.job
                    const tCaveat = lang === 'en' && t.caveat_en ? t.caveat_en : t.caveat
                    const catLabel = CATEGORY_NAMES[t.category]
                      ? (lang === 'de' ? CATEGORY_NAMES[t.category].de : CATEGORY_NAMES[t.category].en)
                      : t.category

                    return (
                      <div
                        key={t.id}
                        className={`ledger-row ${sigs.length > 0 ? 'has-signals' : ''}`}
                        onClick={() => setSelectedTool(t)}
                      >
                        <div className="col-idx">
                          <span className="row-number">{String(t.number).padStart(2, '0')}</span>
                        </div>

                        <div className="col-entity">
                          <div className="entity-name-row">
                            <strong className="entity-title">{t.name}</strong>
                            {sigs.length > 0 && (
                              <span className="diff-count-indicator" title={`${sigs.length} verified diffs`}>
                                {sigs.length} {lang === 'de' ? 'Diffs' : 'Diffs'}
                              </span>
                            )}
                          </div>
                          <span className="entity-category">{catLabel}</span>
                        </div>

                        <div className="col-job">
                          <p className="job-text">{clean(tJob)}</p>
                        </div>

                        <div className="col-caveat">
                          <p className="caveat-text">{clean(tCaveat)}</p>
                        </div>

                        <div className="col-telemetry">
                          <span className="telemetry-chip">
                            {t.edition || 'Core 50'}
                          </span>
                        </div>

                        <div className="col-action" onClick={(e) => e.stopPropagation()}>
                          <button
                            className={`btn-row-bookmark ${saved.includes(t.id) ? 'active' : ''}`}
                            onClick={() => toggleSave(t.id)}
                            title={lang === 'de' ? 'Zu Mein Stack' : 'Save to My Stack'}
                          >
                            <Bookmark size={13} />
                          </button>
                          <button
                            className="btn-inspect-dossier"
                            onClick={() => setSelectedTool(t)}
                          >
                            {lang === 'de' ? 'Dossier →' : 'Dossier →'}
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* View Mode 2: Specimen Cells (Architectural Grid) */}
            {registryMode === 'specimen' && (
              <div className="specimen-grid">
                {filteredTools.map((t) => {
                  const sigs = toolSignalsMap.get(t.id.toLowerCase()) || []
                  const tJob = lang === 'en' && t.job_en ? t.job_en : t.job
                  const tCaveat = lang === 'en' && t.caveat_en ? t.caveat_en : t.caveat
                  const catLabel = CATEGORY_NAMES[t.category]
                    ? (lang === 'de' ? CATEGORY_NAMES[t.category].de : CATEGORY_NAMES[t.category].en)
                    : t.category

                  return (
                    <article
                      key={t.id}
                      className={`specimen-cell ${sigs.length > 0 ? 'has-signals' : ''}`}
                      onClick={() => setSelectedTool(t)}
                    >
                      <div className="cell-top-bar">
                        <span className="cell-index">{String(t.number).padStart(2, '0')}</span>
                        <span className="cell-category">{catLabel}</span>
                        <button
                          className={`cell-bookmark-btn ${saved.includes(t.id) ? 'active' : ''}`}
                          onClick={(e) => {
                            e.stopPropagation()
                            toggleSave(t.id)
                          }}
                          aria-label="Bookmark tool"
                        >
                          <Bookmark size={13} />
                        </button>
                      </div>

                      <div className="cell-header">
                        <h3 className="cell-tool-name">
                          {t.name}
                          <span className="cell-arrow">→</span>
                        </h3>
                        <p className="cell-job-line">{clean(tJob)}</p>
                      </div>

                      <div className="cell-caveat-callout">
                        <span className="cell-caveat-label">
                          {lang === 'de' ? 'EHRLICHE GRENZE' : 'HONEST CAVEAT'}
                        </span>
                        <p>{clean(tCaveat)}</p>
                      </div>

                      <div className="cell-bottom-bar">
                        <span className="cell-edition">{t.edition || 'Core 50'}</span>
                        {sigs.length > 0 ? (
                          <span className="cell-signals-tag">
                            {sigs.length} {lang === 'de' ? 'Signale erfasst' : 'Signals active'}
                          </span>
                        ) : (
                          <span className="cell-quiescent">
                            {lang === 'de' ? 'Stabil' : 'Quiescent'}
                          </span>
                        )}
                      </div>
                    </article>
                  )
                })}
              </div>
            )}

            {filteredTools.length === 0 && view === 'stack' && (
              <div className="empty-stack-guide">
                <h3>{lang === 'de' ? 'Ihr Stack ist noch leer' : 'Your stack is currently empty'}</h3>
                <p>
                  {lang === 'de'
                    ? 'Klicken Sie im Register auf das Lesezeichen-Symbol, um Werkzeuge zu beobachten und deren Signale gesammelt zu filtern.'
                    : 'Click the bookmark icon on any tool to monitor its diffs and filter signals specifically for your stack.'}
                </p>
                <button className="btn-primary" onClick={() => setView('registry')}>
                  {lang === 'de' ? 'Zum Register (79 Werkzeuge)' : 'Explore Registry (79 Tools)'}
                </button>
              </div>
            )}

            {filteredTools.length === 0 && view === 'registry' && (
              <div className="empty-ledger-state">
                <p>
                  {lang === 'de'
                    ? 'Keine Werkzeuge für diese Suchkombination gefunden.'
                    : 'No tools match your active search criteria.'}
                </p>
                <button
                  className="btn-reset"
                  onClick={() => {
                    setQuery('')
                    setCategory('All')
                  }}
                >
                  {lang === 'de' ? 'Filter zurücksetzen' : 'Reset Search'}
                </button>
              </div>
            )}
          </>
        )}

        {/* VIEW 3: DISCOVERY RADAR */}
        {view === 'radar' && <DiscoveryRadar lang={lang} />}

        {/* Editorial Protocol Contract Accordion */}
        <section className="editorial-contract-section">
          <div className="contract-header">
            <span className="section-eyebrow">
              {lang === 'de' ? 'DAS EVIDENZ-PROTOKOLL' : 'THE EVIDENCE PROTOCOL'}
            </span>
            <h2>{lang === 'de' ? 'Wie wir Signale von Hype trennen.' : 'How we separate signal from marketing noise.'}</h2>
          </div>

          <div className="contract-grid">
            <div className="contract-col">
              <span className="contract-tier p0">P0 · CRITICAL ARCHITECTURE</span>
              <h4>{lang === 'de' ? 'Kritische System-Verschiebungen' : 'Critical Architectural Shifts'}</h4>
              <p>
                {lang === 'de'
                  ? 'Session-Revocations, API-Deprecations, fundamentale Pricing-Anpassungen und Modell-Wechsel. Verifikation nur über offizielle Commits, GitHub Releases oder First-Party-Dokumentation.'
                  : 'Session revocations, API deprecations, radical pricing reallocations, and core model shifts. Verified exclusively via official commits, GitHub releases, or primary documentation.'}
              </p>
            </div>

            <div className="contract-col">
              <span className="contract-tier p1">P1 · CAPABILITY RELEASE</span>
              <h4>{lang === 'de' ? 'Wesentliche Produkterweiterungen' : 'Substantive Capability Releases'}</h4>
              <p>
                {lang === 'de'
                  ? 'Konkrete funktionale Erweiterungen wie Drag-and-Drop, neue Exportformate oder Team-Workspaces. Reines PR-Vokabular wird konsequent herausgefiltert.'
                  : 'Actionable functional enhancements like native drag-and-drop, export pipelines, or team workspaces. Filtered rigorously to eliminate marketing jargon.'}
              </p>
            </div>

            <div className="contract-col">
              <span className="contract-tier p2">P2 · NOISE QUARANTINE</span>
              <h4>{lang === 'de' ? 'Kosmetik & Marketing-Rauschen' : 'Cosmetic & Marketing Quarantine'}</h4>
              <p>
                {lang === 'de'
                  ? 'Visuelle Facelifts, Prompt-Vorlagen und ungeprüfte Verzeichnis-Listen. Verbleiben im Radar oder werden aus dem verifizierten Signal-Stream komplett ausgeschlossen.'
                  : 'Cosmetic button redesigns, prompt templates, and unvetted directory links. Quarantined on radar and blocked entirely from the verified signal stream.'}
              </p>
            </div>
          </div>
        </section>
      </main>

      {/* Slide-over Architectural Dossier Inspector Sheet */}
      {selectedTool && (
        <aside
          className="dossier-overlay-container"
          role="dialog"
          aria-modal="true"
          onClick={() => setSelectedTool(null)}
        >
          <div
            className="dossier-slide-sheet"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="dossier-sheet-header">
              <div className="sheet-header-left">
                <span className="dossier-num">№ {String(selectedTool.number).padStart(2, '0')}</span>
                <span className="dossier-edition-badge">{selectedTool.edition || 'Core 50'}</span>
                <span className="dossier-cat-badge">
                  {CATEGORY_NAMES[selectedTool.category]
                    ? (lang === 'de' ? CATEGORY_NAMES[selectedTool.category].de : CATEGORY_NAMES[selectedTool.category].en)
                    : selectedTool.category}
                </span>
              </div>

              <button
                className="btn-sheet-close"
                onClick={() => setSelectedTool(null)}
                aria-label="Close dossier"
              >
                <span>{lang === 'de' ? 'SCHLIESSEN [ESC]' : 'CLOSE [ESC]'}</span>
                <X size={14} />
              </button>
            </div>

            <div className="dossier-sheet-body">
              <div className="dossier-sheet-title-row">
                <h2 className="dossier-tool-title">{selectedTool.name}</h2>
                <div className="sheet-actions">
                  <a
                    href={selectedTool.url}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-open-site"
                  >
                    <span>{lang === 'de' ? 'Werkzeug öffnen' : 'Visit Website'}</span>
                    <ExternalLink size={12} />
                  </a>
                  <button
                    className={`btn-sheet-bookmark ${saved.includes(selectedTool.id) ? 'active' : ''}`}
                    onClick={() => toggleSave(selectedTool.id)}
                  >
                    <Bookmark size={13} />
                    <span>
                      {saved.includes(selectedTool.id)
                        ? (lang === 'de' ? 'In Mein Stack' : 'In My Stack')
                        : (lang === 'de' ? 'Zu Mein Stack' : 'Save to Stack')}
                    </span>
                  </button>
                </div>
              </div>

              {/* Swiss Telemetry Grid */}
              {selectedDossier && selectedDossier.axes && (
                <div className="axes-telemetry-block">
                  <span className="dossier-section-tag">
                    {lang === 'de' ? 'SYSTEM-TELEMETRIE & AUDIT-ACHSEN' : 'SYSTEM TELEMETRY & AUDIT AXES'}
                  </span>
                  <div className="axes-telemetry-grid">
                    {selectedDossier.axes.map((axis) => (
                      <div key={axis.label} className="axis-telemetry-cell">
                        <span className="axis-label">{axis.label}</span>
                        <strong className="axis-value">{axis.value}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* The Concrete Job */}
              <div className="dossier-section">
                <span className="dossier-section-tag">
                  {lang === 'de' ? 'DER KONKRETE EINSATZZWECK (5-MINUTEN-JOB)' : 'THE CONCRETE JOB (5-MINUTE LEVERAGE)'}
                </span>
                <p className="dossier-job-text">
                  {clean(lang === 'en' && selectedTool.job_en ? selectedTool.job_en : selectedTool.job)}
                </p>
              </div>

              {/* Editorial Verdict */}
              <div className="dossier-section">
                <span className="dossier-section-tag">
                  {lang === 'de' ? 'URTEIL & WARUM IM REGISTER' : 'EDITORIAL VERDICT & RATIONALE'}
                </span>
                <p className="dossier-verdict-text">
                  {clean(lang === 'en' && selectedTool.why_en ? selectedTool.why_en : selectedTool.why)}
                </p>
              </div>

              {/* Honest Caveat Callout (Warm Bronze Framed) */}
              <div className="dossier-caveat-section">
                <span className="dossier-caveat-tag">
                  {lang === 'de' ? 'EHRLICHE GRENZE (MANDATORY HONEST CAVEAT)' : 'HONEST CAVEAT & FAILURE MODES'}
                </span>
                <p className="dossier-caveat-text">
                  {clean(lang === 'en' && selectedTool.caveat_en ? selectedTool.caveat_en : selectedTool.caveat)}
                </p>
              </div>

              {/* Best For Scenarios */}
              {selectedDossier && (
                <div className="dossier-section">
                  <span className="dossier-section-tag">
                    {lang === 'de' ? 'GEPRÜFTE EINSATZGEBIETE' : 'VALIDATED WORKFLOW SCENARIOS'}
                  </span>
                  <ul className="dossier-bullets">
                    {(lang === 'en' && selectedDossier.bestFor_en
                      ? selectedDossier.bestFor_en
                      : (selectedDossier.bestFor_de || selectedDossier.bestFor || [])
                    ).map((item, i) => (
                      <li key={i}>{clean(item)}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Tool Specific Signals Wire */}
              <div className="dossier-section">
                <span className="dossier-section-tag">
                  {lang === 'de' ? 'VERIFIZIERTE CHANGELOG-DIFFS FÜR DIESES WERKZEUG' : 'VERIFIED CHANGELOG DIFFS FOR THIS TOOL'} ({selectedToolSignals.length})
                </span>

                {selectedToolSignals.length > 0 ? (
                  <div className="dossier-signals-list">
                    {selectedToolSignals.map((sig) => {
                      const sigTitle = lang === 'de' && sig.title_de ? sig.title_de : sig.title
                      const sigSummary = lang === 'de' && sig.summary_de ? sig.summary_de : sig.summary
                      const isP0 = sig.impact === 'high'

                      return (
                        <div key={sig.id} className="dossier-signal-card">
                          <div className="dossier-sig-meta">
                            <span className={`materiality-badge ${isP0 ? 'p0' : 'p1'}`}>
                              {isP0 ? 'P0 · CRITICAL' : 'P1 · UPDATE'}
                            </span>
                            <span className="time-badge">{formatRelativeTime(sig.ageHours, lang)}</span>
                          </div>
                          <h4 className="dossier-sig-title">{sigTitle}</h4>
                          <p className="dossier-sig-summary">{clean(sigSummary)}</p>
                          <div className="dossier-sig-sources">
                            {sig.sources.map((src) => (
                              <a
                                key={src.url}
                                href={src.url}
                                target="_blank"
                                rel="noreferrer"
                                className="source-evidence-link"
                              >
                                <span>{src.label}</span>
                                <ExternalLink size={10} />
                              </a>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <p className="quiescent-note">
                    {lang === 'de'
                      ? 'Keine kritischen P0/P1-Änderungen im aktuellen Überwachungsfenster registriert. Werkzeug läuft stabil.'
                      : 'No critical architectural shifts recorded in the current crawl window. Product state is quiescent.'}
                  </p>
                )}
              </div>
            </div>
          </div>
        </aside>
      )}
    </div>
  )
}
