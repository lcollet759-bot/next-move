import { memo } from 'react'

const ETATS = {
  actionnable:     { label: "À traiter",           cls: 'badge-actionnable', dot: '●' },
  attente_externe: { label: "J'attends un retour", cls: 'badge-attente',     dot: '○' },
  bloque:          { label: "Bloqué",              cls: 'badge-bloque',      dot: '■' },
  surveille:       { label: "À l'œil",             cls: 'badge-surveille',   dot: '◐' },
  clos:            { label: "Terminé",             cls: 'badge-clos',        dot: '✓' },
}

export default memo(function EtatBadge({ etat }) {
  const config = ETATS[etat] || ETATS.surveille
  return (
    <span className={`badge ${config.cls}`}>
      {config.dot} {config.label}
    </span>
  )
})
