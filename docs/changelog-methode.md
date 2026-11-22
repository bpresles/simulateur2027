# Journal méthodologique — simulateur2027

## 22 novembre 2026 (v2.1.2) — Pilotage du front républicain par électorat qui se reporte

Refonte ergonomique et conceptuelle des 3 curseurs du front républicain, à taux par défaut inchangés (`100 %` = Législatives 2024 par paire exacte de finalistes : 48 duels LFI–RN, 104 PS/écolo/PCF–RN, 132 Ensemble–RN, 58 LR–RN) :

1. **Axe de pilotage (`types.ts`, `transfers.ts`, `monteCarlo.ts`, `RepublicanFrontControls.tsx`)** :
   - Les 3 curseurs ne représentent plus la famille du finaliste (`centerRight`, `moderateLeft`, `lfi`) mais **l’électorat éliminé du 1er tour qui se reporte** : **`gauche`**, **`centre`** et **`droite`**, tous sur la même échelle `0 %` (Présidentielle 2022) ↔ `100 %` (Législatives 2024 sur la paire exacte de finalistes).
   - Dans un duel `Le Pen – Mélenchon`, les **3 curseurs** agissent directement sur le score affiché : **`Électeurs de gauche (hors LFI)`** (Glucksmann, Tondelier, Roussel : `72 %` à 100 %, `47 %` à 0 %), **`Électeurs du centre`** (`43 %` à 100 %, `24,5 %` à 0 %) et **`Électeurs de droite`** (`26 %` à 100 %, `13,1 %` à 0 %). De même, sur un duel `PS/écolo/PCF – RN`, le curseur gauche pilote les autres électeurs de gauche hors finaliste.
   - Suppression du 4e curseur redondant (`lfiLeftTransfer`) ; l’incertitude supplémentaire non mesurée sur `gauche hors LFI → Mélenchon` reste conservée via l’encadré de sensibilité et un tirage triangulaire dans Monte-Carlo sur `[35 % ; 75 %]` centré sur la valeur active du curseur gauche (plage réglable dans les réglages avancés).
2. **Persistance (`settingsStore.ts`)** : passage en version `16` pour migrer la structure `republicanFront` (`{ gauche, centre, droite }`) et retirer l’ancien champ `lfiLeftTransfer`.

---

## 22 novembre 2026 (v2.1.1) — Activation par défaut de la projection avril 2027 et de l’incertitude des candidatures

Changement de réglages par défaut décidé par l’utilisateur :

1. **Projection temporelle du 1er tour (`campaignProjection.ts`) — `projection.enabled` : `false → true` par défaut** :
   - Le simulateur s’ouvre désormais en mode **« Projection avril 2027 »** (vote utile intra-bloc actif sur les 4 blocs ; `meanReversion` et `dampedTrend` restent à `0 %` par défaut), avec bascule directe en un clic vers la photographie actuelle (« Aujourd’hui »).
2. **Incertitude des candidatures dans Monte-Carlo (`simulate.ts`) — `candidacyUncertaintyEnabled` : `false → true` par défaut** :
   - Lorsque aucune alliance manuelle n’est cochée, les tirages Monte-Carlo échantillonnent par défaut parmi les 5 configurations de candidatures testées au centre et à droite (Philippe + Lisnard 40 %, Philippe seul 30 %, Philippe + Attal 15 %, Attal seul 10 %, Lagarde seule 5 %), conformément à la revue critique et au tableau 4 de `methode.pdf`.
3. **Persistance (`settingsStore.ts`)** : passage en version `15` pour appliquer ces deux nouveaux défauts aux navigateurs existants.

---

## 22 novembre 2026 (v2.1) — Corrections suite à la revue critique (`docs/revue-refonte-2026-11-22.md`)

À la suite de la revue critique de la v2, les réglages par défaut, le backtest, l’historique et le modèle de 2nd tour sont corrigés selon les règles suivantes, **arrêtées et consignées avant examen de leur effet sur les scores 2027** :

1. **Écart-type de campagne au 1er tour (`monteCarlo.ts`) — `SIGMA_CAMPAIGN_REF` : `0,40 → 0,595`** :
   - **Règle écrite :** moyenne arithmétique des deux mesures empiriques disponibles à J−156, soit `0,497` (présidentielles 1995–2022, candidats ≥ 5 %, `methode.pdf` section 5.1) et `0,693` (`empiricalLogitRms` mesuré par notre propre backtest sur 2022 à J−148), donnant `(0,497 + 0,693) / 2 = 0,595` (plancher sondagier inchangé à `0,14`).
   - **Motivation :** à `0,40`, les intervalles annoncés à 80 % ne couvraient que 50 % des résultats réels de 2017 et 2022. Un test de couverture automatisé est ajouté au backtest.
