# PHASE 3 — Interface Super-Admin
> Instruction Claude Code · Next Move · Multi-compte V2
> À exécuter APRÈS que les Phases 1 et 2 sont terminées et mergées

---

## Prérequis

- Phase 1 : Supabase Auth + table users + RLS ✅
- Phase 2 : AppContext auth + Login + Inscription ✅
- Compte `role = 'admin'` existant et fonctionnel ✅

---

## Objectif de cette phase

Créer un écran d'administration minimal, accessible uniquement au super-admin, pour voir et gérer les utilisateurs inscrits.

Intentionnellement minimaliste — pas de tableau de bord complexe.

---

## Étape 1 — Créer `src/pages/Admin.jsx`

### Design (charte Next Move stricte)

```
┌─────────────────────────────┐
│  Header vert #1C3829        │
│  ← Retour    >> Admin       │
├─────────────────────────────┤
│                             │
│  UTILISATEURS               │  Label 10px uppercase #A09080
│                             │
│  ┌─────────────────────┐   │
│  │ Ludovic Collet      │   │  Prénom + Nom en gras 13px
│  │ ludo@email.com      │   │  Email en muted 11px
│  │ Admin · Actif    ●  │   │  Badge role + point vert (admin non désactivable)
│  └─────────────────────┘   │
│                             │
│  ┌─────────────────────┐   │
│  │ Prénom Utilisateur  │   │
│  │ user@email.com      │   │
│  │ User      [  ON  ]  │   │  Toggle actif/inactif (fond vert si ON, gris si OFF)
│  └─────────────────────┘   │
│                             │
│  STATISTIQUES               │  Label 10px uppercase #A09080
│  ┌─────────────────────┐   │
│  │ X utilisateurs      │   │
│  │ inscrits au total   │   │
│  └─────────────────────┘   │
│                             │
└─────────────────────────────┘
```

### Structure du composant

```javascript
import { useState, useEffect, useContext } from 'react';
import { AppContext } from '../context/AppContext';
import { getAllUsers, toggleUserActif } from '../services/db';

export default function Admin({ onRetour }) {
  const { userProfile } = useContext(AppContext);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Garde d'accès
  if (userProfile?.role !== 'admin') {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#A09080' }}>
        Accès non autorisé.
      </div>
    );
  }

  useEffect(() => {
    getAllUsers().then(setUsers).finally(() => setLoading(false));
  }, []);

  const handleToggle = async (userId, currentActif) => {
    // Ne pas permettre à l'admin de se désactiver lui-même
    if (userId === userProfile.id) return;
    const newActif = !currentActif;
    await toggleUserActif(userId, newActif);
    setUsers(users.map(u => u.id === userId ? { ...u, actif: newActif } : u));
  };

  return ( /* JSX selon le design ci-dessus */ );
}
```

**Comportement toggle :**
- Admin → pas de toggle, afficher un point vert fixe
- User actif → toggle ON (fond vert #1C3829)
- User inactif → toggle OFF (fond #DDD8CE)
- Tap → appel `toggleUserActif` + mise à jour locale du state

---

## Étape 2 — Vérification compte désactivé dans `src/pages/Login.jsx`

Après un `signIn` réussi, l'AppContext charge le `userProfile`. Modifier l'AppContext pour qu'il vérifie automatiquement `actif` après chaque chargement de profil :

```javascript
// Dans le useEffect onAuthStateChange de AppContext
const profile = await getUserProfile(session.user.id);
if (!profile.actif) {
  // Déconnecter immédiatement
  await signOut();
  setAuthUser(null);
  setUserProfile(null);
  // Stocker le message dans un state dédié
  setAuthErrorMessage('Ton compte a été désactivé. Contacte l\'administrateur.');
  return;
}
setUserProfile(profile);
```

Ajouter `authErrorMessage` dans la value du contexte et l'afficher dans `Login.jsx` (même style que les autres erreurs, texte terracotta).

---

## Étape 3 — Accès Admin depuis `src/pages/Reglages.jsx`

Ajouter **conditionnellement** un groupe de carte, visible uniquement si `userProfile?.role === 'admin'` :

```javascript
{userProfile?.role === 'admin' && (
  <div style={{ /* même style que les autres groupes de cartes */ }}>
    {/* Label section */}
    <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: '#A09080' }}>
      Administration
    </p>
    {/* Carte cliquable */}
    <div onClick={() => naviguerVers('admin')} style={{ /* style carte standard */ }}>
      <span>Gérer les utilisateurs</span>
      <span style={{ color: '#A09080' }}>→</span>
    </div>
  </div>
)}
```

Utiliser le même mécanisme de navigation interne déjà en place dans l'app pour naviguer vers l'écran Admin.

---

## Étape 4 — Ajouter Admin dans le routing de `src/App.jsx`

Ajouter `Admin` dans la liste des écrans disponibles dans `AppAuthentifiee`, en utilisant le même pattern de navigation interne existant. Ne pas créer de nouveau système de routing.

---

## Ce qu'il NE FAUT PAS toucher dans cette phase

- Toute la logique métier (dossiers, planning, focus, etc.)
- `src/index.css`
- `src/services/db.js` — les deux fonctions `getAllUsers` et `toggleUserActif` ont été ajoutées en Phase 1, ne pas les modifier
- La structure des tables Supabase

---

## Vérification avant de merger

1. Connexion admin → lien "Administration" visible dans Réglages ✓
2. Connexion user normal → lien "Administration" invisible dans Réglages ✓
3. Depuis Admin, désactiver un compte user → confirmer dans Supabase que `actif = false` ✓
4. Tenter de connecter le compte désactivé → message d'erreur affiché ✓
5. L'admin ne peut pas se désactiver lui-même (toggle grisé sur sa ligne) ✓
6. Tester sur Android Chrome ✓

## Commande finale

```
git add -A && git commit -m "feat: interface admin + désactivation compte" && git push origin master
```

---

## Résumé des 3 phases

| Phase | Quoi | Risque | Durée estimée |
|-------|------|--------|---------------|
| Phase 1 | Supabase SQL + db.js | Élevé — base de données | ~1h |
| Phase 2 | AppContext + Login + Inscription | Moyen — remplace l'auth | ~2h |
| Phase 3 | Interface Admin | Faible — écran additionnel | ~1h |

**Règle absolue : une phase à la fois, mergée et vérifiée avant de passer à la suivante.**

---

> ✅ Phase 3 terminée → Multi-compte V2 opérationnel
> Prochain chantier selon roadmap : Onboarding 3 écrans
