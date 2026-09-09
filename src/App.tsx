import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, Bookmark, Check, Clock3, ExternalLink, Filter, GitBranch, Search, ShieldCheck, Sparkles, X } from 'lucide-react'
import tools from './data/tools.json'
import signals from './data/signals.json'
import dossiers from './data/dossiers.json'

type Signal = (typeof signals)[number]
type Dossier = (typeof dossiers)[number]
type View = 'today' | 'week' | 'watchlist' | 'tools'

const impactLabel: Record<string, string> = { high: 'HIGH IMPACT', medium: 'WORTH A LOOK', low: 'INFO' }
const kindLabel: Record<string, string> = { capability: 'CAPABILITY', pricing: 'PRICE', model: 'MODEL', api: 'API', policy: 'POLICY', launch: 'NEW' }

function loadList(key: string) {
  try { return JSON.parse(localStorage.getItem(key) || '[]') as string[] } catch { return [] }
}

function relativeHours(hours: number) {
  if (hours < 1) return '<1h'
  if (hours < 24) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}

export default function App() {
  const [view, setView] = useState<View>('today')
  const [query, setQuery] = useState('')
  const [watchlist, setWatchlist] = useState<string[]>(() => loadList('shouldknow-watchlist'))
  const [selected, setSelected] = useState<Dossier | null>(null)
  const [lastVisit, setLastVisit] = useState<number | null>(null)

  useEffect(() => {
    const previous = Number(localStorage.getItem('shouldknow-last-visit') || 0)
    if (previous) setLastVisit(previous)
    localStorage.setItem('shouldknow-last-visit', String(Date.now()))
  }, [])
  useEffect(() => localStorage.setItem('shouldknow-watchlist', JSON.stringify(watchlist)), [watchlist])

  const sinceCount = useMemo(() => {
    if (!lastVisit) return 0
    const elapsedHours = (Date.now() - lastVisit) / 3_600_000
    return signals.filter(signal => signal.ageHours <= elapsedHours).length
  }, [lastVisit])

  const filteredSignals = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return signals.filter(signal => {
      if (view === 'today' && signal.ageHours > 24) return false
      if (view === 'week' && signal.ageHours > 168) return false
      if (view === 'watchlist' && !watchlist.includes(signal.toolId)) return false
      if (needle && ![signal.tool, signal.title, signal.summary, signal.whyItMatters, signal.kind].join(' ').toLowerCase().includes(needle)) return false
      return true
    })
  }, [query, view, watchlist])

  const toggleWatch = (id: string) => setWatchlist(list => list.includes(id) ? list.filter(item => item !== id) : [...list, id])
  const openDossier = (toolId: string) => setSelected(dossiers.find(item => item.id === toolId) || null)

  return <div className="site-shell">
    <header className="topbar">
      <button className="brand" onClick={() => setView('today')}><span className="brand-mark">S</span><span>should <i>know</i></span></button>
      <nav>
        <button className={view === 'today' ? 'active' : ''} onClick={() => setView('today')}>Today</button>
        <button className={view === 'week' ? 'active' : ''} onClick={() => setView('week')}>This week</button>
        <button className={view === 'watchlist' ? 'active' : ''} onClick={() => setView('watchlist')}>My stack <b>{watchlist.length}</b></button>
        <button className={view === 'tools' ? 'active' : ''} onClick={() => setView('tools')}>Tools</button>
      </nav>
    </header>

    <main>
      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow"><Sparkles size={15}/> SIGNAL, NOT INVENTORY</div>
          <h1>Know what changed.<br/><em>Know what matters.</em></h1>
          <p>Should Know tracks meaningful changes across AI products, filters the release-note noise and keeps the evidence attached.</p>
        </div>
        <aside className="signal-proof">
          <div className="proof-row"><span>PROTOTYPE DATASET</span><ShieldCheck size={18}/></div>
          <strong>{signals.filter(s => s.ageHours <= 24).length}</strong>
          <p>demo signals in the last 24h</p>
          <small>The live crawler is not connected yet. Every signal below is visibly marked as prototype evidence.</small>
        </aside>
      </section>

      {lastVisit && <section className="return-strip">
        <div><Clock3 size={17}/><span>Since your last visit</span></div>
        <strong>{sinceCount ? `${sinceCount} signal${sinceCount === 1 ? '' : 's'} landed` : 'You are caught up'}</strong>
        <button onClick={() => setView('week')}>Review changes <ArrowRight size={15}/></button>
      </section>}

      {view !== 'tools' ? <>
        <section className="feed-head">
          <div><span className="mini-label">{view === 'watchlist' ? 'YOUR STACK' : view === 'week' ? 'LAST 7 DAYS' : 'TODAY'}</span><h2>{view === 'watchlist' ? 'Changes that touch your tools.' : 'Changes worth your attention.'}</h2></div>
          <label className="search"><Search size={17}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search changes, tools, APIs..."/></label>
        </section>

        <section className="signal-feed">
          {filteredSignals.map((signal, index) => <article className="signal-row" key={signal.id}>
            <div className="signal-index">{String(index + 1).padStart(2, '0')}</div>
            <div className="signal-main">
              <div className="signal-meta"><span className={`impact ${signal.impact}`}>{impactLabel[signal.impact]}</span><span>{kindLabel[signal.kind] || signal.kind.toUpperCase()}</span><span>{relativeHours(signal.ageHours)}</span><span className="prototype">PROTOTYPE</span></div>
              <button className="signal-tool" onClick={() => openDossier(signal.toolId)}>{signal.tool}</button>
              <h3>{signal.title}</h3>
              <p>{signal.summary}</p>
              <div className="why"><b>Why it matters</b><span>{signal.whyItMatters}</span></div>
              <div className="sources">{signal.sources.map(source => <a key={source.url} href={source.url} target="_blank" rel="noreferrer">{source.label}<ExternalLink size={12}/></a>)}</div>
            </div>
            <button className={watchlist.includes(signal.toolId) ? 'watch active' : 'watch'} onClick={() => toggleWatch(signal.toolId)} aria-label={`Watch ${signal.tool}`}><Bookmark size={18} fill={watchlist.includes(signal.toolId) ? 'currentColor' : 'none'}/></button>
          </article>)}
          {!filteredSignals.length && <div className="empty"><Filter size={22}/><h3>No signals here yet.</h3><p>{view === 'watchlist' ? 'Add tools to My stack and their meaningful changes will collect here.' : 'Try a broader search.'}</p></div>}
        </section>
      </> : <ToolDirectory watchlist={watchlist} toggleWatch={toggleWatch} openDossier={openDossier}/>} 

      <section className="threshold">
        <span className="mini-label">THE EDITORIAL CONTRACT</span>
        <h2>Not everything that shipped.</h2>
        <div className="threshold-grid">
          <div><strong>P0</strong><b>Should know</b><p>Pricing, major capability, breaking API, shutdown, policy or genuinely new workflow.</p></div>
          <div><strong>P1</strong><b>Worth a look</b><p>Meaningful feature, integration, platform expansion or measurable workflow improvement.</p></div>
          <div><strong>P2</strong><b>Noise</b><p>Cosmetic polish, vague marketing, renames and low-signal release-note churn. Dropped.</p></div>
        </div>
      </section>
    </main>

    <footer><div className="brand"><span className="brand-mark">S</span><span>should <i>know</i></span></div><p>Evidence-first AI product intelligence. Prototype feed until the live crawler is connected.</p><a href="https://github.com/igoingtodevx/shouldknow-ai" target="_blank" rel="noreferrer"><GitBranch size={15}/> Source</a></footer>
    {selected && <DossierModal dossier={selected} watched={watchlist.includes(selected.id)} onWatch={() => toggleWatch(selected.id)} onClose={() => setSelected(null)}/>} 
  </div>
}

