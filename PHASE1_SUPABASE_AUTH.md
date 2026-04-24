# PHASE 1 — Supabase Auth + Table users + RLS
> Instruction Claude Code · Next Move · Multi-compte V2
> À exécuter en premier, avant toute modification de l'interface

---

## Objectif de cette phase

Remplacer le système d'authentification actuel (mot de passe unique partagé) par **Supabase Auth** (email + password individuel par utilisateur), et créer la table `users` qui stocke le profil de chaque utilisateur, y compris sa clé API Anthropic.

Cette phase ne touche **pas encore à l'interface** — elle pose les fondations en base de données et dans `src/services/db.js`.

---

## Étape 1 — Actions manuelles dans le Dashboard Supabase

> Ces actions sont à faire DIRECTEMENT dans le dashboard Supabase, avant de modifier le code.

### 1a. Activer Supabase Auth

Dashboard Supabase → Authentication → Settings :
- Provider **Email** : activé
- **Confirm email** : désactivé (pas de vérification email pour l'instant)
- **Site URL** : `https://next-move-mu.vercel.app`
- **Redirect URLs** : ajouter `https://next-move-mu.vercel.app`

### 1b. Créer la table `users`

Copier-coller dans l'éditeur SQL Supabase → Run :

```sql
CREATE TABLE public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  prenom TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  cle_api_anthropic TEXT,
  actif BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

### 1c. Ajouter la colonne user_id sur toutes les tables existantes

```sql
ALTER TABLE public.dossiers  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.users(id) ON DELETE CASCADE;
ALTER TABLE public.etapes    ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.users(id) ON DELETE CASCADE;
ALTER TABLE public.plannings ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.users(id) ON DELETE CASCADE;
ALTER TABLE public.routines  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.users(id) ON DELETE CASCADE;
ALTER TABLE public.journal   ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.users(id) ON DELETE CASCADE;
```

### 1d. Activer RLS sur toutes les tables

```sql
ALTER TABLE public.users     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dossiers  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.etapes    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plannings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.routines  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal   ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own"     ON public.users     FOR ALL USING (auth.uid() = id);
CREATE POLICY "dossiers_own"  ON public.dossiers  FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "etapes_own"    ON public.etapes    FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "plannings_own" ON public.plannings FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "routines_own"  ON public.routines  FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "journal_own"   ON public.journal   FOR ALL USING (auth.uid() = user_id);
```

### 1e. Créer le compte super-admin

Dans Supabase → Authentication → Users → **Add user** :
- Email : ton email
- Password : mot de passe fort
- Cocher "Auto Confirm User"

Puis noter l'UUID généré et exécuter dans l'éditeur SQL :

```sql
-- Remplacer TON-UUID et ton@email.com
INSERT INTO public.users (id, email, prenom, role)
VALUES ('TON-UUID', 'ton@email.com', 'Ludovic', 'admin');
```

---

## Étape 2 — Modifier `src/services/db.js`

> ⚠️ Fichier critique. Donner d'abord cette instruction à Claude Code :
> **"Montre-moi le code complet de src/services/db.js sans rien modifier"**
> Valider que c'est bien le bon fichier avant de continuer.

### 2a. Ajouter les fonctions Auth

Ajouter **après les imports existants**, avant les helpers `toRow/fromRow`, en utilisant le même pattern `raise(error, ctx)` déjà en place dans le fichier :

```javascript
// ─── AUTH ────────────────────────────────────────────────────────────────────

export const signIn = async (email, password) => {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) raise(error, 'signIn');
  return data;
};

export const signOut = async () => {
  const { error } = await supabase.auth.signOut();
  if (error) raise(error, 'signOut');
};

export const getCurrentUser = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  return user; // null si non connecté
};

export const onAuthStateChange = (callback) => {
  return supabase.auth.onAuthStateChange(callback);
};
```

### 2b. Ajouter les fonctions profil utilisateur

Ajouter juste après la section Auth :

```javascript
// ─── PROFIL UTILISATEUR ──────────────────────────────────────────────────────

export const getUserProfile = async (userId) => {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();
  if (error) raise(error, 'getUserProfile');
  return data;
};

export const updateUserProfile = async (userId, updates) => {
  const { data, error } = await supabase
    .from('users')
    .update(updates)
    .eq('id', userId)
    .select()
    .single();
  if (error) raise(error, 'updateUserProfile');
  return data;
};

export const updateCleApi = async (userId, cleApi) => {
  return updateUserProfile(userId, { cle_api_anthropic: cleApi });
};

// Admin uniquement
export const getAllUsers = async () => {
  const { data, error } = await supabase
    .from('users')
    .select('id, email, prenom, role, actif, created_at')
    .order('created_at', { ascending: true });
  if (error) raise(error, 'getAllUsers');
  return data;
};

export const toggleUserActif = async (userId, actif) => {
  const { error } = await supabase
    .from('users')
    .update({ actif })
    .eq('id', userId);
  if (error) raise(error, 'toggleUserActif');
};
```

### 2c. Ajouter `userId` à toutes les fonctions CRUD existantes

Pour chaque fonction des sections Dossiers, Journal, Étapes, Plannings, Routines :

**Lectures — ajouter `.eq('user_id', userId)` :**
```javascript
// AVANT
export const getDossiers = async () => {
  const { data, error } = await supabase.from('dossiers').select('*');
  ...
}
// APRÈS
export const getDossiers = async (userId) => {
  const { data, error } = await supabase
    .from('dossiers').select('*')
    .eq('user_id', userId);
  ...
}
```

**Inserts/Upserts — ajouter `user_id` dans la row :**
```javascript
// Utiliser le toRow() existant, puis ajouter user_id avant l'upsert
const row = { ...toRow(dossier), user_id: userId };
```

Appliquer ce pattern à **toutes** les fonctions CRUD sans exception.
Ne pas modifier la signature de `raise()`. Ne pas modifier les helpers `toRow/fromRow`.

---

## Ce qu'il NE FAUT PAS toucher dans cette phase

- `src/services/supabase.js`
- `src/context/AppContext.jsx` (Phase 2)
- Tous les composants JSX (Phase 2)
- La logique métier (Eisenhower, planning, brain dump)
- Les variables d'environnement Vercel

---

## Vérification avant de merger

1. Table `users` visible dans Supabase avec les bonnes colonnes ✓
2. Colonne `user_id` présente sur toutes les tables ✓
3. RLS activée (icône bouclier vert dans le dashboard) ✓
4. Aucune erreur dans `src/services/db.js` ✓
5. **Ne pas tester dans l'app** — l'interface n'est pas encore connectée

## Commande finale

```
git add -A && git commit -m "feat: supabase auth + table users + RLS + userId dans db.js" && git push origin master
```

---

> ✅ Phase 1 terminée → passer à PHASE2_AUTH_CONTEXT.md
