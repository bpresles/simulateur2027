# Journal méthodologique — simulateur2027

## 22 novembre 2026 — Refonte v2 : suppression des biais déterministes, moteur unifié en flux bruts et incertitude Monte-Carlo

Cette version remplace la chaîne déterministe précédente (v1) à la suite d'un audit critique complet des données historiques (2017, 2022, 2024) et du code source.

### 1. Stratégies et modules supprimés

Les mécanismes suivants ont été intégralement retirés car les tests hors échantillon sur 2017, 2022 et 2024 ont montré qu'ils dégradaient la précision ou introduisaient des biais méthodologiques structurels :

- **Correction « biais du billet de blog » (`blogBias.ts`)** : l'effet mesuré en 2022 reposait en grande partie sur un artefact de filtrage (`withOthers: false`, qui excluait Arnaud Montebourg à 2–4 % et renormalisait mécaniquement la gauche à la hausse), changeait de signe selon la fenêtre de campagne et ne comptait aucun sondage exploitable à certaines dates en 2017.
- **Corrections et progressions par candidat 2017–2022 (`corrections.ts`, `progression.ts`, `references.ts`, `pastElections.ts`, `calibration.ts`)** : projeter les erreurs ou dynamiques d'un scrutin passé (n = 1 à 2 élections) vers un autre scrutin augmente le RMSE hors échantillon (en 2017, la correction croisée par ratio double presque l'erreur : 1,18 pt contre 0,58 pt pour les sondages bruts). Les fichiers `reference-2017.json` et `reference-2022.json` sont conservés exclusivement pour le backtest et le calibrage de l'incertitude.
- **Inférence écologique non contrainte de Goodman (`transferCorrection.ts`)** : la régression OLS sur les circonscriptions de 2024 produisait des estimations hors bornes (`−8,8 % / 107,3 %`) qui étaient rejetées sur les blocs des finalistes mais conservées sur les blocs colinéaires (`centre`, `droite`), gonflant artificiellement le score du challenger de +4 à +5 pts. À l'inverse, l'enquête Ipsos-Talan brute concorde à ~0,6–1,3 pt près avec les totaux réels agrégés des 342 duels de 2024.
- **Redressement de participation au 1er tour (`turnout.ts`, `sync/turnout.ts`, `turnout-certainty.json`, dépendance `unpdf`)** : la transposition d'un indicateur de certitude de vote 5 mois avant le scrutin sur le vote 2022 des abstentionnistes de 2017 n'était pas identifiée et ajoutait un scraping PDF fragile dans la synchronisation.
- **Mode d'abandon « par camps » (`campDropout`) et recalibrage post-hoc `u = N / X`** : le mode « camps » écrasait par exemple l'abstention des électeurs de Raphaël Glucksmann de 25 % à 2,0 % dans un duel Le Pen – Mélenchon, tandis que `grossFlows()` déformait les taux affichés pour réconcilier un calcul net avec les nouveaux votants.
- **Alliances non testées / groupées estimées par les reports T2 2024 (`allianceSplit2024`)** : transposer des reports de second tour face au RN à des fusions de premier tour était méthodologiquement incohérent (et renvoyait un report de 100 % lorsque le RN menait une alliance). Seules les alliances effectivement testées par les sondeurs sont conservées.

### 2. Améliorations et corrections introduites

1. **Agrégation du 1er tour (`pollAverage.ts`, `offerProjection.ts`)** :
   - Pondération exponentielle **demi-vie = 14 jours** × racine de la taille d'échantillon plafonnée à **2 000** répondants.
   - Seuil minimal de **3 instituts distincts** (`MIN_MINOR_INSTITUTES = 3`) pour qu'un petit candidat entre dans l'offre de base (et dans la promotion automatique `sync.ts`).
   - Correction du bug d'attribution dans `observedDonors` : seules les paires strictement *ceteris paribus* (`|a \ b| = 1`, `|b \ a| = 0`) sont retenues, supprimant l'imputation erronée de voix RN aux petits candidats.
   - **Projection d'offre intra-institut** (`offerProjection.ts`) : réintègre les sondages récents dont l'offre diffère de 1 à 2 candidats (ex. Odoxa n = 12 005 et Cluster17 sur hypothèse propre sans H4) en appliquant les transferts mesurés sur paires exactes mono-candidat.
