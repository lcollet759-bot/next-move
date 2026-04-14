# Règles de développement — Next Move

## 1. Branches Git

Toujours créer une branche séparée avant chaque nouvelle fonctionnalité :

```bash
git checkout -b feature/nom-feature
```

Ne jamais développer directement sur `master`. Merger uniquement quand la feature est testée et stable.

## 2. Fichiers critiques — modification protégée

Les fichiers suivants ne doivent **jamais** être modifiés sans créer une migration versionnée au préalable :

- `src/context/AppContext.jsx`
- `src/services/db.js`
- Schéma Supabase (tables, colonnes, RLS)

Une migration versionnée = un fichier `migrations/YYYYMMDD_description.sql` décrivant le changement, committé **avant** toute modification du code applicatif.

## 3. Vérification avant chaque push

Avant chaque `git push`, vérifier que les fonctionnalités existantes fonctionnent :

- Navigation entre les 5 onglets
- Création d'un dossier (mode Texte et Document)
- Affichage du résumé matinal sur l'onglet Aujourd'hui
- Détail d'un dossier : édition inline, tâches, changement d'état
- Réglages : sauvegarde de la clé API

## 4. Développement par couches

Ajouter les nouvelles features par couches — ne jamais modifier le cœur existant sans raison explicite :

- **Couche UI** : nouveaux composants, nouvelles pages → sans toucher aux services
- **Couche service** : nouvelles fonctions dans `claude.js` ou `notifications.js` → sans modifier l'existant
- **Couche données** : nouveaux champs → toujours additifs (jamais renommer ou supprimer)
- **AppContext** : n'ajouter que ce qui est strictement nécessaire, par petits incréments

## 5. Confirmation avant modification critique

En cas de doute sur l'impact d'une modification, demander confirmation avant de toucher à :

- `AppContext.jsx`
- `db.js` / `supabase.js`
- `index.html` (CSP)
- `vite.config.js`
- Tout fichier modifié par plus de 3 features différentes

Formuler explicitement : *"Je vais modifier [fichier] pour [raison]. Cela peut impacter [fonctionnalité]. Confirmer ?"*
