# PHASE 2 — AppContext + Écrans Login / Inscription
> Instruction Claude Code · Next Move · Multi-compte V2
> À exécuter APRÈS que la Phase 1 est terminée et mergée dans master

---

## Prérequis

- Phase 1 complète et mergée ✅
- Table `users` créée dans Supabase ✅
- RLS activée sur toutes les tables ✅
- Fonctions Auth + profil disponibles dans `src/services/db.js` ✅

---

## Objectif de cette phase

1. Modifier `src/context/AppContext.jsx` pour gérer l'état d'authentification Supabase
2. Créer `src/pages/Login.jsx`
3. Créer `src/pages/Inscription.jsx` (3 étapes inline)
4. Modifier `src/App.jsx` pour router selon l'état auth

---

## Étape 1 — Modifier `src/context/AppContext.jsx`

> ⚠️ Fichier critique. Instruction préalable obligatoire :
> **"Montre-moi le code complet de src/context/AppContext.jsx sans rien modifier"**

### Imports à ajouter

```javascript
import { getCurrentUser, getUserProfile, onAuthStateChange, signOut } from '../services/db';
```

### State à ajouter dans le contexte

```javascript
const [authUser, setAuthUser]       = useState(null);   // session Supabase Auth
const [userProfile, setUserProfile] = useState(null);   // profil table users
const [authLoading, setAuthLoading] = useState(true);   // vérification initiale
```

### useEffect à ajouter

```javascript
useEffect(() => {
  // Vérifier session existante au démarrage
  getCurrentUser().then(async (user) => {
    if (user) {
      setAuthUser(user);
      const profile = await getUserProfile(user.id);
      setUserProfile(profile);
    }
    setAuthLoading(false);
  });

  // Écouter login/logout
  const { data: { subscription } } = onAuthStateChange(async (event, session) => {
    if (session?.user) {
      setAuthUser(session.user);
      const profile = await getUserProfile(session.user.id);
      setUserProfile(profile);
    } else {
      setAuthUser(null);
      setUserProfile(null);
    }
  });

  return () => subscription.unsubscribe();
}, []);
```

### Fonction logout à ajouter

```javascript
const logout = async () => {
  await signOut();
  setAuthUser(null);
  setUserProfile(null);
};
```

### Exposer dans la value du contexte

Ajouter à la `value` existante sans rien supprimer :

```javascript
authUser,
userProfile,
authLoading,
logout,
setUserProfile,
```

### Passer userId à toutes les fonctions db.js

Dans AppContext, tous les appels aux fonctions de `db.js` (getDossiers, saveDossier, getJournal, etc.) doivent maintenant recevoir `authUser?.id` comme premier paramètre.

Exemple :
```javascript
// AVANT
const dossiers = await getDossiers();
// APRÈS
const dossiers = await getDossiers(authUser?.id);
```

Appliquer à tous les appels sans exception.

---

## Étape 2 — Créer `src/pages/Login.jsx`

Créer ce fichier from scratch en respectant strictement la charte graphique Next Move (couleurs, typographie, border-radius, boutons).

### Design

```
┌─────────────────────────────┐
│  Header vert #1C3829        │
│  >> Next Move               │
├─────────────────────────────┤
│                             │
│  Bon retour,                │  34px weight 300
│  connecte-toi.              │  34px weight 700
│                             │
│  ┌─────────────────────┐   │
│  │ Email               │   │  Input blanc, border #DDD8CE, radius 10px
│  └─────────────────────┘   │
│                             │
│  ┌─────────────────────┐   │
│  │ Mot de passe     👁 │   │  Toggle show/hide
│  └─────────────────────┘   │
│                             │
│  Message d'erreur           │  Texte terracotta #C4623A, visible si erreur
│                             │
│  [    Se connecter    ]     │  Bouton vert #1C3829, pleine largeur, radius 10px
│                             │
│  Pas encore de compte ?     │  Texte muted #A09080
│  Créer un compte →          │  Lien texte vert #1C3829
│                             │
└─────────────────────────────┘
```

### Structure du composant

```javascript
import { useState } from 'react';
import { signIn } from '../services/db';

export default function Login({ onNavigateToInscription }) {
  const [email, setEmail]             = useState('');
  const [password, setPassword]       = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState('');

  const handleLogin = async () => {
    if (!email || !password) return;
    setLoading(true);
    setError('');
    try {
      await signIn(email, password);
      // Le onAuthStateChange dans AppContext prend le relais automatiquement
    } catch (err) {
      setError('Email ou mot de passe incorrect.');
    } finally {
      setLoading(false);
    }
  };

  // Vérifier actif après connexion réussie → géré dans AppContext
  // Si userProfile.actif === false, AppContext déconnecte et affiche message

  return ( /* JSX selon le design ci-dessus */ );
}
```

**Messages d'erreur :**
- Champs vides → "Remplis tous les champs."
- Mauvais identifiants → "Email ou mot de passe incorrect."
- Compte désactivé → "Ton compte a été désactivé. Contacte l'administrateur."
- Erreur réseau → "Impossible de se connecter. Vérifie ta connexion."

---

## Étape 3 — Créer `src/pages/Inscription.jsx`

Flux en **3 étapes** affichées sur le même écran (pas de navigation entre pages — state `etape` local).

### Étape 1 — Identité

```
Titre : "Bienvenue,"  / "crée ton compte."  (34px)

4 inputs :
- Prénom
- Email
- Mot de passe (min 8 caractères, avec toggle 👁)
- Confirmer le mot de passe

Bouton : "Continuer →"  (vert, pleine largeur)
Lien : "Déjà un compte ? Se connecter →"
```

