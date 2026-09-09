import { useEffect, useMemo, useState, type ChangeEvent, type MouseEvent, type ReactNode } from 'react'
import {
  ArrowRight,
  Bookmark,
  Check,
  ChevronRight,
  Clock3,
  ExternalLink,
  Filter,
  GitBranch,
  History,
  Library,
  Radar,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react'
import tools from './data/tools.json'
import { signals, type Signal, type SignalImpact, type SignalKind } from './data/signals'

type Tool = (typeof tools)[number]
type View = 'feed' | 'watchlist' | 'library'
type ImpactFilter = 'all' | SignalImpact
type KindFilter = 'all' | SignalKind

const categoryMeta: Record<string, string> = {
  'UI / UX': 'UI / UX',
  Dev: 'Dev',
  'Dev Quality': 'Dev quality',
  'Daten & Quellenarbeit': 'Research',
  'Data / Research': 'Data & research',
  'Wissen & Operations': 'Knowledge',
  'Knowledge / Ops': 'Knowledge & ops',
  'Creative Production': 'Creative',
  'Lernen, Sprache & persönlicher Kontext': 'Learning',
  Productivity: 'Productivity',
}

const impactRank: Record<SignalImpact, number> = { high: 3, medium: 2, low: 1 }

function clean(text: string) {
  return text.replace(/\*\*/g, '').replace(/`/g, '')
}

function formatDate(date: string | number | Date) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  }).format(new Date(date))
}

function formatDay(date: string | number | Date) {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(new Date(date))
}

function relativeTime(iso: string) {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime())
  const hours = Math.floor(diff / 3_600_000)
  if (hours < 1) return 'now'
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 8) return `${days}d ago`
  return formatDate(iso)
}

function legacyWatchlist(): string[] {
  try {
    const current = JSON.parse(localStorage.getItem('shouldknow-watchlist') || '[]')
    if (Array.isArray(current) && current.length) return current.filter((item): item is string => typeof item === 'string')

    const legacy = JSON.parse(localStorage.getItem('shouldknow-saved') || '[]')
    if (!Array.isArray(legacy)) return []
    return legacy
      .map((id) => tools.find((tool) => tool.id === id)?.name)
      .filter((name): name is string => Boolean(name))
  } catch {
    return []
  }
}

function firstPartyEvidence(tool: Tool) {
  try {
    const productHost = new URL(tool.url).hostname.replace(/^www\./, '')
    const evidenceHost = new URL(tool.evidenceUrl).hostname.replace(/^www\./, '')
    return evidenceHost === productHost || evidenceHost.endsWith(`.${productHost}`)
  } catch {
    return false
  }
}

function App() {
  const [view, setView] = useState<View>('feed')
  const [watchlist, setWatchlist] = useState<string[]>(legacyWatchlist)
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null)
  const [impact, setImpact] = useState<ImpactFilter>('all')
  const [kind, setKind] = useState<KindFilter>('all')
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('All')
  const [lastVisit] = useState<number>(() => Number(localStorage.getItem('shouldknow-last-visit') || 0))

  useEffect(() => {
    localStorage.setItem('shouldknow-watchlist', JSON.stringify(watchlist))
  }, [watchlist])

  useEffect(() => {
    localStorage.setItem('shouldknow-last-visit', String(Date.now()))
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelectedProduct(null)
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setView('library')
        window.setTimeout(() => document.querySelector<HTMLInputElement>('#library-search')?.focus(), 0)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const sinceLastVisit = useMemo(
    () => (lastVisit ? signals.filter((signal) => new Date(signal.publishedAt).getTime() > lastVisit).length : 0),
    [lastVisit],
  )

  const filteredSignals = useMemo(() => {
    return [...signals]
      .filter((signal) => impact === 'all' || signal.impact === impact)
      .filter((signal) => kind === 'all' || signal.kind === kind)
      .sort((a, b) => {
        const rank = impactRank[b.impact] - impactRank[a.impact]
        if (rank) return rank
        return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
      })
  }, [impact, kind])

  const watchedSignals = useMemo(
    () => signals.filter((signal) => watchlist.includes(signal.product)),
    [watchlist],
  )

  const categories = useMemo(() => [...new Set(tools.map((tool) => tool.category))], [])
  const visibleTools = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return tools
      .filter((tool) => category === 'All' || tool.category === category)
      .filter((tool) => !needle || [tool.name, tool.job, tool.why, tool.category].join(' ').toLowerCase().includes(needle))
  }, [query, category])

  const toggleWatch = (product: string) => {
    setWatchlist((items) => (items.includes(product) ? items.filter((item) => item !== product) : [...items, product]))
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => setView('feed')} aria-label="Should Know home">
          <span className="brand-mark">SK</span>
          <span className="brand-type">should know</span>
        </button>
        <nav className="main-nav" aria-label="Primary navigation">
          <NavButton active={view === 'feed'} onClick={() => setView('feed')} icon={<Radar size={15} />}>Today</NavButton>
          <NavButton active={view === 'watchlist'} onClick={() => setView('watchlist')} icon={<Bookmark size={15} />}>Watchlist <b>{watchlist.length}</b></NavButton>
          <NavButton active={view === 'library'} onClick={() => setView('library')} icon={<Library size={15} />}>Library</NavButton>
        </nav>
        <div className="top-meta"><span className="live-dot" /> initial verified feed</div>
      </header>

      <main>
        {view === 'feed' && (
          <FeedView
            filteredSignals={filteredSignals}
            impact={impact}
            kind={kind}
            setImpact={setImpact}
            setKind={setKind}
            watchlist={watchlist}
            onToggleWatch={toggleWatch}
            onOpen={setSelectedProduct}
            sinceLastVisit={sinceLastVisit}
          />
        )}

        {view === 'watchlist' && (
          <WatchlistView
            watchlist={watchlist}
            watchedSignals={watchedSignals}
            onToggleWatch={toggleWatch}
            onOpen={setSelectedProduct}
            onBrowse={() => setView('library')}
          />
        )}

        {view === 'library' && (
          <LibraryView
            query={query}
            setQuery={setQuery}
            category={category}
            setCategory={setCategory}
            categories={categories}
            visibleTools={visibleTools}
            watchlist={watchlist}
            onToggleWatch={toggleWatch}
            onOpen={setSelectedProduct}
          />
        )}
      </main>

      <footer className="footer">
        <div><strong>Should Know</strong><span>Signal over volume.</span></div>
        <p>Changes are published with first-party evidence. The continuous scanner is the next activation step; this branch ships the product surface with a verified seed feed.</p>
        <a href="https://github.com/igoingtodevx/shouldknow-ai" target="_blank" rel="noreferrer"><GitBranch size={15} /> Source</a>
      </footer>

      {selectedProduct && (
        <Dossier
          product={selectedProduct}
          watched={watchlist.includes(selectedProduct)}
          onToggleWatch={() => toggleWatch(selectedProduct)}
          onClose={() => setSelectedProduct(null)}
        />
      )}
    </div>
  )
}

function NavButton({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: ReactNode; children: ReactNode }) {
  return <button className={active ? 'nav-button active' : 'nav-button'} onClick={onClick}>{icon}{children}</button>
}

function FeedView({
  filteredSignals,
  impact,
  kind,
  setImpact,
  setKind,
  watchlist,
  onToggleWatch,
  onOpen,
  sinceLastVisit,
}: {
  filteredSignals: Signal[]
  impact: ImpactFilter
  kind: KindFilter
  setImpact: (impact: ImpactFilter) => void
  setKind: (kind: KindFilter) => void
  watchlist: string[]
  onToggleWatch: (product: string) => void
  onOpen: (product: string) => void
  sinceLastVisit: number
}) {
  const highImpact = signals.filter((signal) => signal.impact === 'high').length
  const upcoming = signals.filter((signal) => signal.effectiveAt && new Date(signal.effectiveAt).getTime() > Date.now()).length

  return (
    <>
      <section className="desk-hero">
        <div className="hero-kicker"><span>{formatDay(Date.now())}</span><i />INTELLIGENCE DESK</div>
        <div className="hero-grid">
          <div>
            <h1>Know what changed.<br /><em>Know what matters.</em></h1>
            <p>Product changes, breaking shifts and new capabilities filtered for consequence — with the source attached.</p>
          </div>
          <aside className="desk-stats" aria-label="Feed summary">
            <Metric value={String(signals.length)} label="verified changes" />
            <Metric value={String(highImpact)} label="high impact" />
            <Metric value={String(upcoming)} label="upcoming deadlines" />
          </aside>
        </div>
        <div className="feed-state">
          <ShieldCheck size={17} />
          <span><strong>Seed feed:</strong> every item below is backed by a first-party source. Continuous discovery and snapshot diffing are not connected yet.</span>
        </div>
        {sinceLastVisit > 0 && <div className="since-strip"><History size={16} /><strong>{sinceLastVisit}</strong> verified changes were published since your last visit.</div>}
      </section>

      <section className="signal-section">
        <div className="section-head">
          <div><span className="section-label">WHAT PASSED THE FILTER</span><h2>{filteredSignals.length} changes worth opening</h2></div>
          <div className="filters"><Filter size={15} /><Select value={impact} onChange={(value) => setImpact(value as ImpactFilter)} options={['all', 'high', 'medium', 'low']} /><Select value={kind} onChange={(value) => setKind(value as KindFilter)} options={['all', 'breaking', 'policy', 'model', 'integration', 'feature', 'pricing']} /></div>
        </div>
        <div className="signal-list">
          {filteredSignals.map((signal, index) => (
            <SignalRow
              key={signal.id}
              signal={signal}
              index={index + 1}
              watched={watchlist.includes(signal.product)}
              onToggleWatch={() => onToggleWatch(signal.product)}
              onOpen={() => onOpen(signal.product)}
            />
          ))}
        </div>
      </section>

      <section className="method-strip">
        <div><span>01</span><strong>Discover</strong><p>Search and source monitors identify possible changes.</p></div>
        <div><span>02</span><strong>Verify</strong><p>First-party docs, changelogs and pricing pages are the evidence layer.</p></div>
        <div><span>03</span><strong>Filter</strong><p>Material changes survive. Cosmetic release noise does not.</p></div>
        <div><span>04</span><strong>Remember</strong><p>Your watchlist turns a broad market into a personal change feed.</p></div>
      </section>
    </>
  )
}

function Metric({ value, label }: { value: string; label: string }) {
  return <div className="metric"><strong>{value}</strong><span>{label}</span></div>
}

function Select({ value, onChange, options }: { value: string; onChange: (value: string) => void; options: string[] }) {
  return <label className="compact-select"><span className="sr-only">Filter</span><select value={value} onChange={(event: ChangeEvent<HTMLSelectElement>) => onChange(event.target.value)}>{options.map((option) => <option key={option} value={option}>{option === 'all' ? 'All' : option}</option>)}</select></label>
}

function SignalRow({ signal, index, watched, onToggleWatch, onOpen }: { signal: Signal; index: number; watched: boolean; onToggleWatch: () => void; onOpen: () => void }) {
  return (
    <article className={`signal-row impact-${signal.impact}`}>
      <div className="signal-number">{String(index).padStart(2, '0')}</div>
      <div className="signal-main">
        <div className="signal-meta">
          <span className={`impact-pill ${signal.impact}`}>{signal.impact} impact</span>
          <span>{signal.kind}</span>
          <span>{relativeTime(signal.publishedAt)}</span>
          {signal.effectiveAt && <span className="deadline"><Clock3 size={12} /> effective {formatDate(signal.effectiveAt)}</span>}
        </div>
        <button className="signal-title" onClick={onOpen}><small>{signal.product}</small><strong>{signal.title}</strong></button>
        <p>{signal.summary}</p>
        <div className="why"><span>WHY IT MATTERS</span><p>{signal.whyItMatters}</p></div>
        {signal.action && <div className="action-note"><strong>Action:</strong> {signal.action}</div>}
        <div className="signal-sources">
          <ShieldCheck size={14} />
          {signal.sources.map((source) => <a key={source.url} href={source.url} target="_blank" rel="noreferrer">{source.label}<ExternalLink size={12} /></a>)}
        </div>
      </div>
      <div className="signal-actions">
        <button className={watched ? 'watch-button active' : 'watch-button'} onClick={onToggleWatch} aria-label={`${watched ? 'Remove' : 'Add'} ${signal.product} ${watched ? 'from' : 'to'} watchlist`}><Bookmark size={17} fill={watched ? 'currentColor' : 'none'} /></button>
        <button className="open-button" onClick={onOpen} aria-label={`Open ${signal.product} dossier`}><ChevronRight size={18} /></button>
      </div>
    </article>
  )
}

function WatchlistView({ watchlist, watchedSignals, onToggleWatch, onOpen, onBrowse }: { watchlist: string[]; watchedSignals: Signal[]; onToggleWatch: (product: string) => void; onOpen: (product: string) => void; onBrowse: () => void }) {
  return (
    <section className="page-section watchlist-page">
      <div className="page-heading"><span className="section-label">YOUR STACK</span><h1>Only changes to things you care about.</h1><p>Stored in this browser. No account required.</p></div>
      {!watchlist.length ? (
        <div className="empty-state"><Bookmark size={26} /><h2>Your watchlist is empty.</h2><p>Add products from the signal feed or the library. When the live scanner is connected, this becomes your personal change ledger.</p><button onClick={onBrowse}>Browse the library <ArrowRight size={15} /></button></div>
      ) : (
        <>
          <div className="watch-products">{watchlist.map((product) => <button key={product} onClick={() => onOpen(product)}><span>{product}</span><small>{signals.filter((signal) => signal.product === product).length} captured changes</small><ChevronRight size={16} /></button>)}</div>
          <div className="watch-feed"><div className="section-head"><div><span className="section-label">MATCHING SIGNALS</span><h2>{watchedSignals.length || 'No'} verified changes captured</h2></div></div>{watchedSignals.length ? watchedSignals.map((signal, index) => <SignalRow key={signal.id} signal={signal} index={index + 1} watched onToggleWatch={() => onToggleWatch(signal.product)} onOpen={() => onOpen(signal.product)} />) : <p className="quiet-note">No current seed-feed signal matches your saved products yet. The dossier still keeps their baseline context.</p>}</div>
        </>
      )}
    </section>
  )
}

function LibraryView({ query, setQuery, category, setCategory, categories, visibleTools, watchlist, onToggleWatch, onOpen }: { query: string; setQuery: (query: string) => void; category: string; setCategory: (category: string) => void; categories: string[]; visibleTools: Tool[]; watchlist: string[]; onToggleWatch: (product: string) => void; onOpen: (product: string) => void }) {
  return (
    <section className="page-section library-page">
      <div className="page-heading library-heading"><div><span className="section-label">BASELINE LIBRARY</span><h1>The old catalog becomes the watchset.</h1><p>Seventy existing entries remain useful as discovery seeds, but numerical 9.x scores are no longer presented as objective truth.</p></div><div className="library-count"><strong>{tools.length}</strong><span>baseline products</span></div></div>
      <div className="library-controls">
        <label className="library-search"><Search size={17} /><input id="library-search" value={query} onChange={(event: ChangeEvent<HTMLInputElement>) => setQuery(event.target.value)} placeholder="Search a product, job or workflow…" /><kbd>⌘K</kbd></label>
        <div className="category-tabs"><button className={category === 'All' ? 'active' : ''} onClick={() => setCategory('All')}>All</button>{categories.map((item) => <button key={item} className={category === item ? 'active' : ''} onClick={() => setCategory(item)}>{categoryMeta[item] || item}</button>)}</div>
      </div>
      <div className="library-grid">{visibleTools.map((tool) => <ToolCard key={tool.id} tool={tool} watched={watchlist.includes(tool.name)} onToggleWatch={() => onToggleWatch(tool.name)} onOpen={() => onOpen(tool.name)} />)}</div>
      {!visibleTools.length && <div className="empty-state compact"><Search size={22} /><h2>No match.</h2><button onClick={() => { setQuery(''); setCategory('All') }}>Clear filters</button></div>}
    </section>
  )
}

function ToolCard({ tool, watched, onToggleWatch, onOpen }: { tool: Tool; watched: boolean; onToggleWatch: () => void; onOpen: () => void }) {
  return (
    <article className="tool-card">
      <div className="tool-card-top"><span>{categoryMeta[tool.category] || tool.category}</span><button className={watched ? 'watch-button active' : 'watch-button'} onClick={onToggleWatch} aria-label={`${watched ? 'Remove' : 'Add'} ${tool.name} ${watched ? 'from' : 'to'} watchlist`}><Bookmark size={16} fill={watched ? 'currentColor' : 'none'} /></button></div>
      <button className="tool-card-title" onClick={onOpen}>{tool.name}</button>
      <p className="tool-job">{clean(tool.job)}</p>
      <p className="tool-why">{clean(tool.why)}</p>
      <div className="tool-card-bottom"><button onClick={onOpen}>Open dossier <ArrowRight size={14} /></button><a href={tool.url} target="_blank" rel="noreferrer">Product <ExternalLink size={13} /></a></div>
    </article>
  )
}

function Dossier({ product, watched, onToggleWatch, onClose }: { product: string; watched: boolean; onToggleWatch: () => void; onClose: () => void }) {
  const tool = tools.find((item) => item.name.toLowerCase() === product.toLowerCase())
  const history = signals.filter((signal) => signal.product.toLowerCase() === product.toLowerCase()).sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
  const latest = history[0]
  const sourceMap = new Map<string, { label: string; url: string; firstParty: boolean }>()
  history.flatMap((signal) => signal.sources).forEach((source) => sourceMap.set(source.url, source))
  if (tool) sourceMap.set(tool.evidenceUrl, { label: 'Catalog evidence', url: tool.evidenceUrl, firstParty: firstPartyEvidence(tool) })
  const sourceList = [...sourceMap.values()]

  return (
    <div className="dossier-backdrop" role="presentation" onMouseDown={onClose}>
      <aside className="dossier" role="dialog" aria-modal="true" aria-labelledby="dossier-title" onMouseDown={(event: MouseEvent<HTMLElement>) => event.stopPropagation()}>
        <div className="dossier-top"><div><span className="section-label">LIVING DOSSIER</span><h2 id="dossier-title">{product}</h2></div><button className="close-button" onClick={onClose} aria-label="Close dossier"><X size={19} /></button></div>
        <div className="dossier-actions"><button className={watched ? 'primary-action active' : 'primary-action'} onClick={onToggleWatch}>{watched ? <Check size={15} /> : <Bookmark size={15} />}{watched ? 'Watching' : 'Add to watchlist'}</button>{tool && <a href={tool.url} target="_blank" rel="noreferrer">Visit product <ExternalLink size={14} /></a>}</div>

        <section className="dossier-block dossier-status"><span>CURRENT STATE</span><div className="status-grid"><div><small>Captured changes</small><strong>{history.length}</strong></div><div><small>Latest impact</small><strong>{latest?.impact || '—'}</strong></div><div><small>Last verified</small><strong>{latest ? formatDate(latest.publishedAt) : 'Baseline only'}</strong></div><div><small>Sources</small><strong>{sourceList.length}</strong></div></div></section>

        {tool && <section className="dossier-block"><span>BASELINE JOB</span><h3>{clean(tool.job)}</h3><p>{clean(tool.why)}</p><div className="caveat"><strong>Keep in mind</strong><p>{clean(tool.caveat)}</p></div></section>}

        <section className="dossier-block"><span>CHANGE HISTORY</span>{history.length ? <div className="timeline">{history.map((signal) => <article key={signal.id}><div className="timeline-marker" /><div><div className="signal-meta"><span className={`impact-pill ${signal.impact}`}>{signal.impact}</span><span>{signal.kind}</span><span>{formatDate(signal.publishedAt)}</span></div><h3>{signal.title}</h3><p>{signal.summary}</p>{signal.action && <div className="action-note"><strong>Action:</strong> {signal.action}</div>}</div></article>)}</div> : <div className="quiet-note">No verified change has been captured for this product in the initial feed yet. The live intelligence worker will append source-backed events here rather than overwriting the baseline.</div>}</section>

        <section className="dossier-block"><span>EVIDENCE</span>{sourceList.length ? <div className="source-list">{sourceList.map((source) => <a key={source.url} href={source.url} target="_blank" rel="noreferrer"><ShieldCheck size={14} /><span><strong>{source.label}</strong><small>{source.firstParty ? 'First-party source' : 'Evidence link'}</small></span><ExternalLink size={13} /></a>)}</div> : <p className="quiet-note">No evidence source has been attached yet.</p>}</section>
      </aside>
    </div>
  )
}

export default App
