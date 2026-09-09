const p0 = [
  /price|pricing|plan|tier|credit|limit|allowance/i,
  /deprecated|deprecation|shutdown|sunset|discontinued|removed|breaking/i,
  /privacy|data retention|training data|terms of service|policy/i,
  /api version|rate limit|model availability|region availability/i,
]

const p1 = [
  /integration|workflow|export|import|agent|browser|mobile|desktop/i,
  /faster|latency|quality|accuracy|context window|support/i,
]

const p2 = [
  /spacing|padding|button|icon|color|copy update|typo|navigation polish/i,
]

export function classifyMateriality(diff) {
  const text = [...diff.removed, ...diff.added].join('\n')
  if (!diff.changed || !text.trim()) return { level: 'P2', reason: 'No meaningful normalized-text change.' }
  if (p0.some(rule => rule.test(text))) return { level: 'P0', reason: 'Matched a pricing, breaking, availability or policy-risk rule.' }
  if (p2.some(rule => rule.test(text)) && !p1.some(rule => rule.test(text))) return { level: 'P2', reason: 'Looks cosmetic or editorial.' }
  if (p1.some(rule => rule.test(text))) return { level: 'P1', reason: 'Matched a workflow or capability rule.' }
  return { level: 'REVIEW', reason: 'Ambiguous diff: send to semantic classifier with source context.' }
}