### Étape 2 — Clé API Anthropic

```
Titre : "Ta clé API,"  /  "dernière étape."  (34px)

Carte info (#F0EBE3, radius 10px) :
"Elle te permet d'utiliser l'IA. 
Elle est chiffrée et n'est jamais partagée."

Input : sk-ant-...  avec toggle 👁

Lien discret : "Obtenir ma clé →" → ouvre console.anthropic.com dans nouvel onglet

Bouton : "Créer mon compte"  (vert, pleine largeur)
```

Validation de la clé API : doit commencer par `sk-ant-` (vérification basique côté client).

### Étape 3 — Confirmation

```
Icône ✓ (cercle terracotta #C4623A, 60px)

"Bienvenue, [Prénom] !"  (24px gras)
"Next Move est prêt."   (16px muted)

Bouton : "Démarrer →"  (vert, pleine largeur)
→ Le onAuthStateChange prend le relais, pas besoin de navigation manuelle
```

### Logique de création de compte

```javascript
import { supabase } from '../services/supabase';

const handleInscription = async () => {
  setLoading(true);
  try {
    // 1. Créer le compte Supabase Auth
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;

    // 2. Créer le profil dans la table users
    const { error: profileError } = await supabase.from('users').insert({
      id: data.user.id,
      email,
      prenom,
      role: 'user',
      cle_api_anthropic: cleApi,
      actif: true,
    });
    if (profileError) throw profileError;

    // 3. Passer à l'étape de confirmation
    setEtape(3);
  } catch (err) {
    setError('Une erreur est survenue. Réessaie.');
  } finally {
    setLoading(false);
  }
};
```

---

## Étape 4 — Modifier `src/App.jsx`

### Ajouter le routing selon l'état auth

```javascript
import { useContext, useState } from 'react';
import { AppContext } from './context/AppContext';
import Login from './pages/Login';
import Inscription from './pages/Inscription';

// Dans le composant principal App :
const { authUser, authLoading, userProfile } = useContext(AppContext);
const [showInscription, setShowInscription] = useState(false);

// Pendant la vérification de session
if (authLoading) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '100vh', background: '#F7F5F0'
    }}>
      {/* Logo >> animé : cercle terracotta #C4623A, 48px, deux flèches SVG blanches */}
      {/* Animation : pulse subtil, 1 seconde */}
    </div>
  );
}

// Compte désactivé — déconnecter et afficher message
if (authUser && userProfile && !userProfile.actif) {
  logout(); // fonction depuis AppContext
  return null;
}

// Non authentifié
if (!authUser) {
  if (showInscription) {
    return <Inscription onNavigateToLogin={() => setShowInscription(false)} />;
  }
  return <Login onNavigateToInscription={() => setShowInscription(true)} />;
}

// Authentifié → app normale (le reste du return existant)
```

---

## Étape 5 — Modifier `src/pages/Reglages.jsx`

Deux modifications uniquement :

**1. Afficher les vraies infos du profil** (depuis `userProfile` dans AppContext) :
- Prénom dynamique au lieu de "Ludovic" hardcodé
- Email dynamique
- Stats si disponibles

**2. Section clé API — permettre la mise à jour :**
```javascript
import { updateCleApi } from '../services/db';
const { authUser, userProfile, setUserProfile } = useContext(AppContext);

const handleSauvegarderCleApi = async () => {
  await updateCleApi(authUser.id, nouvelleCle);
  setUserProfile({ ...userProfile, cle_api_anthropic: nouvelleCle });
  // Afficher un message de confirmation inline ("Clé mise à jour ✓")
};
```

**3. Bouton Se déconnecter :**
```javascript
const { logout } = useContext(AppContext);
// Ajouter onClick={logout} sur le bouton existant
```

---

## Ce qu'il NE FAUT PAS toucher dans cette phase

- La logique métier de Aujourdhui, Planning, Dossiers, ModeFocus, Journal, Capturer
- `src/index.css` — utiliser uniquement les variables CSS existantes
- `src/services/db.js` — ne pas modifier les fonctions CRUD existantes
- La structure des tables Supabase

---

## ⚠️ Action critique avant de tester — rattacher les données existantes

Les dossiers existants ont `user_id = NULL`. Exécuter ce SQL dans Supabase **avant** de tester l'app, en remplaçant TON-UUID par l'UUID du compte admin :

```sql
UPDATE public.dossiers  SET user_id = 'TON-UUID' WHERE user_id IS NULL;
UPDATE public.etapes    SET user_id = 'TON-UUID' WHERE user_id IS NULL;
UPDATE public.plannings SET user_id = 'TON-UUID' WHERE user_id IS NULL;
UPDATE public.routines  SET user_id = 'TON-UUID' WHERE user_id IS NULL;
UPDATE public.journal   SET user_id = 'TON-UUID' WHERE user_id IS NULL;
```

---

## Vérification avant de merger

1. Créer un nouveau compte depuis l'écran Inscription → vérifier qu'il apparaît dans Supabase Auth et dans la table `users` ✓
2. Se connecter avec ce compte → app se charge avec des données vides ✓
3. Se connecter avec le compte admin → dossiers existants visibles ✓
4. Déconnexion depuis Réglages → retour à l'écran Login ✓
5. Tester sur Android Chrome ✓

## Commande finale

```
git add -A && git commit -m "feat: login, inscription, appcontext auth, reglages profil" && git push origin master
```

---

> ✅ Phase 2 terminée → passer à PHASE3_ADMIN.md
