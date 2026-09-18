import { useState } from 'react'
import BibliothequeDossiers from './BibliothequeDossiers'
import BibliothequeTaches from './BibliothequeTaches'

// Bibliothèque : vue large du Pupitre (jamais une route) pour explorer tout ce que Next Move connaît.
// Deux modes — Dossiers et Tâches. Ouvrir un élément referme la Bibliothèque et le charge dans Travail actif.
export default function Bibliotheque({ selectedId, onOuvrir }) {
  const [vue, setVue] = useState('dossiers')

  return (
    <div className="bib">
      <div className="bib-tete">
        <h2 className="bib-titre">Bibliothèque</h2>
        <div className="bib-onglets" role="tablist" aria-label="Vue de la Bibliothèque">
          <button
            type="button"
            role="tab"
            aria-selected={vue === 'dossiers'}
            className={`bib-onglet${vue === 'dossiers' ? ' bib-onglet--on' : ''}`}
            onClick={() => setVue('dossiers')}
          >
            Dossiers
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={vue === 'taches'}
            className={`bib-onglet${vue === 'taches' ? ' bib-onglet--on' : ''}`}
            onClick={() => setVue('taches')}
          >
            Tâches
          </button>
        </div>
      </div>

      {vue === 'dossiers'
        ? <BibliothequeDossiers selectedId={selectedId} onOuvrir={onOuvrir} />
        : <BibliothequeTaches onOuvrir={onOuvrir} />}

      <style>{`
        .bib {
          flex: 1;
          min-height: 0;
          display: flex;
          flex-direction: column;
          padding: 22px 30px 0;
        }
        .bib-tete {
          flex-shrink: 0;
          display: flex;
          align-items: baseline;
          gap: 22px;
          margin-bottom: 16px;
        }
        .bib-titre {
          font-size: 24px;
          font-weight: 300;
          color: var(--text);
          letter-spacing: -0.6px;
        }
        .bib-onglets { display: flex; gap: 4px; }
        .bib-onglet {
          padding: 6px 14px;
          font-size: 13px;
          font-weight: 600;
          font-family: inherit;
          color: var(--text-secondary);
          background: none;
          border: none;
          border-radius: 20px;
        }
        .bib-onglet:hover { color: var(--text); }
        .bib-onglet--on { background: var(--green); color: #FFFFFF; }
        .bib-onglet--on:hover { color: #FFFFFF; }

        /* ── Barre de critères, partagée par les deux vues ── */
        .bib-barre {
          flex-shrink: 0;
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 8px;
          padding-bottom: 14px;
          border-bottom: 0.5px solid var(--border);
        }
        .bib-recherche {
          flex: 1;
          min-width: 220px;
          padding: 8px 12px;
          font-size: 13px;
          font-family: inherit;
          color: var(--text);
          background: var(--surface);
          border: 0.5px solid var(--border);
          border-radius: var(--radius-sm);
          outline: none;
        }
        .bib-recherche::placeholder { color: var(--text-muted); }
        .bib-recherche:focus { border-color: var(--green); }
        .bib-pills { display: flex; flex-wrap: wrap; gap: 5px; }
        .bib-pill {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 5px 12px;
          font-size: 12px;
          font-weight: 600;
          font-family: inherit;
          color: var(--text-secondary);
          background: var(--surface);
          border: 0.5px solid var(--border);
          border-radius: 20px;
        }
        .bib-pill:hover { color: var(--text); }
        .bib-pill--on { background: var(--green); border-color: var(--green); color: #FFFFFF; }
        .bib-pill--on:hover { color: #FFFFFF; }
        .bib-pill-count { font-size: 10px; opacity: 0.7; }
        .bib-select {
          padding: 7px 10px;
          font-size: 12px;
          font-family: inherit;
          color: var(--text);
          background: var(--surface);
          border: 0.5px solid var(--border);
          border-radius: var(--radius-sm);
          outline: none;
          cursor: pointer;
        }
        .bib-select:focus { border-color: var(--green); }
        .bib-compte { font-size: 11px; font-weight: 600; color: var(--text-muted); }
        .bib-reset {
          padding: 0 4px;
          font-size: 12px;
          font-family: inherit;
          color: var(--color-accent);
          background: none;
          border: none;
          text-decoration: underline;
          text-decoration-color: var(--border);
        }
        .bib-defilement {
          flex: 1;
          min-height: 0;
          overflow-y: auto;
          padding: 16px 0 30px;
        }
      `}</style>
    </div>
  )
}
