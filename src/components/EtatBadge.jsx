import { memo } from 'react'

const ETATS = {
  actionnable:     { label: 'Actionnable',  cls: 'badge-actionnable', dot: '●' },
  attente_externe: { label: 'En attente',   cls: 'badge-attente',     dot: '○' },
  bloque:          { label: 'Bloqué',       cls: 'badge-bloque',      dot: '■' },
  surveille:       { label: 'Surveillé',    cls: 'badge-surveille',   dot: '◐' },
  clos:            { label: 'Clôturé',      cls: 'badge-clos',        dot: '✓' },
}

export default memo(function EtatBadge({ etat }) {
  const config = ETATS[etat] || ETATS.surveille
  return (
    <span className={`badge ${config.cls}`}>
      {config.dot} {config.label}
    </span>
  )
})