2. **Filtre 2017 du backtest (`reference-2017.json`, `backtest.ts`)** :
   - Le filtre de `campaignPolls` exige désormais `fillon` (avec `melenchon`, `macron`, `lepen`) et exclut `juppe`, `sarkozy`, `hollande`, `valls`, `montebourg`, `bayrou`, `peillon`, mettant fin à la moyenne invalide qui additionnait Juppé, Fillon et Sarkozy.
   - Si aucun sondage ne correspond à l’offre stabilisée à J−d (cas de 2017 à J−148 avant la fin des primaires), le backtest avance à la première date disposant d’au moins 3 instituts sur l’offre stabilisée et affiche explicitement cet horizon effectif.
3. **Validation croisée stricte de la projection (`backtest.ts`, `campaignProjection.ts`)** :
   - Ajout d’une colonne **strictement hors échantillon** évaluant le vote utile avec des cibles de concentration mesurées *uniquement sur l’autre élection* (2017 pour tester 2022, 2022 pour tester 2017), sans moyennes structurelles ni tendance.
   - **`meanReversion` : `0,5 → 0` par défaut** : les moyennes structurelles (`PRIOR_BLOC_SHARES`) agrègent 2017–2024 (fuite temporelle sur le backtest) et dégradent légèrement la prévision de 2022 (`2,62` avec vs `2,53` sans). Le curseur reste disponible en option.
   - **`dampedTrend` : `0,5 → 0` par défaut** : non validée en backtest (et corrélation négative non significative $r = -0,26$ sur 1995–2022 dans `methode.pdf`). Le curseur reste disponible en option.
   - Les mentions « hors échantillon » et « sans recalibrage » sont réservées exclusivement aux tests où aucun paramètre n’a été estimé sur l’élection testée.
4. **Historique des vagues 2025–2027 (`sync/wikipedia.ts`, `polls-history-2027.json`)** :
   - Reconstruit en retenant **une seule hypothèse par vague** (la plus proche de l’offre simulée, exigeant Le Pen et Mélenchon et excluant les hypothèses de remplacement comme Bardella sans Le Pen), supprimant le mélange d’hypothèses et les gonflements artificiels de +40 %.
5. **Front républicain (`transfers.ts`, `RepublicanFrontControls.tsx`) — *défaut provisoire en attente d’arbitrage utilisateur*** :
   - Suppression des 6 coefficients ad hoc, du seuil de 6 %, du paramètre `_transfers` inutilisé et de l’étiquette inexacte « Niveau 2017 ».
   - Remplacement par une **interpolation directe sur échelle logit entre deux repères mesurés** : **`100 %` = Législatives 2024** (Ipsos-Talan) et **`0 %` = Présidentielle 2022** (enquêtes « jour du vote » 2022, `presidentialCenterRn.elections['2022']`), sans aucune extrapolation non sourcée sous 2022.
   - **Défaut provisoire fixé à `100 %` (Législatives 2024)** — seule source mesurant directement les 4 types de duels sans transposition — en attente d’arbitrage explicite de l’utilisateur (préréglages directs : `Présidentielle 2022 (0 %)`, `Mi-chemin (50 %)`, `Législatives 2024 (100 %)`).
6. **Report gauche hors LFI → Mélenchon (`transfers.ts`, `monteCarlo.ts`, UI) — *plage provisoire en attente d’arbitrage utilisateur*** :
   - Ce report (environ 13 % des exprimés, emprunté en 2024 au cas NFP → Ensemble `72/3/25` contre `36/11/53` en déclarations 2027 corrigées) n’est plus figé hors incertitude : ajout d’un **curseur dédié** interpolant entre les deux bornes sourcées, d’un **tirage uniforme explicite `[35 % ; 75 %]` dans Monte-Carlo** (plage recommandée par la revue, réglable) et de l’**affichage de son poids sur le score du duel affiché**.
   - **Défaut provisoire :** `72 %` (repère mesuré 2024) pour le calcul central, plage `[35 % ; 75 %]` dans Monte-Carlo, en attente d’arbitrage utilisateur.
7. **David Lisnard candidat principal (`polls-2027.json`) et retrait sans fuite arbitraire (`offerProjection.ts`)** :
   - David Lisnard (~9 %, 4e, testé par 7 instituts sur 8) n’est plus classé comme petit candidat (`minor` retiré) : au 2nd tour, ses électeurs suivent désormais le bloc `droite` comme ceux de Bruno Retailleau au lieu d’un report de 1er tour Cluster17.
   - Dans `offerProjection.ts`, le retrait d’un candidat redistribue désormais **100 %** de ses voix sur les poids mesurés (retrait de la fuite non mesurée de 10 % au prorata de tous les candidats, RN compris).
8. **Option « Scénarios de candidatures pondérés » (`monteCarlo.ts`, inspirée de `methode.pdf`)** :
   - Ajout d’une option activable (désactivée par défaut pour préserver la lecture directe du scénario sélectionné) qui tire à chaque simulation Monte-Carlo l’une des offres testées par les sondeurs selon des probabilités explicites documentées.

---

## 22 novembre 2026 (v2.0) — Refonte v2 : suppression des biais déterministes, moteur unifié en flux bruts et incertitude Monte-Carlo

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
