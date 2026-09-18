import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import PupitreHeader from '../components/pupitre/PupitreHeader'
import JourneePanel from '../components/pupitre/JourneePanel'
import DossierWorkspace from '../components/pupitre/DossierWorkspace'
import Bibliotheque from '../components/pupitre/Bibliotheque'

// Route expérimentale /pupitre — espace de travail desktop.
// Orchestration seulement : la sélection courante vit dans l'URL (?dossier=…&tache=…), la Bibliothèque
// est une vue du Pupitre (jamais une route), chaque zone porte sa propre logique.
export default function Pupitre() {
  const [params, setParams] = useSearchParams()
  const [bibliotheque, setBibliotheque] = useState(false)

  const dossierId = params.get('dossier') || null
  const tacheId   = params.get('tache')   || null

  // La sélection EST l'URL : F5 et partage de lien retrouvent le contexte, sans état global supplémentaire.
  const ouvrirDossier = (id, tache = null) => {
    const suivant = new URLSearchParams(params)
    if (id) suivant.set('dossier', id); else suivant.delete('dossier')
    if (id && tache) suivant.set('tache', tache); else suivant.delete('tache')
    setParams(suivant, { replace: true })
  }

  const ouvrirDepuisBibliotheque = (id, tache = null) => {
    ouvrirDossier(id, tache)
    setBibliotheque(false)
  }

  return (
    <div className="pp-shell">
      <PupitreHeader
        bibliothequeOuverte={bibliotheque}
        onOuvrirBibliotheque={() => setBibliotheque(true)}
        onFermerBibliotheque={() => setBibliotheque(false)}
      />

      {bibliotheque ? (
        <Bibliotheque selectedId={dossierId} onOuvrir={ouvrirDepuisBibliotheque} />
      ) : (
        <div className="pp-body">
          <JourneePanel onOuvrir={ouvrirDossier} selectedId={dossierId} />
          <DossierWorkspace dossierId={dossierId} tacheId={tacheId} />
        </div>
      )}

      <style>{`
        .pp-shell {
          display: flex;
          flex-direction: column;
          height: 100%;
          min-height: 0;
          background: var(--bg);
        }
        .pp-body {
          flex: 1;
          min-height: 0;
          display: grid;
          grid-template-columns: minmax(0, 1.65fr) minmax(360px, 1fr);
        }
        @media (max-width: 1100px) {
          .pp-body { grid-template-columns: minmax(0, 1.2fr) minmax(320px, 1fr); }
        }

        /* Primitives partagées par les composants du Pupitre */
        .pp-section-title {
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 1px;
          color: var(--text-secondary);
        }
        .pp-empty {
          font-size: 13px;
          color: var(--text-secondary);
        }
      `}</style>
    </div>
  )
}
