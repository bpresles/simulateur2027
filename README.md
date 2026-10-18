# simulateur2027 : simulateur de la présidentielle 2027

Ce simulateur calcule l'élection présidentielle de 2027 en trois temps :

1. **Premier tour.** On part de la moyenne des derniers sondages (dernier sondage de chaque institut sur 21 jours). En option, on la projette jusqu'aux derniers sondages avant le vote en reproduisant la progression observée en 2022 à la même distance du scrutin (sondages de l'automne 2021). Par défaut, on la corrige strictement de l'écart relatif réel de 2022 entre les derniers sondages et le résultat officiel : appliquée aux sondages de 2022, la correction redonne exactement le résultat. On applique ensuite les alliances choisies. Les alliances incompatibles sont exclues : un candidat ne rallie qu'une alliance, et un candidat rallié n'en mène pas d'autre.
2. **Qualification.** Les deux candidats en tête du premier tour simulé passent au second tour.
3. **Second tour.** Par défaut, on applique strictement les reports de voix mesurés aux législatives 2024 (enquête Ipsos-Talan publiée par franceinfo le 07/07/2024), selon le type de duel. Pour une alliance, on mélange les profils de ses membres selon leur poids. Le niveau global des blancs, nuls et abstentions est calé sur le niveau réel du second tour 2022 (Conseil constitutionnel).

Le site a deux pages, accessibles par le menu du haut :

- **Simulateur** (`/`) : le scénario et ses résultats.
- **Méthodologie** (`/methodologie`) : chaque source, chaque formule et chaque hypothèse, avec les valeurs du scénario en cours.

> Ceci est une simulation fondée sur des sondages publiés et des hypothèses explicites. Ce n'est ni un sondage ni une prévision.

## Stack

- **Vite, React 19, TypeScript** (strict) et **Tailwind CSS v4** : une SPA statique.
- **Radix UI** pour les composants accessibles et **Motion** pour les animations.
- **Zustand** (`persist`) pour les réglages de l'utilisateur, stockés dans le localStorage.
- **Zod** pour valider les données JSON au chargement.
- **Vitest** pour les tests et **bun** comme gestionnaire de paquets.

## Commandes

```bash
bun install
bun run dev        # serveur de développement
bun run test       # tests (domaine + données)
bun run lint       # ESLint
bun run build      # vérification TypeScript + build de production dans dist/
bun run preview    # sert dist/ en local
bun run sync-polls # synchronise les sondages depuis les flux ouverts
```

## Architecture

```
src/
  domain/   Calcul pur en TypeScript, sans React : moyenne des sondages, corrections, alliances,
            reports, 2nd tour. simulate() enchaîne les étapes et renvoie une trace complète.
  data/     Les trois fichiers JSON et leur validation (schema.ts : Zod + contrôles croisés).
  sync/     Conversion et fusion des flux de sondages externes (utilisé par scripts/sync-polls.ts).
  state/    Réglages de l'utilisateur (seules les surcharges sont stockées ; les valeurs
            par défaut restent calculées à partir des données).
  hooks/    useSimulation() : réglages → résultat.
  ui/       Composants React, routeur minimal (router.ts, Link.tsx) pour les deux pages.
```

## Données

