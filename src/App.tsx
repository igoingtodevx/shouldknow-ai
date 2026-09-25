import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowRight,
  ArrowUpRight,
  Bookmark,
  Check,
  ChevronRight,
  Clock3,
  ExternalLink,
  Search,
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
type SignalTimeframe = 'all' | 'today' | 'week'
type SignalImpact = 'all' | 'p0' | 'p1'
type ToolSort = 'number' | 'signals' | 'name'

const tools = rawTools as Tool[]
const dossiers = rawDossiers as Dossier[]
const prototypeSignals = prototypeSignalsRaw as Signal[]
const API_BASE = ((import.meta.env.VITE_INTELLIGENCE_API as string | undefined) || '').replace(/\/$/, '')

const dossiersMap = new Map<string, Dossier>()
for (const dossier of dossiers) {
  dossiersMap.set(dossier.id.toLowerCase(), dossier)
  dossiersMap.set(dossier.name.toLowerCase(), dossier)
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

function clean(text: string) {
  return (text || '').replace(/\*\*/g, '').replace(/`/g, '').trim()
}

function formatRelativeTime(hours: number, lang: Language) {
  if (hours < 1) return lang === 'de' ? '< 1 Std. her' : '< 1h ago'
  if (hours < 24) return lang === 'de' ? `vor ${hours} Std.` : `${hours}h ago`
  const days = Math.floor(hours / 24)
  return lang === 'de' ? `vor ${days} T.` : `${days}d ago`
}

function formatSignalDate(signal: Signal, lang: Language) {
  const value = signal.publishedAt || signal.detectedAt
  if (!value) return formatRelativeTime(signal.ageHours, lang)
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return formatRelativeTime(signal.ageHours, lang)
  return new Intl.DateTimeFormat(lang === 'de' ? 'de-DE' : 'en-US', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date)
}

function signalTitle(signal: Signal, lang: Language) {
  return lang === 'de' && signal.title_de ? signal.title_de : signal.title
}

function signalSummary(signal: Signal, lang: Language) {
  return lang === 'de' && signal.summary_de ? signal.summary_de : signal.summary
}

function signalConsequence(signal: Signal, lang: Language) {
  return lang === 'de' && signal.whyItMatters_de ? signal.whyItMatters_de : signal.whyItMatters
}

function categoryLabel(category: string, lang: Language) {
  return CATEGORY_NAMES[category] ? CATEGORY_NAMES[category][lang] : category
}

export default function App() {
  const [lang, setLang] = useState<Language>(() => {
    try {
      const stored = localStorage.getItem('shouldknow-lang')
      return stored === 'en' ? 'en' : 'de'
    } catch {
      return 'de'
    }
  })
  const [view, setView] = useState<View>('signals')
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('All')
  const [toolSort, setToolSort] = useState<ToolSort>('number')
  const [timeframe, setTimeframe] = useState<SignalTimeframe>('all')
  const [impactFilter, setImpactFilter] = useState<SignalImpact>('all')
  const [kindFilter, setKindFilter] = useState('all')
  const [stackOnlySignals, setStackOnlySignals] = useState(false)
  const [saved, setSaved] = useState<string[]>(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem('shouldknow-saved') || '[]')
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  })
  const [selectedTool, setSelectedTool] = useState<Tool | null>(null)
  const [lastVisit, setLastVisit] = useState<number | null>(null)
  const [liveSignals, setLiveSignals] = useState<Signal[]>(prototypeSignals)
  const [isLiveApi, setIsLiveApi] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    try {
      localStorage.setItem('shouldknow-lang', lang)
    } catch {
      // Local preferences are optional.
    }
  }, [lang])

  useEffect(() => {
    try {
      const previous = Number(localStorage.getItem('shouldknow-last-visit') || 0)
      if (previous) setLastVisit(previous)
      localStorage.setItem('shouldknow-last-visit', String(Date.now()))
    } catch {
      // Local visit memory is optional.
    }
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem('shouldknow-saved', JSON.stringify(saved))
    } catch {
      // Local bookmarks are optional.
    }
  }, [saved])

  useEffect(() => {
    if (!API_BASE) return
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 6000)

    fetch(`${API_BASE}/v1/signals?hours=${24 * 90}`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`API error ${response.status}`)
        return response.json()
      })
      .then((payload: unknown) => {
        if (Array.isArray(payload) && payload.length > 0) {
          setLiveSignals(payload as Signal[])
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

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        searchInputRef.current?.focus()
      }
      if (event.key === 'Escape') setSelectedTool(null)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const toolSignalsMap = useMemo(() => {
    const map = new Map<string, Signal[]>()
    for (const signal of liveSignals) {
      const keys = [signal.toolId, signal.tool].filter(Boolean).map((key) => key.toLowerCase())
      const current = map.get(keys[0]) || []
      current.push(signal)
      for (const key of keys) map.set(key, current)
    }
    return map
  }, [liveSignals])

  const categories = useMemo(() => {
    return Array.from(new Set(tools.map((tool) => tool.category).filter(Boolean))).sort()
  }, [])

  const kinds = useMemo(() => {
    return Array.from(new Set(liveSignals.map((signal) => signal.kind).filter(Boolean))).sort()
  }, [liveSignals])

  const filteredSignals = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return liveSignals.filter((signal) => {
      if (stackOnlySignals && !saved.includes(signal.toolId)) return false
      if (timeframe === 'today' && signal.ageHours > 24) return false
      if (timeframe === 'week' && signal.ageHours > 168) return false
      if (impactFilter === 'p0' && signal.impact !== 'high') return false
      if (impactFilter === 'p1' && signal.impact !== 'medium') return false
      if (kindFilter !== 'all' && signal.kind !== kindFilter) return false
      if (!needle) return true
      return [
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
        .includes(needle)
    })
  }, [impactFilter, kindFilter, liveSignals, query, saved, stackOnlySignals, timeframe])

  const filteredTools = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return tools
      .filter((tool) => {
        if (view === 'stack' && !saved.includes(tool.id)) return false
        if (category !== 'All' && tool.category !== category) return false
        if (!needle) return true
        return [
          tool.name,
          tool.job,
          tool.job_en || '',
          tool.why,
          tool.why_en || '',
          tool.category,
          tool.caveat,
          tool.caveat_en || '',
        ]
          .join(' ')
          .toLowerCase()
          .includes(needle)
      })
      .sort((a, b) => {
        if (toolSort === 'name') return a.name.localeCompare(b.name)
        if (toolSort === 'signals') {
          const signalCountA = toolSignalsMap.get(a.id.toLowerCase())?.length || 0
          const signalCountB = toolSignalsMap.get(b.id.toLowerCase())?.length || 0
          return signalCountB - signalCountA || a.number - b.number
        }
        return (a.number || 0) - (b.number || 0)
      })
  }, [category, query, saved, toolSignalsMap, toolSort, view])

  const featuredSignal = filteredSignals[0] || liveSignals[0] || null
  const selectedDossier = useMemo(() => {
    if (!selectedTool) return null
    return dossiersMap.get(selectedTool.id.toLowerCase()) || dossiersMap.get(selectedTool.name.toLowerCase()) || null
  }, [selectedTool])
  const selectedToolSignals = useMemo(() => {
    if (!selectedTool) return []
    return toolSignalsMap.get(selectedTool.id.toLowerCase()) || toolSignalsMap.get(selectedTool.name.toLowerCase()) || []
  }, [selectedTool, toolSignalsMap])

  const sinceCount = useMemo(() => {
    if (!lastVisit) return 0
    const elapsedHours = (Date.now() - lastVisit) / 3_600_000
    return liveSignals.filter((signal) => signal.ageHours <= elapsedHours).length
  }, [lastVisit, liveSignals])

  const toggleSave = (id: string) => {
    setSaved((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]))
  }

  const openToolModal = (toolIdOrName: string) => {
    const target =
      tools.find((tool) => tool.id.toLowerCase() === toolIdOrName.toLowerCase()) ||
      tools.find((tool) => tool.name.toLowerCase() === toolIdOrName.toLowerCase())
    if (target) setSelectedTool(target)
  }

  const goToView = (nextView: View, shouldScroll = true) => {
    setView(nextView)
    if (shouldScroll) window.setTimeout(() => document.getElementById('workspace')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30)
  }

  const resetFilters = () => {
    setQuery('')
    setCategory('All')
    setTimeframe('all')
    setImpactFilter('all')
    setKindFilter('all')
    setStackOnlySignals(false)
  }

  const workspaceTitle =
    view === 'signals'
      ? lang === 'de'
        ? 'Was sich verändert hat'
        : 'What changed'
      : view === 'registry'
        ? lang === 'de'
          ? 'Werkzeuge nach ihrem echten Job'
          : 'Tools by the job they do'
        : view === 'stack'
          ? lang === 'de'
            ? 'Dein beobachteter Stack'
            : 'Your watched stack'
          : lang === 'de'
            ? 'Was gerade auftaucht'
            : 'What is surfacing'

  const workspaceIntro =
    view === 'signals'
      ? lang === 'de'
        ? 'Nicht alles, was neu ist, ist wichtig. Hier landen nur Änderungen mit einem nachvollziehbaren Beleg und einer klaren Konsequenz.'
        : 'Not everything new is important. This is the short list of changes with a traceable source and a clear consequence.'
      : view === 'registry'
        ? lang === 'de'
          ? 'Eine Arbeitsliste statt einer Bestenliste: konkreter Einsatz, redaktionelle Einordnung, ehrliche Grenze.'
          : 'A working list, not a leaderboard: concrete job, editorial judgment, honest limitation.'
        : view === 'stack'
          ? lang === 'de'
            ? 'Speichere Werkzeuge, die du wirklich benutzt. So wird aus dem Feed ein persönlicher Frühwarnkanal.'
            : 'Save the tools you actually use. Your feed becomes a personal early-warning channel.'
          : lang === 'de'
            ? 'Radar ist ein Hinweis, kein Urteil. Kandidaten bleiben hier, bis ein First-Party-Beleg da ist.'
            : 'Radar is a lead, not a verdict. Candidates stay here until a first-party source exists.'

  return (
    <div className="app-shell">
      <header className="site-header">
        <div className="header-inner">
          <button className="wordmark" onClick={() => goToView('signals', false)} aria-label="Should Know home">
            <span className="wordmark-mark">S</span>
            <span className="wordmark-text">should <em>know</em></span>
          </button>

          <nav className="main-nav" aria-label="Primary navigation">
            <button className={view === 'signals' ? 'active' : ''} onClick={() => goToView('signals')}>
              {lang === 'de' ? 'Heute' : 'Today'} <span>{liveSignals.length}</span>
            </button>
            <button className={view === 'registry' ? 'active' : ''} onClick={() => goToView('registry')}>
              {lang === 'de' ? 'Werkzeuge' : 'Tools'} <span>{tools.length}</span>
            </button>
            <button className={view === 'radar' ? 'active' : ''} onClick={() => goToView('radar')}>
              Radar <span>55</span>
            </button>
            <button className={view === 'stack' ? 'active' : ''} onClick={() => goToView('stack')}>
              {lang === 'de' ? 'Merkliste' : 'Saved'} <span>{saved.length}</span>
            </button>
          </nav>

          <div className="header-tools">
            <button className="header-search-trigger" onClick={() => searchInputRef.current?.focus()}>
              <Search size={15} /> <span>{lang === 'de' ? 'Suchen' : 'Search'}</span> <kbd>⌘K</kbd>
            </button>
            <div className="language-toggle" role="group" aria-label="Language selector">
              <button className={lang === 'de' ? 'active' : ''} onClick={() => setLang('de')}>DE</button>
              <button className={lang === 'en' ? 'active' : ''} onClick={() => setLang('en')}>EN</button>
            </div>
          </div>
        </div>
      </header>

      <main>
        <section className="home-hero">
          <div className="hero-copy">
            <p className="eyebrow"><span className="eyebrow-rule" /> Should Know / {lang === 'de' ? 'Verifizierte Änderungen' : 'Verified changes'}</p>
            <h1>
              {lang === 'de' ? (
                <>{liveSignals.length} geprüfte Änderungen.<br /><em>Was davon ändert deinen Job?</em></>
              ) : (
                <>{liveSignals.length} checked changes.<br /><em>Which one changes your work?</em></>
              )}
            </h1>
            <p className="hero-lede">
              {lang === 'de'
                ? 'Jede Änderung kommt mit einer zugänglichen Quelle, einer konkreten Konsequenz und einer ehrlichen Grenze.'
                : 'Every change comes with an accessible source, a concrete consequence, and an honest limit.'}
            </p>
            <div className="hero-actions">
              <button className="button button-primary" onClick={() => goToView('signals')}>
                {lang === 'de' ? 'Die heutigen Änderungen lesen' : "Read today's changes"} <ArrowRight size={16} />
              </button>
              <button className="text-button" onClick={() => goToView('registry')}>
                {lang === 'de' ? 'Werkzeuge durchsuchen' : 'Browse the tools'} <ChevronRight size={15} />
              </button>
            </div>
            <p className="hero-proof"><Check size={15} /> {lang === 'de' ? 'Jeder Eintrag: konkreter Job, ehrliche Grenze, Quelle.' : 'Every entry: a concrete job, an honest limit, a source.'}</p>
          </div>

          <div className="latest-brief" aria-label={lang === 'de' ? 'Letztes verifiziertes Signal' : 'Latest verified signal'}>
            <div className="brief-topline">
              <span>{lang === 'de' ? 'Letzte Änderung' : 'Latest change'}</span>
              <span className="brief-status"><span className="status-dot" /> {isLiveApi ? 'LIVE' : lang === 'de' ? 'SNAPSHOT' : 'SNAPSHOT'}</span>
            </div>
            {featuredSignal ? (
              <>
                <div className="brief-meta">
                  {featuredSignal.sources[0] ? <a className="brief-source" href={featuredSignal.sources[0].url} target="_blank" rel="noreferrer">{featuredSignal.sources[0].label}</a> : <span>{featuredSignal.tool}</span>}
                  <span><Clock3 size={13} /> {featuredSignal.publishedAt ? (lang === 'de' ? 'veröffentlicht ' : 'published ') : (lang === 'de' ? 'erfasst ' : 'captured ')}{formatSignalDate(featuredSignal, lang)}</span>
                </div>
                <h2>{signalTitle(featuredSignal, lang)}</h2>
                <p>{clean(signalSummary(featuredSignal, lang))}</p>
                <div className="brief-consequence">
                  <span>{lang === 'de' ? 'Warum es zählt' : 'Why it matters'}</span>
                  <strong>{clean(signalConsequence(featuredSignal, lang))}</strong>
                </div>
                <button className="brief-link" onClick={() => openToolModal(featuredSignal.toolId || featuredSignal.tool)}>
                  {lang === 'de' ? 'Beleg und Dossier öffnen' : 'Open evidence and dossier'} <ArrowUpRight size={16} />
                </button>
              </>
            ) : (
              <p>{lang === 'de' ? 'Noch keine Signale verfügbar.' : 'No signals available yet.'}</p>
            )}
          </div>
        </section>

        {sinceCount > 0 && (
          <aside className="return-note">
            <span className="return-note-mark" />
            <span><strong>{sinceCount}</strong> {lang === 'de' ? 'neue Signale seit deinem letzten Besuch.' : 'new signals since your last visit.'}</span>
            <button onClick={() => { setTimeframe('today'); goToView('signals') }}>{lang === 'de' ? 'Ansehen' : 'See them'} <ArrowRight size={14} /></button>
          </aside>
        )}

        <section className="workspace" id="workspace">
          <aside className="workspace-rail">
            <div className="rail-intro">
              <span className="rail-label">{lang === 'de' ? 'Hier anfangen' : 'Start here'}</span>
              <p>{lang === 'de' ? 'Starte mit einer Änderung. Öffne dann den Beleg, nicht nur die Behauptung.' : 'Start with a change. Open the evidence, not just the claim.'}</p>
            </div>
            <nav className="workspace-nav" aria-label="Workspace views">
              <button className={view === 'signals' ? 'active' : ''} onClick={() => setView('signals')}>{lang === 'de' ? 'Änderungen' : 'Changes'}<b>{liveSignals.length}</b></button>
              <button className={view === 'registry' ? 'active' : ''} onClick={() => setView('registry')}>{lang === 'de' ? 'Werkzeugliste' : 'Tool list'}<b>{tools.length}</b></button>
              <button className={view === 'radar' ? 'active' : ''} onClick={() => setView('radar')}>Radar<b>55</b></button>
              <button className={view === 'stack' ? 'active' : ''} onClick={() => setView('stack')}>{lang === 'de' ? 'Merkliste' : 'Saved'}<b>{saved.length}</b></button>
            </nav>
            <div className="rail-rule" />
            <button className="rail-protocol" onClick={() => document.getElementById('protocol')?.scrollIntoView({ behavior: 'smooth' })}>
              <span>{lang === 'de' ? 'Wie wir prüfen' : 'How we check'}</span><ArrowUpRight size={14} />
            </button>
          </aside>

          <div className="workspace-main">
            <div className="workspace-heading">
              <div>
                <p className="eyebrow">{view === 'radar' ? 'Radar' : lang === 'de' ? 'Aktuelle Änderungen' : 'Current changes'}</p>
                <h2>{workspaceTitle}</h2>
                <p>{workspaceIntro}</p>
              </div>
              {view !== 'radar' && <span className="result-count">{view === 'signals' ? filteredSignals.length : filteredTools.length} {lang === 'de' ? 'Treffer' : 'results'}</span>}
            </div>

            {view !== 'radar' && (
              <div className="workspace-controls">
                <label className="search-field">
                  <Search size={16} />
                  <input
                    ref={searchInputRef}
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder={view === 'signals' ? (lang === 'de' ? 'Signal, Werkzeug oder Konsequenz suchen' : 'Search a signal, tool, or consequence') : (lang === 'de' ? 'Werkzeug, Job oder Grenze suchen' : 'Search tool, job, or limitation')}
                    aria-label={lang === 'de' ? 'Arbeitsfläche durchsuchen' : 'Search workspace'}
                  />
                  {query && <button onClick={() => setQuery('')} aria-label={lang === 'de' ? 'Suche löschen' : 'Clear search'}><X size={15} /></button>}
                  <kbd>⌘K</kbd>
                </label>

                {view === 'signals' && (
                  <div className="control-row">
                    <div className="segmented-control" aria-label={lang === 'de' ? 'Zeitraum' : 'Timeframe'}>
                      <button className={timeframe === 'all' ? 'active' : ''} onClick={() => setTimeframe('all')}>{lang === 'de' ? 'Alle' : 'All'}</button>
                      <button className={timeframe === 'today' ? 'active' : ''} onClick={() => setTimeframe('today')}>{lang === 'de' ? '24 Std.' : '24h'}</button>
                      <button className={timeframe === 'week' ? 'active' : ''} onClick={() => setTimeframe('week')}>{lang === 'de' ? '7 Tage' : '7d'}</button>
                    </div>
                    <select value={impactFilter} onChange={(event) => setImpactFilter(event.target.value as SignalImpact)} aria-label={lang === 'de' ? 'Relevanz' : 'Impact'}>
                      <option value="all">{lang === 'de' ? 'Alle Relevanzen' : 'All impact'}</option>
                      <option value="p0">{lang === 'de' ? 'Hohe Auswirkung' : 'High impact'}</option>
                      <option value="p1">{lang === 'de' ? 'Fähigkeit' : 'Capability'}</option>
                    </select>
                    <select value={kindFilter} onChange={(event) => setKindFilter(event.target.value)} aria-label={lang === 'de' ? 'Signaltyp' : 'Signal type'}>
                      <option value="all">{lang === 'de' ? 'Alle Typen' : 'All types'}</option>
                      {kinds.map((kind) => <option key={kind} value={kind}>{kind}</option>)}
                    </select>
                    {saved.length > 0 && <button className={`control-toggle ${stackOnlySignals ? 'active' : ''}`} onClick={() => setStackOnlySignals((current) => !current)}><Bookmark size={14} /> {lang === 'de' ? 'Mein Stack' : 'My stack'}</button>}
                  </div>
                )}

                {(view === 'registry' || view === 'stack') && (
                  <div className="control-row">
                    <select value={category} onChange={(event) => setCategory(event.target.value)} aria-label={lang === 'de' ? 'Kategorie' : 'Category'}>
                      <option value="All">{lang === 'de' ? 'Alle Kategorien' : 'All categories'}</option>
                      {categories.map((item) => <option key={item} value={item}>{categoryLabel(item, lang)}</option>)}
                    </select>
                    <div className="segmented-control" aria-label={lang === 'de' ? 'Sortierung' : 'Sort'}>
                      <button className={toolSort === 'number' ? 'active' : ''} onClick={() => setToolSort('number')}>{lang === 'de' ? 'Index' : 'Index'}</button>
                      <button className={toolSort === 'signals' ? 'active' : ''} onClick={() => setToolSort('signals')}>{lang === 'de' ? 'Diffs' : 'Changes'}</button>
                      <button className={toolSort === 'name' ? 'active' : ''} onClick={() => setToolSort('name')}>A–Z</button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {view === 'signals' && (
              <div className="signal-list">
                {filteredSignals.map((signal, index) => {
                  const isCritical = signal.impact === 'high'
                  return (
                    <article className={`signal-card ${index === 0 ? 'featured' : ''}`} key={signal.id}>
                      <div className="signal-card-meta">
                        <span className={`signal-level ${isCritical ? 'critical' : 'capability'}`}>{isCritical ? (lang === 'de' ? 'Hohe Auswirkung' : 'High impact') : (lang === 'de' ? 'Fähigkeit' : 'Capability')}</span>
                        <button className="signal-tool" onClick={() => openToolModal(signal.toolId || signal.tool)}>{signal.tool} <ChevronRight size={14} /></button>
                        <span className="signal-kind">{signal.kind}</span>
                        <span className="signal-age"><Clock3 size={13} /> {formatRelativeTime(signal.ageHours, lang)}</span>
                      </div>
                      <div className="signal-card-body">
                        <div>
                          <h3>{signalTitle(signal, lang)}</h3>
                          <p className="signal-summary">{clean(signalSummary(signal, lang))}</p>
                        </div>
                        <div className="signal-why">
                          <span>{lang === 'de' ? 'Was du wissen musst' : 'What you need to know'}</span>
                          <p>{clean(signalConsequence(signal, lang))}</p>
                        </div>
                      </div>
                      <div className="signal-card-footer">
                        <div className="source-links">
                          {(signal.sources || []).map((source) => (
                            <a href={source.url} target="_blank" rel="noreferrer" key={`${signal.id}-${source.url}`}>
                              {source.label || (lang === 'de' ? 'Quelle' : 'Source')} <ExternalLink size={12} />
                            </a>
                          ))}
                        </div>
                        <div className="signal-card-actions">
                          <button className="text-action" onClick={() => openToolModal(signal.toolId || signal.tool)}>{lang === 'de' ? 'Dossier öffnen' : 'Open dossier'} <ArrowUpRight size={14} /></button>
                          <button className={`bookmark-action ${saved.includes(signal.toolId) ? 'active' : ''}`} onClick={() => toggleSave(signal.toolId)} aria-label={lang === 'de' ? 'Werkzeug merken' : 'Save tool'}><Bookmark size={17} /></button>
                        </div>
                      </div>
                    </article>
                  )
                })}
                {filteredSignals.length === 0 && (
                  <div className="empty-state"><h3>{lang === 'de' ? 'Kein Signal passt.' : 'No signal matches.'}</h3><p>{lang === 'de' ? 'Ändere die Filter oder starte wieder mit dem vollständigen Feed.' : 'Change the filters or return to the full feed.'}</p><button className="button button-secondary" onClick={resetFilters}>{lang === 'de' ? 'Filter zurücksetzen' : 'Reset filters'}</button></div>
                )}
              </div>
            )}

            {(view === 'registry' || view === 'stack') && (
              <div className="tool-grid">
                {filteredTools.map((tool) => {
                  const signalCount = toolSignalsMap.get(tool.id.toLowerCase())?.length || 0
                  const job = lang === 'en' && tool.job_en ? tool.job_en : tool.job
                  const caveat = lang === 'en' && tool.caveat_en ? tool.caveat_en : tool.caveat
                  return (
                    <article className="tool-card" key={tool.id} onClick={() => setSelectedTool(tool)}>
                      <div className="tool-card-top"><span>{categoryLabel(tool.category, lang)}</span><button className={`bookmark-action ${saved.includes(tool.id) ? 'active' : ''}`} onClick={(event) => { event.stopPropagation(); toggleSave(tool.id) }} aria-label={lang === 'de' ? 'Werkzeug merken' : 'Save tool'}><Bookmark size={16} /></button></div>
                      <h3>{tool.name}</h3>
                      <p className="tool-job">{clean(job)}</p>
                      <div className="tool-caveat"><span>{lang === 'de' ? 'Ehrliche Grenze' : 'Honest limit'}</span><p>{clean(caveat)}</p></div>
                      <div className="tool-card-bottom"><span>{tool.edition || 'Core 50'}</span><span>{signalCount > 0 ? `${signalCount} ${lang === 'de' ? 'aktuelle Diffs' : 'current changes'}` : (lang === 'de' ? 'stabil' : 'stable')}</span></div>
                    </article>
                  )
                })}
                {filteredTools.length === 0 && view === 'stack' && <div className="empty-state"><h3>{lang === 'de' ? 'Deine Merkliste ist leer.' : 'Your saved list is empty.'}</h3><p>{lang === 'de' ? 'Speichere ein Werkzeug, um seine Änderungen später gesammelt zu sehen.' : 'Save a tool to collect its changes in one place.'}</p><button className="button button-primary" onClick={() => goToView('registry')}>{lang === 'de' ? 'Werkzeuge ansehen' : 'Browse tools'} <ArrowRight size={15} /></button></div>}
                {filteredTools.length === 0 && view === 'registry' && <div className="empty-state"><h3>{lang === 'de' ? 'Keine Treffer.' : 'No matches.'}</h3><p>{lang === 'de' ? 'Versuche eine andere Suche oder Kategorie.' : 'Try another search or category.'}</p><button className="button button-secondary" onClick={resetFilters}>{lang === 'de' ? 'Filter zurücksetzen' : 'Reset filters'}</button></div>}
              </div>
            )}

            {view === 'radar' && <DiscoveryRadar lang={lang} />}
          </div>
        </section>

        <section className="protocol" id="protocol">
          <div className="protocol-heading"><p className="eyebrow">{lang === 'de' ? 'So entscheiden wir' : 'How we decide'}</p><h2>{lang === 'de' ? 'Ein Signal ist erst dann nützlich, wenn du weißt, was es für dich ändert.' : 'A signal is useful only when you know what it changes for you.'}</h2></div>
          <div className="protocol-steps">
            <div><span className="step-number">01</span><h3>{lang === 'de' ? 'Fund' : 'Find'}</h3><p>{lang === 'de' ? 'Offizielle Changelogs, Pricing-Seiten und Releases werden beobachtet.' : 'Official changelogs, pricing pages, and releases are monitored.'}</p></div>
            <div><span className="step-number">02</span><h3>{lang === 'de' ? 'Beleg' : 'Prove'}</h3><p>{lang === 'de' ? 'Ein Signal bleibt nur, wenn die Quelle direkt geöffnet werden kann.' : 'A signal stays only when its source can be opened directly.'}</p></div>
            <div><span className="step-number">03</span><h3>{lang === 'de' ? 'Einordnen' : 'Explain'}</h3><p>{lang === 'de' ? 'Wir schreiben dazu, wem es hilft — und wo das Werkzeug aufhört.' : 'We explain who it helps — and where the tool stops.'}</p></div>
          </div>
        </section>
      </main>

      {selectedTool && (
        <aside className="drawer-backdrop" role="dialog" aria-modal="true" aria-label={`${selectedTool.name} dossier`} onClick={() => setSelectedTool(null)}>
          <div className="dossier-drawer" onClick={(event) => event.stopPropagation()}>
            <div className="drawer-header"><div><p className="eyebrow">{lang === 'de' ? 'Werkzeug-Dossier' : 'Tool dossier'}</p><span className="drawer-number">{categoryLabel(selectedTool.category, lang)}</span></div><button className="drawer-close" onClick={() => setSelectedTool(null)} aria-label={lang === 'de' ? 'Dossier schließen' : 'Close dossier'}><X size={20} /></button></div>
            <div className="drawer-title-row"><h2>{selectedTool.name}</h2><button className={`bookmark-action ${saved.includes(selectedTool.id) ? 'active' : ''}`} onClick={() => toggleSave(selectedTool.id)} aria-label={lang === 'de' ? 'Werkzeug merken' : 'Save tool'}><Bookmark size={18} /></button></div>
            <p className="drawer-job">{lang === 'en' && selectedTool.job_en ? clean(selectedTool.job_en) : clean(selectedTool.job)}</p>
            <div className="drawer-actions"><a className="button button-primary" href={selectedTool.url} target="_blank" rel="noreferrer">{lang === 'de' ? 'Offizielle Seite' : 'Official site'} <ArrowUpRight size={15} /></a>{selectedTool.evidenceUrl && <a className="button button-secondary" href={selectedTool.evidenceUrl} target="_blank" rel="noreferrer">{lang === 'de' ? 'Quelle öffnen' : 'Open source'} <ExternalLink size={14} /></a>}</div>
            <section className="drawer-section"><span className="drawer-label">{lang === 'de' ? 'Einordnung' : 'Editorial take'}</span><p>{selectedDossier ? clean(lang === 'de' && selectedDossier.verdict_de ? selectedDossier.verdict_de : selectedDossier.verdict_en || selectedDossier.verdict) : clean(lang === 'en' && selectedTool.why_en ? selectedTool.why_en : selectedTool.why)}</p></section>
            <section className="drawer-caveat"><span>{lang === 'de' ? 'Ehrliche Grenze' : 'Honest limit'}</span><p>{clean(lang === 'en' && selectedTool.caveat_en ? selectedTool.caveat_en : selectedTool.caveat)}</p></section>
            {selectedDossier && selectedDossier.bestFor.length > 0 && <section className="drawer-section"><span className="drawer-label">{lang === 'de' ? 'Besonders sinnvoll für' : 'Best for'}</span><ul>{(lang === 'de' && selectedDossier.bestFor_de ? selectedDossier.bestFor_de : lang === 'en' && selectedDossier.bestFor_en ? selectedDossier.bestFor_en : selectedDossier.bestFor).map((item) => <li key={item}><Check size={14} /> {clean(item)}</li>)}</ul></section>}
            {selectedDossier && selectedDossier.axes.length > 0 && <section className="drawer-section"><span className="drawer-label">{lang === 'de' ? 'Arbeitsprofil' : 'Working profile'}</span><div className="axis-grid">{selectedDossier.axes.map((axis) => <div key={axis.label}><span>{axis.label}</span><strong>{axis.value}</strong></div>)}</div></section>}
            <section className="drawer-section"><span className="drawer-label">{lang === 'de' ? 'Verifizierte Änderungen' : 'Verified changes'}</span>{selectedToolSignals.length > 0 ? <div className="drawer-signals">{selectedToolSignals.map((signal) => <div className="drawer-signal" key={signal.id}><div><span className={`signal-level ${signal.impact === 'high' ? 'critical' : 'capability'}`}>{signal.impact === 'high' ? (lang === 'de' ? 'Hohe Auswirkung' : 'High impact') : (lang === 'de' ? 'Fähigkeit' : 'Capability')}</span><span>{formatRelativeTime(signal.ageHours, lang)}</span></div><h3>{signalTitle(signal, lang)}</h3><p>{clean(signalSummary(signal, lang))}</p><div className="source-links">{(signal.sources || []).map((source) => <a href={source.url} target="_blank" rel="noreferrer" key={`${signal.id}-${source.url}`}>{source.label || 'Source'} <ExternalLink size={11} /></a>)}</div></div>)}</div> : <p className="drawer-muted">{lang === 'de' ? 'Keine aktuelle Änderung in diesem Feed.' : 'No current change in this feed.'}</p>}</section>
          </div>
        </aside>
      )}
    </div>
  )
}
