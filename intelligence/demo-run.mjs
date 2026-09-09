import { diffLines } from './diff.mjs'
import { classifyMateriality } from './materiality.mjs'

const cases = [
  {
    name: 'pricing change',
    before: 'Pro plan\n$20 / month\n1,000 runs',
    after: 'Pro plan\n$29 / month\n500 runs',
  },
  {
    name: 'cosmetic change',
    before: 'Improved button spacing in settings',
    after: 'Improved button padding in settings',
  },
  {
    name: 'workflow change',
    before: 'Browser tests support Chrome',
    after: 'Browser tests support Chrome\nNew agent workflow export',
  },
]

for (const sample of cases) {
  const diff = diffLines(sample.before, sample.after)
  console.log(sample.name, classifyMateriality(diff), diff)
}
