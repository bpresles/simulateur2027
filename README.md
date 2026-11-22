# simulateur2027 : simulateur probabiliste de la présidentielle 2027

Ce simulateur reconstruit les scénarios de 1er et 2nd tour de l'élection présidentielle de 2027 selon une méthode sobre, sourcée et auditée sur les présidentielles 2017 et 2022 et les agrégats des législatives 2024 :

1. **Premier tour pondéré et projection d'offre.** On conserve le dernier sondage de chaque institut sur la période la plus récente, pondéré par sa fraîcheur (demi-vie de **14 jours**) et sa taille d'échantillon (plafonnée à **2 000** répondants). Les candidats testés quasi systématiquement (y compris David Lisnard, présent dans 7 instituts sur 8) sont traités comme candidats principaux ; un petit candidat n'entre dans l'offre de base que s'il est testé par au moins **3 instituts distincts**, avec donneurs mesurés uniquement sur des paires strictement *ceteris paribus* (un seul candidat d'écart au sein d'un même sondage). Lorsqu'un institut récent ne teste pas exactement l'offre cible (distance ≤ 2 candidats), son hypothèse la plus propre est projetée en redistribuant 100 % des transferts mesurés sur paires propres intra-institut (option activée par défaut).
2. **Alliances testées uniquement.** Seules les alliances (et combinaisons) effectivement testées par au moins un sondage de la période sont proposées : activer une alliance sélectionne les hypothèses où le candidat rallié est absent et où son leader reste seul candidat principal de son camp.
3. **Projection temporelle vers avril 2027 (activée par défaut).** Projette le vote utile intra-bloc par bloc (réglable dans les réglages avancés), avec bascule directe en un clic vers la photographie actuelle (« Aujourd'hui »). L'amortissement vers les fondamentaux (`meanReversion`) et la tendance récente amortie (`dampedTrend`) restent désactivés par défaut à `0 %` et disponibles en option.
4. **Second tour unifié en flux bruts (% des inscrits) et front républicain (2022 ↔ 2024).** Chaque électorat exprimé du 1er tour applique directement ses taux de report (fidélité différenciée pour les finalistes : 96 % Le Pen, 92 % Mélenchon, 95 % par défaut). Pour les duels face au RN, la base historique interpole directement sur échelle logit entre **deux repères mesurés** — **Présidentielle 2022 (`0 %`)** et **Législatives 2024 (`100 %`, défaut provisoire)** — sans extrapolation sous 2022. Le report non mesuré **gauche hors LFI → Mélenchon** (`lfi_rn.gauche`) dispose d'un curseur dédié (défaut provisoire `72 %`), d'une analyse de sensibilité affichée sur les duels LFI–RN et d'un tirage uniforme explicite `[35 % ; 75 %]` dans Monte-Carlo. Les duels gauche vs centre/droite hors RN utilisent les présidentielles 2007–2012 ; les déclarations 2027 corrigées en logit restent activables en option. Les abstentionnistes du 1er tour mobilisés au 2nd sont modélisés explicitement (`P = 74 %`, mobilisation `a = 20 %`, orientation anti-RN `55 %` face au RN et `50 %` hors RN).
5. **Incertitude Monte-Carlo et validation historique.** À chaque calcul, 2 000 tirages déterministes (graine `2027`) propagent la volatilité de campagne (distribution Student-t(8) en log-ratio, règle écrite `σ_ref = 0,595` à J−156, plancher `0,14`), l'incertitude des reports (Dirichlet `κ = 40`, choc front républicain 2022↔2024, tirage uniforme `[35 % ; 75 %]` sur gauche hors LFI → Mélenchon, choc commun national) et, activée par défaut hors alliance forcée, l'incertitude sur les candidatures au centre et à droite (5 offres pondérées). La page `/methodologie` distingue explicitement les validations **hors échantillon** des contrôles internes / de calibration (dont la couverture empirique des intervalles à 80 % sur 2017 et 2022).

> Ceci est une simulation fondée sur des sondages publiés et des hypothèses explicites. Ce n'est ni un sondage ni une prévision.

## Stack

- **Vite, React 19, TypeScript** (strict) et **Tailwind CSS v4** : SPA statique.
- **Radix UI** (composants accessibles) et **Motion** (animations).
- **Zustand** (`persist`) pour les réglages locaux (`localStorage`, version 16).
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
            campaignProjection, transfers, newVoters, secondRound, backtest, monteCarlo, simulate.
  data/     Fichiers JSON sourcés + validation Zod et contrôles croisés (schema.ts).
  sync/     Synchronisation Wikipedia, flux RSS d'instituts et notices (scripts/sync-polls.ts).
  state/    Réglages utilisateur persistés (settingsStore.ts, v16).
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
| `src/data/transfers-legislatives-2024.json` | Fidélité différenciée, profils Ipsos-Talan 2024 (ancre 100 %), enquêtes « jour du vote » présidentielles 2017–2022 (ancre 0 % = 2022) et 2007–2012 (hors RN). |
| `src/data/transfers-2027-declared.json` | Option activable : reports déclarés 2026 (Harris Interactive / Odoxa) et paramètres de correction logit multinomial. |
| `src/data/second-round-dropout.json` | Totaux agrégés des 342 duels des législatives 2024 (contrôle interne), repères présidentiels 2002–2012 et statistiques nouveaux votants (Ifop 2022, Insee). |
| `src/data/second-round-poll-bias.json` | Écart historique des sondages directs de 2nd tour (2017 et 2022), affiché à titre informatif uniquement. |

## Synchronisation automatique

`.github/workflows/sync-polls.yml` exécute `bun run sync-polls` chaque jour à 06:17 UTC : le script lit la période la plus récente de la page Wikipedia des sondages 2027 (avec pont glissant de 21 jours entre sections consécutives et reconnaissance des sections « liste officielle »), archive une hypothèse cohérente par vague dans l'historique, rattache les liens vers les synthèses et notices officielles (1er et 2nd tours), promeut automatiquement un nouveau candidat seulement s'il est testé par au moins **3 instituts distincts**, ouvre une issue non bloquante en cas d'alerte structurelle (retrait/remplacement majeur, bascule vers la liste officielle), valide le schéma et lance tests + build avant de commiter. En cas de retrait majeur avant mise à jour manuelle, le simulateur bascule automatiquement sur l'offre majoritaire des sondages récents et désactive l'incertitude pré-campagne des candidatures une fois la liste officielle publiée.

## Précautions

- La publication d'une simulation fondée sur des sondages peut relever de la loi n° 77-808 du 19/07/1977 relative aux sondages (notices, période de silence électoral).
- Les sondages directs de 2nd tour 2027 ne sont jamais utilisés pour recalibrer les paramètres par défaut du modèle.
- Chaque modification d'un réglage par défaut est consignée dans `docs/changelog-methode.md` avant examen de son effet sur 2027.
