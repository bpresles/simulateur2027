# simulateur2027 : simulateur probabiliste de la présidentielle 2027

Ce simulateur reconstruit les scénarios de 1er et 2nd tour de l'élection présidentielle de 2027 selon une méthode sobre, sourcée et validée hors échantillon sur 2017, 2022 et les agrégats des législatives 2024 :

1. **Premier tour pondéré et projection d'offre.** On conserve le dernier sondage de chaque institut sur la période la plus récente, pondéré par sa fraîcheur (demi-vie de **14 jours**) et sa taille d'échantillon (plafonnée à **2 000** répondants). Un petit candidat n'entre dans l'offre de base que s'il est testé par au moins **3 instituts distincts**, et ses donneurs ne sont mesurés que sur des paires strictement *ceteris paribus* (un seul candidat d'écart au sein d'un même sondage). Lorsqu'un institut récent ne teste pas exactement l'offre cible (ex. Odoxa ou Cluster17 sans Gabriel Attal sur leur hypothèse principale), son hypothèse la plus propre est projetée via les paires propres intra-institut (option activée par défaut).
2. **Alliances testées uniquement.** Seules les alliances (et combinaisons) effectivement testées par au moins un sondage de la période sont proposées : activer une alliance sélectionne les hypothèses où le candidat rallié est absent et où son leader reste seul candidat principal de son camp.
3. **Second tour unifié en flux bruts (% des inscrits) et front républicain.** Chaque électorat exprimé du 1er tour applique directement ses taux de report (fidélité différenciée pour les finalistes : 96 % Le Pen, 92 % Mélenchon, 95 % par défaut ; base historique des législatives 2024 d'Ipsos-Talan transposée en scrutin présidentiel d'après 2017–2022 et modulée de façon homogène sur les **4 types de duels face au RN** par la force du *front républicain*, réglable globalement et séparément pour Centre/Droite, Gauche modérée et LFI ; présidentielles 2007–2012 pour les duels gauche vs centre/droite hors RN ; option activable pour les déclarations 2027 corrigées sur échelle logit multinomial). Les abstentionnistes du 1er tour mobilisés au 2nd sont modélisés explicitement (`P = 74 %`, mobilisation `a = 20 %`, orientation anti-RN ancrée à `55 %` au niveau 2022 et modulée par le front républicain du duel).
4. **Incertitude Monte-Carlo et validation historique.** À chaque calcul, 2 000 tirages déterministes (graine `2027`) propagent la volatilité de campagne (distribution Student-t(8) en log-ratio calibrée sur 2017 et 2022) et l'incertitude des reports (Dirichlet `κ = 40` + choc commun national), produisant des probabilités de qualification, des probabilités de victoire et des intervalles à 80 % (P10–P90). La page `/methodologie` expose un backtest automatisé sur 2017, 2022 et les 342 duels des législatives 2024.

> Ceci est une simulation fondée sur des sondages publiés et des hypothèses explicites. Ce n'est ni un sondage ni une prévision.

## Stack

- **Vite, React 19, TypeScript** (strict) et **Tailwind CSS v4** : SPA statique.
- **Radix UI** (composants accessibles) et **Motion** (animations).
- **Zustand** (`persist`) pour les réglages locaux (`localStorage`).
- **Zod** pour la validation des données JSON au chargement.
- **Vitest** pour les tests et **bun** comme gestionnaire de paquets.

## Commandes

```bash
bun install
bun run dev        # serveur de développement
bun run typecheck  # vérification TypeScript
bun run lint       # ESLint
bun run test       # tests unitaires, domaine, backtest et UI
bun run build      # vérification TypeScript + build de production dans dist/
bun run preview    # sert dist/ en local
bun run sync-polls # synchronise les sondages depuis Wikipedia et les flux RSS/notices
```

## Architecture

```text
src/
  domain/   Calcul pur en TypeScript (sans React) : pollAverage, offerProjection, alliances,
            transfers, newVoters, secondRound, backtest, monteCarlo, simulate.
  data/     Fichiers JSON sourcés + validation Zod et contrôles croisés (schema.ts).
  sync/     Synchronisation Wikipedia, flux RSS d'instituts et notices (scripts/sync-polls.ts).
  state/    Réglages utilisateur persistés (settingsStore.ts, v13).
  hooks/    useSimulation(), backtestReport, newVoterReferenceRates.
  ui/       Composants React, graphiques (Sankey, barres + IC 80 %), page /methodologie.
docs/
  changelog-methode.md  Journal daté des évolutions méthodologiques et choix paramétriques.
```

## Données

| Fichier | Contenu |
|---|---|
| `src/data/polls-2027.json` | Candidats (dont petits candidats `minor`), jeux d'hypothèses, alliances testables, sondages 1er tour et repères directs 2nd tour (`noIntention`). |
| `src/data/polls-history-2027.json` | Historique agrégé des vagues de sondages 2025–2027 (extrait automatiquement de Wikipedia via `sync-polls`) pour la courbe d'évolution temporelle et la tendance récente amortie. |
| `src/data/reference-2017.json`, `src/data/reference-2022.json` | Résultats officiels des deux tours et sondages de 2017 et 2022 (utilisés uniquement pour le backtest et le calibrage de la variance). |
| `src/data/transfers-legislatives-2024.json` | Fidélité différenciée, profils Ipsos-Talan 2024, enquêtes « jour du vote » présidentielles 2017–2022 (centre–RN) et 2007–2012 (hors RN). |
| `src/data/transfers-2027-declared.json` | Option activable : reports déclarés 2026 (Harris Interactive / Odoxa) et paramètres de correction logit multinomial. |
| `src/data/second-round-dropout.json` | Totaux agrégés des 342 duels des législatives 2024 (contrôle de cohérence), repères présidentiels 2002–2012 et statistiques nouveaux votants (Ifop 2022, Insee). |
| `src/data/second-round-poll-bias.json` | Écart historique des sondages directs de 2nd tour (2017 et 2022), affiché à titre informatif uniquement. |

## Synchronisation automatique

`.github/workflows/sync-polls.yml` exécute `bun run sync-polls` chaque jour à 06:17 UTC : le script lit la période la plus récente de la page Wikipedia des sondages 2027, rattache les liens vers les synthèses et notices officielles, promeut automatiquement un nouveau candidat seulement s'il est testé par au moins **3 instituts distincts**, valide le schéma et lance tests + build avant de commiter `src/data/polls-2027.json`.

## Précautions

- La publication d'une simulation fondée sur des sondages peut relever de la loi n° 77-808 du 19/07/1977 relative aux sondages (notices, période de silence électoral).
- Les sondages directs de 2nd tour 2027 ne sont jamais utilisés pour recalibrer les paramètres par défaut du modèle.
