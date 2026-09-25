import { useEffect, useMemo, useState } from 'react'
import { ExternalLink, Search, X } from 'lucide-react'
import bootstrapRaw from './data/discovery-seed.json'
import './discovery-radar.css'

type RadarSource = {
  name: string
  url: string
  candidateUrl?: string
}

type RadarItem = {
  id: string
  title: string
  sourceCount: number
  lastSeenAt: string
  sources: RadarSource[]
}

type RadarMode = 'live' | 'snapshot'

const bootstrap = bootstrapRaw as RadarItem[]
const API_BASE = ((import.meta.env.VITE_INTELLIGENCE_API as string | undefined) || '').replace(/\/$/, '')

function sourceSummary(item: RadarItem) {
  if (item.sourceCount > 1) return `Spotted across ${item.sourceCount} discovery sources`
  return `Spotted on ${item.sources[0]?.name || 'an AI directory'}`
}

export default function DiscoveryRadar() {
  const [items, setItems] = useState<RadarItem[]>(bootstrap)
  const [mode, setMode] = useState<RadarMode>('snapshot')
  const [query, setQuery] = useState('')
  const [sourceFilter, setSourceFilter] = useState('All')

  useEffect(() => {
    if (!API_BASE) return
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 6000)
    fetch(`${API_BASE}/v1/discovery?limit=100`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`Discovery API returned ${response.status}`)
        return response.json()
      })
      .then((payload: unknown) => {
        if (!Array.isArray(payload)) throw new Error('Discovery API returned an invalid payload')
        if (payload.length > 0) {
          setItems(payload as RadarItem[])
          setMode('live')
        }
      })
      .catch(() => undefined)
      .finally(() => window.clearTimeout(timeout))
    return () => {
      window.clearTimeout(timeout)
      controller.abort()
    }
  }, [])

  const sourcesList = useMemo(() => {
    const set = new Set<string>()
    for (const item of items) {
      for (const s of item.sources) {
        if (s.name) {
          const cleanName = s.name.replace(/\s*\(.*\)/, '').trim()
          set.add(cleanName)
        }
      }
    }
    return Array.from(set).sort()
  }, [items])

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase()
    return items.filter((item) => {
      if (sourceFilter !== 'All') {
        const hasSource = item.sources.some((s) => s.name.toLowerCase().includes(sourceFilter.toLowerCase()))
        if (!hasSource) return false
      }
      if (q) {
        const haystack = [item.title, ...item.sources.map((s) => s.name)].join(' ').toLowerCase()
        if (!haystack.includes(q)) return false
      }
      return true
    })
  }, [items, query, sourceFilter])

  return (
    <section className="discovery-radar-section" aria-labelledby="discovery-radar-heading">
      <div className="radar-header-block">
        <div className="radar-title-group">
          <span className="section-eyebrow">ECOSYSTEM RADAR</span>
          <h2 id="discovery-radar-heading" className="radar-main-title">
            What is surfacing across the AI landscape.
          </h2>
          <p className="radar-explanation">
            Directories are radar, not evidence. This stream monitors 55+ unvetted candidates spotted across Product Hunt, Futurepedia, and Toolify. Tools stay in this radar quarantine until they pass first-party verification and editorial review.
          </p>
        </div>

        <div className="radar-status-badge">
          <span className="status-mode">{mode === 'live' ? 'LIVE RADAR PIPELINE' : 'CACHED SEED'}</span>
          <span className="status-count">{filteredItems.length} of {items.length} candidates tracked</span>
        </div>
      </div>

      {/* Radar Controls */}
      <div className="radar-controls-bar">
        <div className="search-box">
          <Search size={14} className="search-icon" />
          <input
            type="search"
            placeholder="Search radar candidates... (e.g. video, prompt, code)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button className="search-clear" onClick={() => setQuery('')} aria-label="Clear query">
              <X size={13} />
            </button>
          )}
        </div>

        <div className="radar-source-chips">
          <button
            className={`radar-chip ${sourceFilter === 'All' ? 'active' : ''}`}
            onClick={() => setSourceFilter('All')}
          >
            All Sources ({items.length})
          </button>
          {sourcesList.map((src) => (
            <button
              key={src}
              className={`radar-chip ${sourceFilter === src ? 'active' : ''}`}
              onClick={() => setSourceFilter(src)}
            >
              {src}
            </button>
          ))}
        </div>
      </div>

      {/* Radar Candidates Grid */}
      <div className="radar-entries-table">
        {filteredItems.map((item, index) => {
          const candidateUrl = item.sources.find((source) => source.candidateUrl)?.candidateUrl
          return (
            <article className="radar-row-entry" key={item.id}>
              <span className="radar-entry-num">{String(index + 1).padStart(2, '0')}</span>

              <div className="radar-entry-core">
                <div className="radar-title-row">
                  {candidateUrl ? (
                    <a
                      className="radar-external-title"
                      href={candidateUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {item.title} <ExternalLink size={12} />
                    </a>
                  ) : (
                    <strong className="radar-entry-title">{item.title}</strong>
                  )}
                </div>
                <span className="radar-source-summary">{sourceSummary(item)}</span>
              </div>

              <div className="radar-sources-pills">
                {item.sources.slice(0, 3).map((source) => (
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noreferrer"
                    key={`${item.id}-${source.name}`}
                    className="radar-source-link"
                  >
                    <span>{source.name}</span>
                    <ExternalLink size={10} />
                  </a>
                ))}
              </div>
            </article>
          )
        })}

        {filteredItems.length === 0 && (
          <div className="empty-ledger-state">
            <p>No discovery candidates match your search filter.</p>
            <button
              className="btn-reset"
              onClick={() => {
                setQuery('')
                setSourceFilter('All')
              }}
            >
              Clear filters
            </button>
          </div>
        )}
      </div>

      <p className="radar-disclaimer">
        Discovery candidates are unvetted third-party sightings. They are not recommendations and are never published to the reviewed signal feed without first-party changelog proof.
      </p>
    </section>
  )
}
