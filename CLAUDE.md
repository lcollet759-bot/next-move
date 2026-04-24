# CLAUDE.md — Next Move · Référence Claude Code

> Ce fichier est lu à chaque session. Il prime sur tout autre contexte.
> Référence complète produit : NEXTMOVE_MEMOIRE.md

---

## PROJET

**Next Move** — PWA mobile (React + Vite) · Mémoire externe augmentée pour entrepreneurs suisses.
Promesse core : **"Tu n'oublies plus rien. Tu dictes, elle planifie."**
Runtime cible : Android Chrome.

---

## STACK

| Élément | Valeur |
|---|---|
| Frontend | React + Vite (PWA) |
| IA | API Claude Sonnet `claude-sonnet-4-20250514` |
| Base de données | Supabase (PostgreSQL) |
| Déploiement | Vercel |
| URL prod | next-move-mu.vercel.app |
| GitHub | lcollet759-bot/next-move |

---

## FICHIERS CRITIQUES — NE JAMAIS MODIFIER SANS DISCUSSION

- `src/context/AppContext.jsx` — état global de l'app
- `src/lib/db.js` — accès Supabase
- `src/index.css` — Design System complet (toutes les variables CSS)
- `vercel.json` — headers CSP requis pour pdfjs-dist worker

> Avant toute modification d'un fichier critique, formuler explicitement :
> *"Je vais modifier [fichier] pour [raison]. Cela peut impacter [fonctionnalité]. Confirmer ?"*

---

## RÈGLES GIT

- Toujours créer une branche avant chaque nouvelle fonctionnalité : `git checkout -b feature/nom-feature`
- Ne jamais développer directement sur `master`
- Merger uniquement quand la feature est testée et stable

---

## RÈGLES TECHNIQUES ABSOLUES

1. **`onConflict` pour la table `plannings` : toujours `'date'`, jamais `'id'`**
2. **Ne jamais utiliser `position: fixed` dans un composant imbriqué** → stacking context cassé
3. **RLS Supabase** : activée sur toutes les tables depuis la Phase 1 multi-comptes — ne pas désactiver
4. **Worker pdfjs** : chargé localement via `?url` Vite — ne jamais pointer vers CDN ou blob externe
5. **Logs documents** : uniquement `[Document] Analyse en cours...` et `[Document] Réponse reçue` — jamais le contenu
6. **Schéma Supabase** : tout changement = fichier `migrations/YYYYMMDD_description.sql` committé **avant** le code

---

## DÉVELOPPEMENT PAR COUCHES

Ne jamais modifier le cœur existant sans raison explicite :

- **Couche UI** : nouveaux composants, nouvelles pages → sans toucher aux services
- **Couche service** : nouvelles fonctions dans `claude.js` → sans modifier l'existant
- **Couche données** : nouveaux champs → toujours additifs (jamais renommer ou supprimer)
- **AppContext** : n'ajouter que ce qui est strictement nécessaire, par petits incréments

---

## TABLES SUPABASE

- `dossiers` — dossiers avec tâches (JSON), statut, quadrant Eisenhower
- `etapes` — historique des étapes par dossier
- `plannings` — planning journalier
- `routines` — tâches récurrentes (daily/weekly/monthly)
- `journal` — historique automatique de toutes les actions
- `users` — profils utilisateurs (email, prénom, role, cle_api_anthropic, actif)

---

## DESIGN SYSTEM (résumé)

**Couleurs :**
- Vert foncé `#1C3829` — headers, boutons principaux, lignes "Maintenant"
- Terracotta `#C4623A` — logo, urgences, alertes UNIQUEMENT
- Crème `#F7F5F0` — fond app
- Blanc `#FFFFFF` — cartes
- Texte secondaire `#A09080`
- Bordures `#DDD8CE`
- Fond secondaire `#F0EBE3`

**Typo :** Inter · Corps 13px · Titres section 10px uppercase letter-spacing 1px

**Bouton principal :** bg `#1C3829` · border-radius 10px · texte blanc weight 700
**Bouton secondaire :** bg `#F0EBE3` · border 0.5px `#DDD8CE` · texte `#A09080`
**Cartes :** bg blanc · border 0.5px `#DDD8CE` · border-radius 10-14px

---

## RÈGLES UX NON NÉGOCIABLES

1. Jamais d'action irréversible sans confirmation explicite
2. Une action principale visible — le reste est contextuel
3. Zéro jargon technique visible (pas Q1/Q2/Q3/Q4 — utiliser "Urgent/Important/À expédier/Plus tard")
4. Zéro statut technique visible (utiliser "À traiter / J'attends un retour / Bloqué / À l'œil / Terminé")

---

## VÉRIFICATION AVANT CHAQUE PUSH

- Navigation entre les 5 onglets fonctionne
- Création d'un dossier (mode Texte et Document)
- Affichage du résumé matinal sur l'onglet Aujourd'hui
- Détail d'un dossier : édition inline, tâches, changement d'état
- Réglages : sauvegarde de la clé API

---

## ÉTAT ACTUEL DU PROJET (avril 2026)

**Fonctionnel en prod :**
- Capture vocale et texte, Brain Dump → dossiers automatiques
- Matrice Eisenhower automatique (invisible pour l'utilisateur)
- Planning IA journalier adaptatif
- Mode Focus avec micro-récompenses
- Dossier Vivant avec historique
- Routines récurrentes
- Journal automatique
- Pipeline document sécurisé (pdfjs-dist, truncation 2000 chars)
- WeeklyReviewModal (fonctionnel, hors charte visuelle)

**Authentification actuelle :** mot de passe unique partagé (localStorage) → en cours de remplacement par Supabase Auth (phases 1-2-3)

---

## BUGS CONNUS (ne pas réintroduire)

1. Planning : tâches faites réapparaissent après la journée
2. Mode Focus : "Fait ✓" ne valide pas dans Supabase
3. Résumé IA matinal disparu depuis refonte Aujourdhui.jsx
4. "En attente de retour" → lien pointe vers tous les dossiers au lieu du filtre attente
5. Badge Q1 persiste dans anciens dossiers
6. Notifications push non reçues sur Android (deep linking manquant)
7. Bouton micro peu user-friendly

---

## FORMAT DE TRAVAIL

**Toujours commencer par :** `Montre-moi le code actuel de [fichier] sans rien modifier.`
**Une modification à la fois** — jamais deux features majeures ensemble.
**Terminer chaque session par :** `git add -A && git commit -m "..." && git push origin master`

**En cas de bug en boucle :**
1. `git log --oneline -10`
2. Identifier le dernier commit stable
3. `git revert --no-commit [hash_récent]..HEAD` puis commit et push
4. Repartir avec une instruction chirurgicale
