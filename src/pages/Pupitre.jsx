import { useState } from 'react'
import { useApp } from '../context/AppContext'

// Route expérimentale /pupitre — shell desktop en trois zones.
// Lecture seule : réutilise les dossiers déjà chargés par AppContext.
export default function Pupitre() {
  const { dossiers, loading } = useApp()
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

      <section className="pp-col pp-dossiers">
        <h2 className="pp-section-title">Dossiers</h2>
        {loading ? (
          <p className="pp-empty">Chargement…</p>
        ) : dossiers.length === 0 ? (
          <p className="pp-empty">Aucun dossier.</p>
        ) : (
          <ul className="pp-list">
            {dossiers.map(d => (
              <li key={d.id}>
                <button
                  type="button"
                  className={`pp-item${d.id === selectedId ? ' pp-item--active' : ''}`}
                  onClick={() => setSelectedId(d.id)}
                >
                  {d.titre}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <style>{`
        .pp-shell {
          display: grid;
          grid-template-columns: 280px minmax(0, 1fr) 320px;
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
        .pp-list {
          list-style: none;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .pp-item {
          width: 100%;
          text-align: left;
          font-size: 13px;
          color: var(--text);
          background: var(--surface);
          border: 0.5px solid var(--border);
          border-radius: var(--radius-sm);
          padding: 10px 12px;
        }
        .pp-item:hover { background: var(--border-light); }
        .pp-item--active {
          background: var(--green);
          border-color: var(--green);
          color: #FFFFFF;
          font-weight: 700;
        }
        .pp-item--active:hover { background: var(--green); }
      `}</style>
    </div>
  )
}
