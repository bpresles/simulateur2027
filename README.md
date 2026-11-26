# simulateur2027 : simulateur probabiliste de la présidentielle 2027

Ce simulateur reconstruit les scénarios de 1er et 2nd tour de l'élection présidentielle de 2027 selon une méthode sobre, sourcée et auditée sur les présidentielles 2012, 2017 et 2022 et les agrégats des législatives 2024 :

1. **Premier tour pondéré et projection d'offre.** On conserve le dernier sondage de chaque institut sur la période la plus récente, pondéré par sa fraîcheur (demi-vie de **14 jours**) et sa taille d'échantillon (plafonnée à **2 000** répondants). Les candidats testés quasi systématiquement (y compris David Lisnard, présent dans 7 instituts sur 8) sont traités comme candidats principaux ; un petit candidat n'entre dans l'offre de base que s'il est testé par au moins **3 instituts distincts**, avec donneurs mesurés uniquement sur des paires strictement *ceteris paribus* (un seul candidat d'écart au sein d'un même sondage). Lorsqu'un institut récent ne teste pas exactement l'offre cible (distance ≤ 2 candidats), son hypothèse la plus propre est projetée en redistribuant 100 % des transferts mesurés sur paires propres intra-institut (option activée par défaut).
2. **Alliances testées uniquement.** Seules les alliances (et combinaisons) effectivement testées par au moins un sondage de la période sont proposées : activer une alliance sélectionne les hypothèses où le candidat rallié est absent et où son leader reste seul candidat principal de son camp.
3. **Projection temporelle vers avril 2027 (activée par défaut).** Limite connue : en validation croisée, elle ne bat pas la moyenne brute sur les trois élections (au 23/11/2026 : égalité en 2012, moins bien en 2017, mieux en 2022) ; elle reste activée par défaut par choix éditorial (décision du 23/11/2026). Projette le vote utile intra-bloc par bloc (réglable dans les réglages avancés), avec bascule directe en un clic vers la photographie actuelle (« Aujourd'hui »). L'amortissement vers les fondamentaux (`meanReversion`) et la tendance récente amortie (`dampedTrend`) restent désactivés par défaut à `0 %` et disponibles en option.
4. **Second tour unifié en flux bruts (% des inscrits) et front républicain à 3 ancres (`2022 ↔ 2017 ↔ 2024`, v2.3).** Chaque électorat exprimé du 1er tour applique directement ses taux de report. En base historique (par défaut), la fidélité des finalistes est **symétrique et neutre** (`94,75 / 1,75 / 3,50 %`, moyenne des finalistes mesurés en 2022, sans paramètre par candidat ; les fidélités déclarées Harris 2026 sont isolées dans `transfers-2027-declared.json` et corrigées en logit en mode Déclarations 2027). Les électeurs d'extrême droite hors finaliste RN reçoivent la moyenne mesurée admissible R1.8 (`18,25 / 52,75 / 29 %`, tirée uniformément entre Dupont-Aignan 2017 et Zemmour 2022 dans Monte-Carlo). Pour les duels face au RN, la base historique interpole sur échelle logit linéaire par morceaux entre **trois ancres mesurées** — **Présidentielle 2022 (`0 %`)**, **Présidentielle 2017 (`55 %`, `s_2017 = 0,5502`)** et **Législatives 2024 (`100 %`, défaut maintenu par décision explicite)** — sans extrapolation. Le report non mesuré **gauche hors LFI → Mélenchon** (`lfi_rn.gauche`) est piloté par le curseur gauche, complété par une analyse de sensibilité et un tirage `[35 % ; 75 %]` dans Monte-Carlo. Les duels hors RN utilisent les présidentielles 2007–2012. Les non-exprimés du 1er tour (abstention + blancs/nuls unifiés) se mobilisent à `a = 22,5 %` (Insee 2017–2022 ajusté blancs/nuls ; plage MC `±8,5 pts`) avec une **orientation endogène neutre** par défaut (miroir exact du partage T2 des exprimés du 1er tour, ajustable manuellement face au RN).
5. **Incertitude Monte-Carlo et validation historique.** À chaque calcul, 2 000 tirages déterministes (graine `2027`) propagent la volatilité de campagne (distribution Student-t(8) en log-ratio, `σ_ref = 0,825` à J−156, plancher `0,14`, retenu comme la valeur dont la couverture [P10 ; P90] des scores de 1er tour, en moyenne par élection sur 2012, 2017 et 2022 (J−150 à J−24), est la plus proche de 80 % (79,8 %) ; limites : couverture tous points confondus de 68,8 % seulement (IC 95 % [60,4 ; 76,4] %), choix instable en leave-one-out (σ de 0,30 à 1,115 selon l'élection exclue), CRPS publié en diagnostic, voir `scripts/calibrate-sigma.ts` et `src/data/sigma-calibration.json`), l'incertitude des reports (Dirichlet `κ = 40`, choc front républicain 3 ancres, tirage uniforme `[35 % ; 75 %]` sur gauche hors LFI → Mélenchon, tirage uniforme ED 2017 ↔ 2022, mobilisation `±8,5 pts`, orientation `±8 pts`, choc commun national `σ_η = 3,0 pts` face au RN et `2,0 pts` hors RN, conservés après l'audit P3 du 26/11/2026) et, activée par défaut hors alliance forcée, l'incertitude sur les candidatures au centre et à droite (5 offres pondérées). La page `/methodologie` distingue explicitement les validations **hors échantillon** (dont le leave-one-out R2.4 sur les 3 ancres, la largeur et le CRPS du 2nd tour) des contrôles internes / de calibration, archive l'audit P1 du 24/11/2026, documente l'adoption explicite de v2.3 (P1-bis + P2) et publie l'audit P3 (décomposition de variance du 2nd tour et courbe CRPS de `σ_η`, `src/data/second-round-p3-audit.json` ; voir `docs/changelog-methode.md`). Hypothèses non sourcées, avec plage de sensibilité : fuite inter-blocs `0,12` (`0,06–0,18`), concentration du centre `0,75` (`0,65–0,85`), poids des scénarios de candidatures (poids uniformes en alternative). Préréglage « Incertain » du front républicain (tirage uniforme commun sur les 3 ancres ; défaut maintenu à `leg2024`), alerte d'écart aux sondages directs (> 2 × RMSE historique), comportement implicite des sans-intention et tableau de sensibilité repliable (sans Monte-Carlo).

> Ceci est une simulation fondée sur des sondages publiés et des hypothèses explicites. Ce n'est ni un sondage ni une prévision.

## Stack

- **Vite, React 19, TypeScript** (strict) et **Tailwind CSS v4** : SPA statique.
- **Radix UI** (composants accessibles) et **Motion** (animations).
- **Zustand** (`persist`) pour les réglages locaux (`localStorage`, version 18).
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
bun run sync-polls    # synchronise les sondages depuis Wikipedia et les flux RSS/notices
bun run check-notices # outil local : liste les notices de 2nd tour sans noIntention + fraîcheur reports 2027
```

## Architecture

```text
src/
  domain/   Calcul pur en TypeScript (sans React) : pollAverage, offerProjection, alliances,
            campaignProjection, transfers, newVoters, secondRound, backtest, sensitivity, monteCarlo, simulate.
  data/     Fichiers JSON sourcés + validation Zod et contrôles croisés (schema.ts).
  sync/     Synchronisation Wikipedia, flux RSS d'instituts et notices (scripts/sync-polls.ts).
  state/    Réglages utilisateur persistés (settingsStore.ts, v18).
  hooks/    useSimulation(), backtestReport, newVoterReferenceRates.
  ui/       Composants React, graphiques (Sankey, trajectoire, barres 0–100 % + IC 80 %), page /methodologie.
docs/
  changelog-methode.md        Journal daté des évolutions méthodologiques et choix par défaut.
  resume-refonte-2026-11-22.md Synthèse détaillée des refontes v2 / v2.1.
```

## Données

| Fichier | Contenu |
|---|---|
| `src/data/polls-2027.json` | Candidats (dont petits candidats `minor`), jeux d'hypothèses, alliances testables, sondages 1er tour et repères directs 2nd tour (`noIntention`). |
| `src/data/polls-history-2027.json` | Historique des vagues de sondages 2025–2027 (une seule hypothèse cohérente par vague avec Le Pen + Mélenchon et ≥ 75 % de masse simulée) pour la trajectoire temporelle. |
| `src/data/reference-2017.json`, `src/data/reference-2022.json` | Résultats officiels des deux tours et sondages de 2017 et 2022 (utilisés uniquement pour le backtest et la règle d'écart-type de campagne). |
| `src/data/transfers-legislatives-2024.json` | Fidélité symétrique neutre (94,75/1,75/3,50 %, S3), profils Ipsos-Talan 2024 (ancre 100 %), enquêtes « jour du vote » admissibles R1.8 2017 (ancre 55 %) et 2022 (ancre 0 %), ligne ED mesurée S4 et 2007–2012 (hors RN). |
| `src/data/transfers-2027-declared.json` | Option activable : reports et fidélités déclarés 2026 (Harris Interactive / Odoxa) et paramètres de correction logit multinomial. |
| `src/data/reference-2012.json` | Présidentielle 2012 (deux tours, Conseil constitutionnel) pour le backtest. |
| `src/data/second-round-dropout.json` | Totaux agrégés des 342 duels des législatives 2024 (contrôle interne), repères présidentiels 2002–2012 et statistiques nouveaux votants (Ifop 2022, Insee). |
| `src/data/second-round-poll-bias.json` | Sondages directs de 2nd tour (2017 et 2022) avant le 1er tour (`avantPremierTour`, pour l'écart historique et le RMSE) et entre les deux tours (`entreDeuxTours`, affichés pour mémoire uniquement) ; jamais utilisés dans les calculs. |
| `src/data/legislative-duel-polls-2024.json` | Sondages de circonscription d'entre-deux-tours des législatives 2024 (duels uniquement) et table explicite `candidateParties`, affichés pour les seuls duels de partis strictement identiques (P4) ; jamais utilisés dans les calculs. |
| `src/data/second-round-reference-matrices.json` | Matrices brutes de reports des enquêtes Ipsos et Ifop (2017 et 2022) utilisées pour les audits P1 / P1-bis / P2 / P3. |
| `src/data/second-round-p3-audit.json` | Audit P3 (décomposition de variance du 2nd tour et courbe CRPS conditionnelle de `σ_η` sur `[0 ; 5]`, produit par `scripts/evaluate-p3.ts --write`). |

## Synchronisation automatique

`.github/workflows/sync-polls.yml` exécute `bun run sync-polls` chaque jour à 06:17 UTC : le script lit la période la plus récente de la page Wikipedia des sondages 2027 (avec pont glissant de 21 jours entre sections consécutives et reconnaissance des sections « liste officielle »), archive une hypothèse cohérente par vague dans l'historique, rattache les liens vers les synthèses et notices officielles (1er et 2nd tours), promeut automatiquement un nouveau candidat seulement s'il est testé par au moins **3 instituts distincts**, ouvre une issue non bloquante en cas d'alerte structurelle (retrait/remplacement majeur, bascule vers la liste officielle), valide le schéma et lance tests + build avant de commiter. En cas de retrait majeur avant mise à jour manuelle, le simulateur bascule automatiquement sur l'offre majoritaire des sondages récents et désactive l'incertitude pré-campagne des candidatures une fois la liste officielle publiée.

## Précautions

- La publication d'une simulation fondée sur des sondages peut relever de la loi n° 77-808 du 19/07/1977 relative aux sondages (notices, période de silence électoral).
- Les sondages directs de 2nd tour 2027 ne sont jamais utilisés pour recalibrer les paramètres par défaut du modèle.
- Chaque modification d'un réglage par défaut est consignée dans `docs/changelog-methode.md` avant examen de son effet sur 2027.
