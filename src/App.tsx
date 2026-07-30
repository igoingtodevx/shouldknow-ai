import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, Bookmark, Check, ChevronDown, ExternalLink, GitBranch, Search, ShieldCheck, Shuffle, Sparkles, X } from 'lucide-react'
import tools from './data/tools.json'

type Tool = (typeof tools)[number]
type Sort = 'score' | 'name' | 'newest'

const categoryMeta: Record<string, { label: string; note: string }> = {
  'UI / UX': { label: 'UI / UX', note: 'Research, systems, accessibility & visual QA' },
  'Dev': { label: 'Dev', note: 'Review, security & engineering leverage' },
  'Dev Quality': { label: 'Dev quality', note: 'Tests, security and release confidence' },
  'Daten & Quellenarbeit': { label: 'Research', note: 'Evidence, papers & inspectable analysis' },
  'Data / Research': { label: 'Data & research', note: 'Notebooks, semantic layers & source work' },
  'Wissen & Operations': { label: 'Knowledge', note: 'Controlled assistants and operational workflows' },
  'Knowledge / Ops': { label: 'Knowledge & ops', note: 'Permission-aware company workflows' },
  'Creative Production': { label: 'Creative', note: 'Real production, not content lottery' },
  'Lernen, Sprache & persönlicher Kontext': { label: 'Learning', note: 'Practice, language & personal context' },
  'Productivity': { label: 'Productivity', note: 'Meetings, calendar and focused work' },
}

