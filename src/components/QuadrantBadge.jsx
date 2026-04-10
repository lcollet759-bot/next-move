import { memo } from 'react'

const QUADRANTS = {
  1: { label: 'Urgent & Important',    cls: 'badge-q1' },
  2: { label: 'Important',             cls: 'badge-q2' },
  3: { label: 'Urgent',                cls: 'badge-q3' },
  4: { label: 'Ni urgent ni important', cls: 'badge-q4' },
}

export default memo(function QuadrantBadge({ quadrant }) {
  const q = QUADRANTS[quadrant] || QUADRANTS[4]
  return (
    <span className={`badge ${q.cls}`}>{q.label}</span>
  )
})