| Fichier | Contenu |
|---|---|
| `src/data/polls-2027.json` | Candidats, jeux d'hypothèses, alliances, sondages de 1er tour (toutes les hypothèses de chaque sondage), sondages directs de 2nd tour (repères). |
| `src/data/reference-2022.json` | Voix officielles des deux tours de 2022 (Conseil constitutionnel), dernier sondage de chaque institut avant le 1er tour, et sondages de l'automne 2021 (progression). |
| `src/data/transfers-legislatives-2024.json` | Taux de report par type de duel et par électorat. Chaque valeur indique sa provenance : `franceinfo`, `publicsenat`, `lcp`, `derive` (complété par règle), `transpose` (taux 2024 d'un autre duel), `camp` (rattaché au camp RN) ou `hypothese`. |

### Synchronisation automatique des sondages

`bun run sync-polls` met à jour `src/data/polls-2027.json` à partir de deux flux ouverts, compilés d'après les notices officielles de la Commission des sondages :

| Flux | Contenu | Licence | Priorité |
|---|---|---|---|
| [2027etmoi](https://www.data.gouv.fr/datasets/sondages-dintentions-de-vote-au-premier-tour-presidentielle-2027-notices-officielles) (`2027etmoi.fr/data/sondages.json`) | 1er tour, chaque chiffre vérifié sur la notice | Licence Ouverte 2.0 | 1 |
| [Mieux Voter](https://github.com/MieuxVoter/presidentielle2027) (`presidentielle2027.json`) | 1er et 2nd tours, historique depuis 2024 | MIT (citer « Données : Mieux Voter ») | 2 |

Le script :

1. récupère les deux flux et contrôle leur format (un flux injoignable ou au format inattendu est ignoré ; si les deux le sont, le script échoue) ;
2. convertit leurs données dans notre format : instituts harmonisés, candidats associés à nos identifiants, candidats inconnus ajoutés aux candidats non simulés ;
3. fusionne avec les données existantes : un même sondage (même institut, même fin de terrain) est remplacé par la version de la source la plus fiable (2027etmoi, puis Mieux Voter, puis saisie manuelle), en gardant son identifiant. Les saisies manuelles absentes des flux sont conservées. Seuls les sondages des 120 derniers jours sont importés ;
4. ne modifie le fichier (et n'avance la date de référence `asOf`) que si un sondage est ajouté ou modifié, ou si la fenêtre glissante retient d'autres sondages ;
5. valide le résultat avec le même schéma que l'application.

Les tests qui vérifient des chiffres précis utilisent un instantané figé (`src/data/__fixtures__/polls-2027-20261018.json`) : une synchronisation ne les casse donc pas. Les données vivantes sont contrôlées par `src/data/data.test.ts`.

### GitHub Action et redéploiement

`.github/workflows/sync-polls.yml` lance la synchronisation chaque jour à 06:17 UTC (et à la demande depuis l'onglet Actions). Si les données changent, elle exécute les tests et le build, puis commite `src/data/polls-2027.json` sur la branche principale.

- **Dépôt relié à Vercel par Git (recommandé)** : ce push déclenche le déploiement de production, rien d'autre à configurer.
- **Sans intégration Git** : créez un *Deploy Hook* dans Vercel (Project Settings → Git → Deploy Hooks) et enregistrez son URL dans le secret GitHub `VERCEL_DEPLOY_HOOK_URL` ; l'action l'appelle après le commit. N'utilisez pas les deux à la fois (double déploiement).
- Si la branche principale est protégée, autorisez `github-actions[bot]` à y pousser.

### Mettre à jour les sondages à la main

1. Ajoutez le sondage dans `polls` avec **toutes** ses hypothèses, en reprenant les scores tels que publiés. Les candidats non simulés sont permis s'ils figurent dans `otherCandidates`.
2. Renseignez les sources (`sources`) et, si vous avez recoupé les chiffres avec la publication de l'institut, le champ `verified`.
3. Mettez à jour `asOf` (date de référence de la fenêtre).
4. Lancez `bun run test` : la validation détecte un candidat inconnu, une date incohérente ou une ligne de reports qui ne totalise pas 100.
5. Redéployez.

Les sondages trop anciens restent dans le fichier : la page les affiche comme « hors de la fenêtre » ou « remplacé ».

## Déploiement sur Vercel

Le dépôt se déploie tel quel. `vercel.json` fixe le preset Vite, les commandes bun et la réécriture vers `index.html`, nécessaire pour l'accès direct à `/methodologie`. Le site est servi depuis `dist/`.

- Connectez le dépôt à Vercel, ou lancez `bunx vercel` pour un déploiement d'aperçu.
- Les URL Vercel sont publiques par défaut. Pour un usage interne, activez la *Deployment Protection*.

## Précautions

- La publication d'une simulation fondée sur des sondages peut relever de la loi n° 77-808 du 19/07/1977 relative aux sondages : notices, période de silence électoral la veille et le jour du scrutin. Faites valider la diffusion publique par un juriste.
- Les valeurs marquées « hypothèse » ne viennent d'aucune source. Elles sont visibles dans la méthodologie et modifiables dans les réglages.
