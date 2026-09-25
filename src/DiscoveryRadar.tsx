import { useEffect, useMemo, useState } from 'react'
import { ExternalLink, Search, X } from 'lucide-react'
import bootstrapRaw from './data/discovery-seed.json'
import './discovery-radar.css'
import type { Language } from './App'

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

function sourceSummary(item: RadarItem, lang: Language) {
  if (item.sourceCount > 1) {
    return lang === 'de'
      ? `Aufgespürt über ${item.sourceCount} Discovery-Quellen`
      : `Spotted across ${item.sourceCount} discovery sources`
  }
  const srcName = item.sources[0]?.name || (lang === 'de' ? 'einem KI-Verzeichnis' : 'an AI directory')
  return lang === 'de' ? `Gefunden auf ${srcName}` : `Spotted on ${srcName}`
}

export default function DiscoveryRadar({ lang = 'de' }: { lang?: Language }) {
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
          <span className="section-eyebrow">
            {lang === 'de' ? 'ÖKOSYSTEM-RADAR' : 'ECOSYSTEM RADAR'}
          </span>
          <h2 id="discovery-radar-heading" className="radar-main-title">
            {lang === 'de' ? 'Was in Verzeichnissen auftaucht.' : 'What is surfacing on radar.'}
          </h2>
          <p className="radar-explanation">
            {lang === 'de'
              ? 'Verzeichnisse sind Radar, keine Evidenz. Dieser Stream überwacht 55+ ungeprüfte Kandidaten aus Product Hunt, Futurepedia und Toolify. Werkzeuge verbleiben in dieser Quarantäne, bis sie First-Party-Verifikation und unser redaktionelles Review bestehen.'
              : 'Directories are radar, not evidence. This stream monitors 55+ unvetted candidates spotted across Product Hunt, Futurepedia, and Toolify. Tools stay in this radar quarantine until they pass first-party verification and editorial review.'}
          </p>
        </div>

        <div className="radar-status-badge">
          <span className="status-mode">
            {mode === 'live'
              ? (lang === 'de' ? 'LIVE RADAR PIPELINE' : 'LIVE RADAR PIPELINE')
              : (lang === 'de' ? 'VERIFIZIERTER SNAPSHOT' : 'CACHED SEED')}
          </span>
          <span className="status-count">
            {filteredItems.length} {lang === 'de' ? 'von' : 'of'} {items.length}{' '}
            {lang === 'de' ? 'Kandidaten erfasst' : 'candidates tracked'}
          </span>
        </div>
      </div>

      {/* Radar Controls */}
      <div className="radar-controls-bar">
        <div className="search-box">
          <Search size={13} className="search-icon" />
          <input
            type="search"
            placeholder={
              lang === 'de'
                ? 'Radar-Kandidaten durchsuchen... (z. B. Video, Figma, Code)'
                : 'Search radar candidates... (e.g. video, prompt, code)'
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

        <div className="radar-source-chips">
          <button
            className={`radar-chip ${sourceFilter === 'All' ? 'active' : ''}`}
            onClick={() => setSourceFilter('All')}
          >
            {lang === 'de' ? 'Alle Quellen' : 'All Sources'} ({items.length})
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

      {/* Unboxed Radar Entries Table */}
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
                      {item.title} <ExternalLink size={11} />
                    </a>
                  ) : (
                    <strong className="radar-entry-title">{item.title}</strong>
                  )}
                </div>
                <span className="radar-source-summary">{sourceSummary(item, lang)}</span>
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
            <p>
              {lang === 'de'
                ? 'Keine Radar-Kandidaten für diese Suche gefunden.'
                : 'No discovery candidates match your search filter.'}
            </p>
            <button
              className="btn-reset"
              onClick={() => {
                setQuery('')
                setSourceFilter('All')
              }}
            >
              {lang === 'de' ? 'Filter zurücksetzen' : 'Clear filters'}
            </button>
          </div>
        )}
      </div>

      <p className="radar-disclaimer">
        {lang === 'de'
          ? 'Radar-Kandidaten sind ungeprüfte Funde aus Drittquellen. Sie sind keine Empfehlungen und gelangen niemals ohne First-Party-Changelog-Beweis in den redaktionellen Signal-Stream.'
          : 'Discovery candidates are unvetted third-party sightings. They are not recommendations and are never published to the reviewed signal feed without first-party changelog proof.'}
      </p>
    </section>
  )
}
