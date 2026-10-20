# simulateur2027 : simulateur de la présidentielle 2027

Ce simulateur calcule l'élection présidentielle de 2027 en trois temps :

1. **Premier tour.** On part de la moyenne des derniers sondages (dernier sondage de chaque institut sur la période la plus récente de la liste des sondages de Wikipedia) ; des cases à cocher, triées du plus récent au plus ancien, permettent de choisir les sondages retenus (tous par défaut ; un seul coché sert tel quel, sans moyenne) parmi ceux qui testent l'hypothèse retenue (« Philippe + Attal » par défaut). Les alliances ne passent pas par des taux de report : activer une alliance retient les hypothèses qui testent tous les autres candidats simulés sans le rallié (ni personne à sa place), et seuls les sondages qui en ont une. Pour qu'une absence vaille ralliement, le leader doit rester le seul candidat principal de leur camp (leurs blocs) : Philippe absent alors qu'Attal reste en lice ne dit pas que ses électeurs suivent Glucksmann. Ne sont proposées que les alliances (ou combinaisons, activées ensemble) que les sondages de la période testent : la liste suit la synchronisation. Une option, désactivée par défaut (« Permettre de tester des alliances non évaluées par les sondeurs »), ouvre tout le catalogue : une alliance qu'aucune hypothèse ne teste est alors estimée en appliquant à la base les reports des législatives 2024 (part qui suit le leader, part RN, abstention, réglable par alliance) ; les alliances testées restent lues dans les sondages, sondage par sondage : chaque sondage utilise la plus grande combinaison d'alliances actives qu'il teste, seules les autres y sont estimées, puis les groupes de sondages sont moyennés au prorata de leur nombre d'instituts. En option, on la projette jusqu'aux derniers sondages avant le vote en reproduisant, avec une intensité réglable, la progression observée en 2022 à la même distance du scrutin (sondages de l'automne 2021). Par défaut, on la corrige strictement de l'écart relatif réel de 2022 entre les derniers sondages et le résultat officiel, avec sa propre intensité : appliquée aux sondages de 2022, la correction redonne exactement le résultat. Les alliances incompatibles sont exclues : un candidat ne rallie qu'une alliance, et un candidat rallié n'en mène pas d'autre.
2. **Qualification.** Les deux candidats en tête du premier tour simulé passent au second tour.
3. **Second tour.** Par défaut, on applique strictement les reports de voix mesurés aux législatives 2024 (enquête Ipsos-Talan publiée par franceinfo le 07/07/2024), selon le type de duel ; pour une alliance estimée, on mélange les profils de ses membres selon leur poids. Le niveau global des blancs, nuls et abstentions est calé sur le niveau réel du second tour 2022 (Conseil constitutionnel).

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

`bun run sync-polls` met à jour `src/data/polls-2027.json` à partir d'une seule source, la page Wikipedia [« Liste de sondages sur l'élection présidentielle française de 2027 »](https://fr.wikipedia.org/wiki/Liste_de_sondages_sur_l%27%C3%A9lection_pr%C3%A9sidentielle_fran%C3%A7aise_de_2027) (wikitext de la page, licence CC BY-SA 4.0), qui compile tous les sondages avec un lien vers leur notice à la Commission des sondages. Les chiffres ne sont pas revérifiés dans ces notices.

Le script :

1. lit les tableaux du 1er tour et retient la **période la plus récente** (actuellement « Octobre-décembre 2026 ») : celle dont un sondage se termine le plus tard, quel que soit son titre, pour s'adapter à l'ouverture d'une nouvelle période. La section « Autres » (vote blanc compté comme exprimé) est ignorée ;
2. lit chaque ligne comme une **hypothèse** : colonnes des candidats, candidat nommé dans la colonne d'un autre (Hollande dans la colonne de Glucksmann : il le remplace, ce qui est noté dans `replacing`), colonne « Autres » à plusieurs candidats, « <1 » compté pour 0,5 ; les lignes au total éloigné de 100 (± 3 points, ± 1 au 2nd tour), décalées ou d'un institut inconnu sont écartées et signalées ;
3. réunit les blocs d'un même sondage (même institut, même fin de terrain, par exemple un bloc par commanditaire) et ne garde que le **dernier sondage de chaque institut** sur la période ; le commanditaire est lu dans le nom de la notice. Un sondage déjà présent garde son identifiant (les sondages décochés le restent). Une saisie manuelle de la période est conservée si elle est plus récente que le sondage de son institut sur la page ;
4. reprend les duels de 2nd tour de la période entre candidats simulés, le dernier par institut et par duel ;
5. remplace les sondages des données par cette sélection, et la période (`period`) remplace la fenêtre glissante de `windowDays` ; le fichier (et la date de référence `asOf`) ne change que si la page change ;
6. valide le résultat avec le même schéma que l'application, et échoue sans rien modifier si la page est injoignable ou si son format n'est plus reconnu.

Les tests qui vérifient des chiffres précis utilisent un instantané figé (`src/data/__fixtures__/polls-2027-20261018.json`) : une synchronisation ne les casse donc pas. Les données vivantes sont contrôlées par `src/data/data.test.ts`.

### GitHub Action et redéploiement

`.github/workflows/sync-polls.yml` lance la synchronisation chaque jour à 06:17 UTC (et à la demande depuis l'onglet Actions). Si les données changent, elle exécute les tests et le build, puis commite `src/data/polls-2027.json` sur la branche principale.

- **Dépôt relié à Vercel par Git (recommandé)** : ce push déclenche le déploiement de production, rien d'autre à configurer.
- **Sans intégration Git** : créez un *Deploy Hook* dans Vercel (Project Settings → Git → Deploy Hooks) et enregistrez son URL dans le secret GitHub `VERCEL_DEPLOY_HOOK_URL` ; l'action l'appelle après le commit. N'utilisez pas les deux à la fois (double déploiement).
- Si la branche principale est protégée, autorisez `github-actions[bot]` à y pousser.

### Mettre à jour les sondages à la main

1. Ajoutez le sondage dans `polls` avec **toutes** ses hypothèses, en reprenant les scores tels que publiés. Les candidats non simulés sont permis s'ils figurent dans `otherCandidates`.
2. Renseignez les sources (`sources`) et, si vous avez recoupé les chiffres avec la publication de l'institut, le champ `verified`.
3. Mettez à jour `asOf` (date de référence).
4. Lancez `bun run test` : la validation détecte un candidat inconnu, une date incohérente ou une ligne de reports qui ne totalise pas 100.
5. Redéployez.

Une saisie manuelle (sans `origin`) reste en place tant qu'elle est plus récente que le sondage de son institut sur la page Wikipedia ; la synchronisation la remplace ensuite, et la retire quand une nouvelle période commence.

## Déploiement sur Vercel

Le dépôt se déploie tel quel. `vercel.json` fixe le preset Vite, les commandes bun et la réécriture vers `index.html`, nécessaire pour l'accès direct à `/methodologie`. Le site est servi depuis `dist/`.

- Connectez le dépôt à Vercel, ou lancez `bunx vercel` pour un déploiement d'aperçu.
- Les URL Vercel sont publiques par défaut. Pour un usage interne, activez la *Deployment Protection*.

## Précautions

- La publication d'une simulation fondée sur des sondages peut relever de la loi n° 77-808 du 19/07/1977 relative aux sondages : notices, période de silence électoral la veille et le jour du scrutin. Faites valider la diffusion publique par un juriste.
- Les valeurs marquées « hypothèse » ne viennent d'aucune source. Elles sont visibles dans la méthodologie et modifiables dans les réglages.
