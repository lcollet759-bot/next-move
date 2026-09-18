import { todayFR } from '../../utils/date'

// Barre supérieure du Pupitre : identité Next Move, date du jour, accès à la Bibliothèque.
// Capture, Journal et Profil viendront prendre place dans .pph-actions — aucun bouton factice en attendant.
export default function PupitreHeader({ bibliothequeOuverte, onOuvrirBibliotheque, onFermerBibliotheque }) {
  return (
    <header className="pph">
      <div className="pph-marque">
        <span className="pph-logo">»</span>
        <span className="pph-nom">Next Move</span>
      </div>

      <span className="pph-date">{todayFR()}</span>

      <div className="pph-actions">
        {bibliothequeOuverte ? (
          <button type="button" className="pph-btn pph-btn--retour" onClick={onFermerBibliotheque}>
            ← Retour au Pupitre
          </button>
        ) : (
          <button type="button" className="pph-btn" onClick={onOuvrirBibliotheque}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
            Dossiers
          </button>
        )}
      </div>

      <style>{`
        .pph {
          flex-shrink: 0;
          display: flex;
          align-items: center;
          gap: 20px;
          padding: 12px 24px;
          background: var(--green);
        }
        .pph-marque { display: flex; align-items: center; gap: 9px; }
        .pph-logo {
          width: 26px;
          height: 26px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          border-radius: 50%;
          background: var(--color-accent);
          color: #FFFFFF;
          font-size: 12px;
          font-weight: 800;
          letter-spacing: -1.5px;
          line-height: 1;
        }
        .pph-nom {
          font-size: 14px;
          font-weight: 600;
          color: rgba(255,255,255,0.92);
          letter-spacing: -0.2px;
        }
        .pph-date {
          flex: 1;
          font-size: 12px;
          color: rgba(255,255,255,0.5);
          text-transform: capitalize;
        }
        .pph-actions { display: flex; align-items: center; gap: 8px; }
        .pph-btn {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          padding: 7px 14px;
          font-size: 13px;
          font-weight: 600;
          font-family: inherit;
          color: rgba(255,255,255,0.85);
          background: rgba(255,255,255,0.1);
          border: 0.5px solid rgba(255,255,255,0.18);
          border-radius: var(--radius-sm);
        }
        .pph-btn:hover { background: rgba(255,255,255,0.18); color: #FFFFFF; }
        .pph-btn--retour { background: transparent; }
      `}</style>
    </header>
  )
}
