export function normalize(text) {
  return text
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function diffLines(before, after) {
  const left = new Set(normalize(before).split('\n').map(line => line.trim()).filter(Boolean))
  const right = new Set(normalize(after).split('\n').map(line => line.trim()).filter(Boolean))
  const removed = [...left].filter(line => !right.has(line))
  const added = [...right].filter(line => !left.has(line))
  return { removed, added, changed: removed.length > 0 || added.length > 0 }
}
