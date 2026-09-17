import { useState } from 'react'
import DossiersPanel from '../components/pupitre/DossiersPanel'
import DossierWorkspace from '../components/pupitre/DossierWorkspace'

// Route expérimentale /pupitre — shell desktop en trois zones.
// Orchestration seulement : détient la sélection courante ; chaque colonne porte sa propre logique.
export default function Pupitre() {
  const [selectedId, setSelectedId] = useState(null)

  return (
    <div className="pp-shell">
      <section className="pp-col pp-journee">
        <h2 className="pp-section-title">Ta journée</h2>
      </section>

      <DossierWorkspace dossierId={selectedId} />

      <DossiersPanel selectedId={selectedId} onSelectDossier={setSelectedId} />

      <style>{`
        .pp-shell {
          display: grid;
          grid-template-columns: 280px minmax(0, 1fr) 340px;
          gap: 16px;
          height: 100%;
          padding: 16px;
          background: var(--bg);
        }
        .pp-col {
          display: flex;
          flex-direction: column;
          min-height: 0;
          background: var(--surface);
          border: 0.5px solid var(--border);
          border-radius: var(--radius);
          padding: 16px;
        }
        .pp-section-title {
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 1px;
          color: var(--text-secondary);
          margin-bottom: 12px;
        }
        .pp-empty {
          font-size: 13px;
          color: var(--text-secondary);
        }
      `}</style>
    </div>
  )
}