2. **Moteur unifié du 2nd tour en flux bruts (`secondRound.ts`, `transfers.ts`)** :
   - Calcul direct en **% des électeurs inscrits** (`V_A = E₁ · Σ x_c · π_{c→A} + (100 − P) · a · q_A`, identité comptable exacte `A + B + nonExpressed + blankNull1 = 100 %`).
   - Fidélité différenciée par finaliste (Le Pen 96/1/3, Mélenchon 92/2/6, défaut 95/1,5/3,5 ; surcharge uniforme possible dans les réglages).
   - **Modèle homogène du front républicain (vote de rejet du RN) sur les 4 profils** (remplaçant le mélange 50/50 limité au seul `ensemble_rn`) : transposition logit des législatives 2024 vers le contexte présidentiel d'après l'écart empirique mesuré sur 2017–2022, puis modulation par la force du front républicain (`100 %` = 2017, `75 %` = 2022, `0 %` = effacé ; défaut 2027 érodé : `55 %` Centre/Droite, `50 %` Gauche modérée, `35 %` LFI), couplée à l'orientation des nouveaux votants et propagée dans Monte-Carlo (`σ = 15 pts`). Corrige l'anomalie précédente où un candidat LR bénéficiait d'un meilleur report de gauche qu'un candidat du centre.
   - **Duels hors RN** (gauche vs centre/droite) calibrés sur les enquêtes « jour du vote » des présidentielles 2007 et 2012 (matrice symétrique réservée aux duels de même camp).
   - **Option déclarations 2027 corrigées en logit multinomial** (`transfers-2027-declared.json`, désactivée par défaut) : permet d'explorer les tableaux Harris/Odoxa 2026 redressés de l'écart campagne → jour du vote (2017–2022) sans jamais les imposer par défaut ni recalibrer sur les duels directs de 2027.
   - Réduction de `second-round-dropout.json` de 342 circonscriptions individuelles (162 Ko) à 4 agrégats exacts (12 Ko).
3. **Projection temporelle optionnelle vers avril/mai 2027 (`campaignProjection.ts`, `polls-history-2027.json`, `CampaignTrajectory.tsx`)** :
   - **Vote utile intra-bloc séparé par bloc** (gauche cible 70 %, centre 75 %, droite 75 %, extrême droite 78 %, plus option de regroupement centre+droite à 65 % type 2022), avec choix libre du candidat pivot par bloc, fuite réaliste de 12 % hors bloc, plancher protégé à 0,5 %, drainage modulé pour ne pas vider un co-favori déjà fort, et décroissance automatique à mesure que le scrutin approche (s'annule exactement à J−0).
   - **Amortissement léger des écarts précoces** (*mean reversion* vers les fondamentaux 2017–2024, poids max 25 % à J−150, s'annulant à J−0).
   - **Historique complet des vagues 2025–2027** archivé par `sync-polls` dans `polls-history-2027.json` (66 vagues) : alimente la **tendance récente amortie sur 21 jours** (plafonnée à ±2,5 pts) et le **graphique de trajectoire temporelle** avec cône d'incertitude à 80 % jusqu'au 18 avril 2027.
4. **Validation automatisée et incertitude probabiliste (`backtest.ts`, `monteCarlo.ts`)** :
   - Module `backtest.ts` exposant sur `/methodologie` les résultats hors échantillon sur 2017, 2022 (1er et 2nd tours) et la cohérence agrégée sur les 342 duels de 2024.
   - Moteur Monte-Carlo déterministe (2 000 tirages, graine `2027`) propageant chocs de bloc, vote utile intra-bloc, chocs propres (Student-t(8) en log-ratio), matrices Dirichlet(`κ = 40`), participation, nouveaux votants, fidélité et choc commun national.
   - Remplacement de l'affichage déterministe « Président élu » par **Issues simulées** (probabilités de victoire, probabilités de qualification, intervalles à 80 % et sélecteur de duels plausibles).