function clean(text: string) {
  return text.replace(/\*\*/g, '').replace(/`/g, '')
}

export default function App() {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('All')
  const [sort, setSort] = useState<Sort>('score')
  const [saved, setSaved] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('shouldknow-saved') || '[]') } catch { return [] }
  })
  const [selected, setSelected] = useState<Tool | null>(null)

  useEffect(() => localStorage.setItem('shouldknow-saved', JSON.stringify(saved)), [saved])

  const categories = useMemo(() => [...new Set(tools.map(t => t.category))], [])
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return [...tools]
      .filter(t => category === 'All' || t.category === category)
      .filter(t => !needle || [t.name, t.job, t.why, t.category].join(' ').toLowerCase().includes(needle))
      .sort((a, b) => sort === 'score' ? b.score - a.score : sort === 'name' ? a.name.localeCompare(b.name) : b.number - a.number)
  }, [query, category, sort])

  const toggleSaved = (id: string) => setSaved(list => list.includes(id) ? list.filter(x => x !== id) : [...list, id])
  const surprise = () => setSelected(tools[Math.floor(Math.random() * tools.length)])

  return <div className="site-shell">
    <header className="topbar">
      <a className="brand" href="#top" aria-label="Should Know home"><span className="brand-mark">S</span><span>should <i>know</i></span></a>
      <nav><a href="#discover">Discover</a><a href="#principles">Principles</a><button className="saved-link" onClick={() => { setCategory('All'); setQuery(''); window.scrollTo({ top: document.querySelector('#discover')?.getBoundingClientRect().top! + window.scrollY - 70, behavior: 'smooth' }) }}><Bookmark size={15} fill={saved.length ? 'currentColor' : 'none'} /> Saved <b>{saved.length}</b></button></nav>
    </header>

    <main id="top">
      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow"><Sparkles size={15} /> Curated AI assistance, not a tool directory</div>
          <h1>AI websites<br/><em>worth your time.</em></h1>
          <p>70 researched tools that improve a real workflow — design quality, source-backed research, code review, production and more.</p>
          <div className="hero-actions"><a className="primary" href="#discover">Explore the collection <ArrowRight size={17}/></a><button className="secondary" onClick={surprise}><Shuffle size={16}/> Surprise me</button></div>
        </div>
        <aside className="proof-card">
          <div className="proof-top"><span>THE STANDARD</span><ShieldCheck size={19}/></div>
          <p>Every tool gets one specific job, a real caveat and a source trail.</p>
          <div className="proof-grid"><div><strong>70</strong><small>curated tools</small></div><div><strong>10</strong><small>work categories</small></div><div><strong>100%</strong><small>official links</small></div></div>
        </aside>
      </section>

      <section id="principles" className="principles">
        <div><span className="mini-label">WHY THIS EXISTS</span><h2>Not another <em>AI tool list.</em></h2></div>
        <div className="principle-list"><p><span>01</span><b>Concrete jobs.</b> Every pick answers what you can get done in minutes.</p><p><span>02</span><b>Quality loops.</b> Real components, source evidence, tests and human review beat one-shot generation.</p><p><span>03</span><b>Honest caveats.</b> A useful recommendation includes where it can fail.</p></div>
      </section>

      <section id="discover" className="catalog">
        <div className="catalog-head"><div><span className="mini-label">THE COLLECTION</span><h2>Find the right <em>leverage.</em></h2></div><div className="result-count">{visible.length} <span>tools showing</span></div></div>
        <div className="controls">
          <label className="search"><Search size={18}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search a job, workflow or tool..."/><kbd>⌘ K</kbd></label>
          <label className="sort-select">Sort <select value={sort} onChange={e => setSort(e.target.value as Sort)}><option value="score">Highest score</option><option value="newest">Newest wave</option><option value="name">A–Z</option></select><ChevronDown size={15}/></label>
        </div>
        <div className="chips"><button className={category === 'All' ? 'active' : ''} onClick={() => setCategory('All')}>All <span>{tools.length}</span></button>{categories.map(c => <button key={c} className={category === c ? 'active' : ''} onClick={() => setCategory(c)}>{categoryMeta[c]?.label || c} <span>{tools.filter(t => t.category === c).length}</span></button>)}</div>
        <div className="tool-grid">
          {visible.map((tool) => <ToolCard key={tool.id} tool={tool} saved={saved.includes(tool.id)} onSave={() => toggleSaved(tool.id)} onOpen={() => setSelected(tool)} />)}
        </div>
        {!visible.length && <div className="empty"><Search size={24}/><h3>No match yet.</h3><p>Try a workflow like “accessibility”, “research” or “video”.</p><button onClick={() => { setQuery(''); setCategory('All') }}>Clear filters</button></div>}
      </section>
    </main>
    <footer><div className="brand"><span className="brand-mark">S</span><span>should <i>know</i></span></div><p>Curated from official product sources, research and quality signals.<br/>Editorial scores are not vendor claims.</p><a href="https://github.com/igoingtodevx/shouldknow-ai" target="_blank" rel="noreferrer"><GitBranch size={16}/> Source</a></footer>
    {selected && <ToolModal tool={selected} saved={saved.includes(selected.id)} onSave={() => toggleSaved(selected.id)} onClose={() => setSelected(null)} />}
  </div>
}

function ToolCard({ tool, saved, onSave, onOpen }: { tool: Tool; saved: boolean; onSave: () => void; onOpen: () => void }) {
  const meta = categoryMeta[tool.category]
  return <article className="tool-card">
    <div className="card-top"><div className="tag">{meta?.label || tool.category}</div><button className={saved ? 'save active' : 'save'} onClick={onSave} aria-label={`Save ${tool.name}`}><Bookmark size={17} fill={saved ? 'currentColor' : 'none'} /></button></div>
    <div className="tool-title"><h3>{tool.name}</h3><span>{tool.score.toFixed(1)}</span></div>
    <p className="job">{clean(tool.job)}</p>
    <p className="reason">{clean(tool.why)}</p>
    <div className="card-bottom"><button onClick={onOpen}>Why it matters <ArrowRight size={15}/></button><a href={tool.url} target="_blank" rel="noreferrer">Visit <ExternalLink size={14}/></a></div>
  </article>
}

function ToolModal({ tool, saved, onSave, onClose }: { tool: Tool; saved: boolean; onSave: () => void; onClose: () => void }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={onClose}><article className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" onMouseDown={e => e.stopPropagation()}><button className="modal-close" onClick={onClose} aria-label="Close"><X size={20}/></button><div className="tag">{categoryMeta[tool.category]?.label || tool.category}</div><div className="modal-title"><h2 id="modal-title">{tool.name}</h2><strong>{tool.score.toFixed(1)}<small>/10</small></strong></div><section><span>THE JOB</span><p>{clean(tool.job)}</p></section><section><span>WHY IT MADE THE CUT</span><p>{clean(tool.why)}</p></section><section className="caveat"><span>KEEP IN MIND</span><p>{clean(tool.caveat)}</p></section><div className="modal-actions"><a className="primary" href={tool.url} target="_blank" rel="noreferrer">Visit website <ExternalLink size={16}/></a><a className="evidence" href={tool.evidenceUrl} target="_blank" rel="noreferrer">Source trail <ArrowRight size={15}/></a><button className={saved ? 'bookmark active' : 'bookmark'} onClick={onSave}>{saved ? <Check size={16}/> : <Bookmark size={16}/>} {saved ? 'Saved' : 'Save pick'}</button></div></article></div>
}
