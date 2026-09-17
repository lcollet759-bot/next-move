import { useState } from 'react'
import { useApp } from '../context/AppContext'
import DossiersPanel from '../components/pupitre/DossiersPanel'

// Route expérimentale /pupitre — shell desktop en trois zones.
// Orchestration seulement : détient la sélection courante ; chaque colonne porte sa propre logique.
export default function Pupitre() {
  const { dossiers } = useApp()
  const [selectedId, setSelectedId] = useState(null)

  const selected = dossiers.find(d => d.id === selectedId) || null

  return (
    <div className="pp-shell">
      <section className="pp-col pp-journee">
        <h2 className="pp-section-title">Ta journée</h2>
      </section>

      <section className="pp-col pp-travail">
        <h2 className="pp-section-title">Travail actif</h2>
        {selected
          ? <h1 className="pp-travail-titre">{selected.titre}</h1>
          : <p className="pp-empty">Sélectionne un dossier.</p>}
      </section>

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
        .pp-travail-titre {
          font-size: 20px;
          font-weight: 700;
          color: var(--text);
        }
        .pp-empty {
          font-size: 13px;
          color: var(--text-secondary);
        }
      `}</style>
    </div>
  )
}