function ToolDirectory({ watchlist, toggleWatch, openDossier }: { watchlist: string[]; toggleWatch: (id: string) => void; openDossier: (id: string) => void }) {
  const dossierIds = new Set(dossiers.map(item => item.id))
  const visibleTools = tools.filter(tool => dossierIds.has(tool.id))
  return <section className="directory">
    <div className="feed-head"><div><span className="mini-label">LIVING DOSSIERS</span><h2>Know the tool before you adopt it.</h2></div><p className="directory-note">The legacy 70-tool catalog remains in the repository as seed material; V1 surfaces only dossiers with richer evidence structure.</p></div>
    <div className="dossier-grid">{visibleTools.map(tool => <article key={tool.id} className="dossier-card"><div><span>{tool.category}</span><button className={watchlist.includes(tool.id) ? 'watch active' : 'watch'} onClick={() => toggleWatch(tool.id)}><Bookmark size={17} fill={watchlist.includes(tool.id) ? 'currentColor' : 'none'}/></button></div><h3>{tool.name}</h3><p>{tool.job.replace(/\*\*/g, '')}</p><button onClick={() => openDossier(tool.id)}>Open dossier <ArrowRight size={15}/></button></article>)}</div>
  </section>
}

function DossierModal({ dossier, watched, onWatch, onClose }: { dossier: Dossier; watched: boolean; onWatch: () => void; onClose: () => void }) {
  const history = signals.filter(signal => signal.toolId === dossier.id)
  return <div className="modal-backdrop" onMouseDown={onClose}><article className="modal" role="dialog" aria-modal="true" onMouseDown={e => e.stopPropagation()}>
    <button className="modal-close" onClick={onClose} aria-label="Close"><X size={20}/></button>
    <div className="dossier-kicker">LIVING DOSSIER · SEED STATE</div>
    <div className="dossier-title"><div><h2>{dossier.name}</h2><p>{dossier.verdict}</p></div><button className={watched ? 'watch active' : 'watch'} onClick={onWatch}>{watched ? <Check size={16}/> : <Bookmark size={16}/>} {watched ? 'Watching' : 'Watch'}</button></div>
    <section className="axis-grid">{dossier.axes.map(axis => <div key={axis.label}><span>{axis.label}</span><strong>{axis.value}</strong></div>)}</section>
    <section className="dossier-section"><span>BEST FOR</span><ul>{dossier.bestFor.map(item => <li key={item}>{item}</li>)}</ul></section>
    <section className="dossier-section"><span>KEEP IN MIND</span><p>{dossier.caveat}</p></section>
    <section className="dossier-section"><span>WHAT CHANGED</span>{history.length ? history.map(signal => <div className="history" key={signal.id}><b>{impactLabel[signal.impact]}</b><span>{signal.title}</span><small>{relativeHours(signal.ageHours)}</small></div>) : <p>No prototype changes attached yet.</p>}</section>
    <div className="modal-actions"><a className="primary" href={dossier.url} target="_blank" rel="noreferrer">Official site <ExternalLink size={15}/></a><small>Last verification: seed data · live engine pending</small></div>
  </article></div>
}
