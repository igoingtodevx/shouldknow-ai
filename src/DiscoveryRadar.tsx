import { useEffect, useMemo, useState } from 'react'
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

  useEffect(() => {
    if (!API_BASE) return
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 5000)
    fetch(`${API_BASE}/v1/discovery?limit=12`, { signal: controller.signal })
      .then(response => {
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

  const visible = useMemo(() => items.slice(0, 12), [items])
  if (!visible.length) return null

  return <section className="discovery-radar" aria-labelledby="discovery-radar-heading">
    <div className="radar-head">
      <div>
        <span className="mini-label">DISCOVERY RADAR</span>
        <h2 id="discovery-radar-heading">What is surfacing across the ecosystem.</h2>
      </div>
      <p>Directories are radar, not evidence. They help Should Know notice products worth watching; material changes still need first-party verification before they become signals.</p>
    </div>

    <div className="radar-status" aria-label="Discovery radar source">
      <span>{mode === 'live' ? 'LIVE DIRECTORY DISCOVERY' : 'BOOTSTRAP SNAPSHOT'}</span>
      <span>{visible.length} candidates</span>
    </div>

    <div className="radar-list">
      {visible.map((item, index) => {
        const candidateUrl = item.sources.find(source => source.candidateUrl)?.candidateUrl
        return <article className="radar-row" key={item.id}>
          <span className="radar-index">{String(index + 1).padStart(2, '0')}</span>
          <div className="radar-main">
            {candidateUrl
              ? <a className="radar-title" href={candidateUrl} target="_blank" rel="noreferrer">{item.title} <span aria-hidden="true">↗</span></a>
              : <strong className="radar-title">{item.title}</strong>}
            <span className="radar-summary">{sourceSummary(item)}</span>
          </div>
          <div className="radar-sources">
            {item.sources.slice(0, 3).map(source => <a href={source.url} target="_blank" rel="noreferrer" key={`${item.id}-${source.name}`}>{source.name}</a>)}
          </div>
        </article>
      })}
    </div>

    <p className="radar-footnote">Discovery candidates are not recommendations and are not counted as reviewed Should Know signals.</p>
  </section>
}
