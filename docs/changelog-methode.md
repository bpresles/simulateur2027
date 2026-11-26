# Journal méthodologique — simulateur2027

## 26/11/2026 — v2.3 (adoptée par décision explicite) — Refonte structurelle du moteur du 2nd tour (P1-bis, S1–S5) et 3e ancre présidentielle 2017 (P2)

**Règles pré-enregistrées le 26/11/2026 avant tout calcul P1-bis** (plan `docs/plan-front-republicain.md`, section 12 ; règles P2 pré-enregistrées le 24/11/2026). **Statut : adoptée en v2.3 (`STORAGE_VERSION = 18`) par décision explicite du propriétaire du projet**, hors réussite stricte des critères pré-enregistrés (détail ci-dessous, comme l'amendement v2.2 du 23/11/2026 sur la projection de campagne). Les sondages directs de 2nd tour 2027 ne servent jamais au calage ; leurs effets (R1.5-bis) n'ont été relevés qu'après les décisions B2 et B4.

### Règles structurelles pré-enregistrées (S1 à S5)

- **S1 — Volumes unifiés (`nonExpressed1`) et mobilisation Insee (`a_ref`) :**
  - La population non exprimée du 1er tour est unifiée : `nonExpressed1 = abstention1 + blankNull1 = 100 − expressed1`. Les blancs et nuls du 1er tour (non mesurés séparément) suivent par hypothèse documentée le même taux `a` et la même orientation `q` que les abstentionnistes du 1er tour (`totals.a + totals.b + totals.nonExpressed = 100 %` des inscrits).
  - Défaut de `a` (`abstainerMobilization`) : moyenne des deux mesures administratives Insee ajustées du taux national de blancs et nuls du 2nd tour (`2017 : 24,62 % × (1 − 0,1152) = 21,78 %` ; `2022 : 25,34 % × (1 − 0,0866) = 23,15 %` → moyenne `22,46 %`, défaut `0,225`).
  - Plage Monte-Carlo : `±0,085` autour de `a`, bornée à `[0,05 ; 0,45]`, couvrant à la fois Ifop (`0,14`) et Insee brut (`0,253`).
- **S2 — Orientation endogène neutre des nouveaux votants (`q` miroir) :**
  - Le défaut de `abstainerAntiRnShare` devient `null` (mode endogène neutre) : les nouveaux votants suivent exactement le partage T2 des électeurs exprimés du 1er tour (`q_A = V_A^(T1) / (V_A^(T1) + V_B^(T1))`, soit `Δq = 0`, cohérent avec Ifop 2022 `59 %` vs `58,5 %`).
  - L'utilisateur peut toujours fixer une orientation manuelle face au RN via le curseur existant.
  - En Monte-Carlo, en mode neutre (`null`), un écart symétrique `Δq ~ U[−0,08 ; +0,08]` est ajouté à `q_A` (borné à `[0,20 ; 0,80]`) pour tous les duels.
- **S3 — Séparation des fidélités par source (neutralité stricte en mode historique) :**
  - **Mode historique (`legislatives2024`, défaut) :** `byCandidate` est retiré du moteur historique. Les deux finalistes reçoivent la même fidélité symétrique neutre issue des enquêtes présidentielles « jour du vote » admissibles R1.8 publiant les finalistes (`ipsos_2022` et `ifop_2022` : Macron `97,0 / 1,0 / 2,0`, Le Pen `92,5 / 2,5 / 5,0` → moyenne symétrique **`94,75 / 1,75 / 3,50 %`**).
  - **Mode `declared2027` :** les fidélités déclarées Harris Interactive de l'automne 2026 (`default: 95/1,5/3,5`, `lepen: 96/1/3`, `melenchon: 92/2/6`) sont déplacées dans `src/data/transfers-2027-declared.json` et soumises en duel RN à la même `logitCorrection` (`deltaFinalist = +0,35`, `deltaRn = −0,20`) que les électorats éliminés.
  - **Mode `blend` :** mélange linéaire selon `declaredWeight` entre la fidélité historique neutre et la fidélité déclarée 2027 corrigée en logit.
- **S4 — Suppression de `camp: "rn"` et ligne unique mesurée pour l'extrême droite hors finaliste :**
  - Le rattachement `camp: "rn"` (`0 / 96 / 4`) est supprimé ; les 4 blocs actuels sont conservés sans sous-bloc ni paramètre par candidat.
  - Ligne de référence : moyenne simple des deux observations présidentielles admissibles R1.8 (1 observation par élection) — Dupont-Aignan 2017 (`ipsos_2017` : `27,0 / 30,0 / 43,0`) et Zemmour 2022 (`r1_1` : `9,5 / 75,5 / 15,0`) → **`18,25 / 52,75 / 29,00 %`**.
  - En Monte-Carlo (duels RN, hors surcharge manuelle), tirage uniforme `u_ed ~ U[0 ; 1]` interpolant entre la borne basse 2017 (`27/30/43`) et la borne haute 2022 (`9,5/75,5/15`) avant le tirage Dirichlet.
  - Évaluation croisée : chaque année est évaluée avec la seule observation ED de l'autre année.
- **S5 — Filtre d'admissibilité comptable pré-backtest (R1.1-bis) :**
  - Toute enquête dont la reproduction partielle en voix échoue au contrôle de réalisabilité R1.8 (colonne du résidu strictement négative au-delà de `|Δ inscrits|`) est exclue de la moyenne de référence et conservée en variante diagnostique uniquement (`ifop_2017`, `−40 812` voix sur Le Pen, est donc exclue de la référence 2017 ; 2022 reste la moyenne `ipsos_2022` / `ifop_2022`).

### Critères d'adoption pré-enregistrés (R1.2-bis et R1.4-bis)

- **R1.2-bis — Reproduction en échantillon (S1–S5) :**
  - *Contrôle comptable strict (fidélités mesurées de l'année) :* erreur `≤ 1,0 pt` sur la part de l'opposant au RN et `≤ 1,0 pt d'inscrits` sur chacun des deux volumes en 2017 **et** en 2022.
  - *Moteur neutre (fidélité symétrique S3 `94,75/1,75/3,50`, matrices de bloc admissibles de l'année) :* erreur en échantillon `≤ 2,0 pts` sur la part et `≤ 1,5 pt d'inscrits` par volume en 2017 **et** en 2022, avec réduction stricte par rapport à v2.2 (`−6,87` en 2017, `−3,60` en 2022) sur les deux années.
- **R1.4-bis — Validation croisée adaptée et cohérence 2024 (toutes requises, moteur neutre S1–S5) :**
  1. Biais moyen croisé `|(e_2017 + e_2022) / 2| ≤ 1,5 pt` (v2.2 : `4,69 pts`), avec `e_2017` et `e_2022` de signes opposés.
  2. Pire erreur croisée `max(|e_2017|, |e_2022|) < 8,20 pts` (v2.2 : `8,20 pts`).
  3. RMSE croisée `sqrt((e_2017² + e_2022²) / 2) ≤ 5,86 pts` (v2.2 : `5,86 pts`).
  4. Cohérence législatives 2024 : erreur absolue moyenne sur les 4 profils `≤ 1,0 pt` (v2.2 : `0,97 pt`) et aucun profil dégradé de plus de `0,5 pt` en valeur absolue par rapport à v2.2.
- **R1.5-bis — Effet sur 2027 :** relevé après la décision d'adoption et publié quel que soit son sens.

### Résultats de l'évaluation P1-bis (étape B2, script `scripts/evaluate-p1-bis.ts`)

1. **Filtre d'admissibilité comptable pré-backtest S5 (R1.8 par enquête) :** `ipsos_2017` (réalisable), `ipsos_2022` (réalisable), `ifop_2022` (réalisable). `ifop_2017` est exclue (`−40 812` voix impossibles sur Le Pen, au-delà de `|Δ inscrits| = 13 490`).
2. **Paramètres dérivés sans ajustement :**
   - S1 mobilisation Insee ajustée des blancs/nuls du 2nd tour : `21,78 %` (2017), `23,15 %` (2022) → moyenne `22,46 %`, défaut `0,225` sur `nonExpressed1 = abstention1 + blankNull1` (MC `±0,085` borné à `[0,05 ; 0,45]`).
   - S2 orientation endogène neutre : `abstainerAntiRnShare = null` (partage miroir des exprimés du 1er tour, `Δq = 0` ; MC `±0,08` borné à `[0,20 ; 0,80]`).
   - S3 fidélité symétrique « jour du vote » (`ipsos_2022` + `ifop_2022`) : `94,75 / 1,75 / 3,50 %` (retrait de `byCandidate` du moteur historique ; Harris 2026 déplacé dans `transfers-2027-declared.json` avec correction logit en duel RN).
   - S4 extrême droite hors finaliste : `27/30/43` (Dupont-Aignan 2017, Ipsos) et `9,5/75,5/15` (Zemmour 2022, R1.1) → moyenne `18,25 / 52,75 / 29,00 %` (suppression de `camp: "rn"`, tirage uniforme entre ces deux bornes en MC).
3. **Évaluation R1.2-bis (en échantillon) :**
   - *Contrôle comptable strict (fidélités mesurées de l'année) :* 2017 `−0,85 pt` (vol. Macron `−1,06 pt`, dépasse `1,0` de `0,06 pt` ; vol. Le Pen `+0,29`, expr. T2 `−0,77`), 2022 `−0,62 pt` (vol. Macron `−0,78`, vol. Le Pen `+0,13`, expr. T2 `−0,65` — OK).
   - *Moteur neutre S3 :* 2017 **`−1,82 pt`** (vs `−6,87` en v2.2 ; vol. Macron `−1,73`, dépasse `1,5` de `0,23 pt` ; vol. Le Pen `+0,90`), 2022 **`−1,55 pt`** (vs `−3,60` en v2.2 ; vol. Macron `−1,41`, vol. Le Pen `+0,72` — OK). Réduction massive de l'erreur sur les deux scrutins.
4. **Évaluation R1.4-bis (croisé & législatives 2024, moteur neutre S1–S5) :**
   - Biais signé croisé : **`−0,49 pt`** (`2017 : −6,59`, `2022 : +5,60`, signes opposés) vs `−4,69 pts` en v2.2 — **OK** (`≤ 1,5 pt`).
   - Pire erreur croisée : **`6,59 pts`** vs `8,20 pts` en v2.2 — **OK** (`< 8,20`).
   - RMSE croisée : **`6,11 pts`** vs `5,86 pts` en v2.2 — **KO** (`+0,25 pt`, dû au report croisé NDA 2017 `30 %` RN ↔ Zemmour 2022 `75,5 %` RN).
   - Législatives 2024 (4 profils) : MAE **`0,78 pt`** (vs `0,97 pt` en v2.2 ; `lfi_rn −1,52`, `ecolo_ps_pcf_rn −1,05`, `ensemble_rn −0,44`, `lr_rn −0,09`), dégradation max `+0,26 pt` (`≤ 0,5`) — **OK**.
   - Contrôle hors RN 2012 (Hollande – Sarkozy) : `51,40 %` vs `51,64 %` (`−0,24 pt`), `expr2 = 72,39 %` vs `75,68 %`.
5. **Décision explicite (étape B2, 26/11/2026) :** malgré les légers dépassements stricts sur 2017 (`0,06` / `0,23 pt` de volume) et sur la RMSE croisée (`6,11` vs `5,86`), le propriétaire du projet choisit d'**adopter P1-bis (S1–S5)** pour corriger les cinq incohérences structurelles prouvées et supprimer le biais systématique `−4,69 pts` de v2.2.

### Résultats P2 sur le moteur P1-bis (étape B4, script `scripts/evaluate-p2.ts`)

1. **Position `s_2017` sur l'échelle logit `2022 (0) ↔ 2024 (1)` (cible réelle 2017 : `66,10 %`) :**
   - **R2.5 (Ifop 2017 pub.) + ED mesurée 2017 (`27/30/43`, front pur) :** **`s_2017 = 0,5502`** (proche `midpoint`, défaut R2.2 `uncertain`, étendue `[0 ; 1]`).
   - **R2.5 (Ifop 2017 pub.) + ED S4 moyennée (`18,25/52,75/29`) :** `s_2017 = 0,884` (proche `leg2024`, défaut R2.2 `uncertain`, étendue `[0 ; 1]`).
   - Variantes R2.5 + R1.7 : `0,453` (ED 2017) / `0,751` (ED S4). Comparaisons jamais retenues : S3 neutre `0,790` (ED 2017) / `1,258` (ED S4) ; Harris 2026 `0,853` (ED 2017) / `1,374` (ED S4).
2. **Backtest leave-one-out R2.4 (moteur P1-bis S3 + ED S4) :**
   - 2017 (ancres `[2022, 2024]`) : `2022` `60,72 %` (`−5,38`), `2024` `65,52 %` (`−0,58`), milieu `uncertain` `63,71 %` (`−2,39`).
   - 2022 (ancres `[2017, 2024]`) : `2017` `62,15 %` (`+3,60`), `2024` `64,99 %` (`+6,44`), milieu `uncertain` `63,70 %` (`+5,16`).
   - Contrôle R2.5 + ED de l'année : 2017 `uncertain` `−0,23 pt`, 2022 `uncertain` `+4,14 pts` (MAE `2,18 pts` vs `3,48 pts` pour `leg2024`).
3. **Décision explicite (étape B4, 26/11/2026) :**
   - **Adopté :** interpolation logit linéaire par morceaux à **3 ancres** (`2022` à `0`, `2017` à **`s_2017 = 0,5502`** sous R2.5 + ED mesurée 2017 afin d'isoler le front républicain pur sans absorber l'écart Zemmour 2022, `2024` à `1`, sans extrapolation hors `[0 ; 1]` conformément à R2.3 ; aucun nouveau curseur ni préréglage conformément à R2.1).
   - **Écart explicite à R2.2 :** alors que R2.2 désignait `uncertain` (unanimement sur les 8 variantes), le propriétaire du projet choisit de **conserver `leg2024` comme réglage par défaut** du front républicain. Le préréglage `uncertain` reste disponible en un clic et tire désormais sur l'interpolation à 3 ancres.

### Migration des réglages (`STORAGE_VERSION = 17 → 18`)

- Dans `src/state/settingsStore.ts`, `abstainerMobilization` passe de `0,20` à `0,225` et `abstainerAntiRnShare` de `0,55` à `null` (neutre endogène) **uniquement** lorsque l'utilisateur avait conservé l'ancien défaut ; tout réglage manuel explicite est préservé. `republicanFront` reste inchangé (`leg2024` par défaut).

### Effet constaté sur 2027 (R1.5-bis, relevé après décisions B2 et B4, sondages au 26/11/2026)

Comparaison exacte v2.2 → v2.3 sur les mêmes sondages (`asOf = 2026-11-26`, projection avril 2027 activée, incertitude candidatures activée, 2 000 tirages, graine `2027`) :

| Duel (score de l'adversaire du RN) | v2.2 `leg2024` | v2.3 `leg2024` (défaut) | Δ `leg2024` | v2.2 `midpoint` | v2.3 `midpoint` (3 ancres) | Δ `midpoint` | v2.3 `pres2022` |
|---|---:|---:|---:|---:|---:|---:|---:|
| **Le Pen – Mélenchon** (duel par défaut) | 47,72 % | **49,60 %** | **+1,88 pt** | 44,66 % | 44,69 % | +0,03 pt | 42,47 % |
| **Le Pen – Philippe** | 54,99 % | **57,06 %** | **+2,07 pts** | 52,68 % | 53,52 % | +0,84 pt | 50,66 % |
| **Le Pen – Attal** | 53,49 % | **55,49 %** | **+2,00 pts** | 51,10 % | 51,78 % | +0,68 pt | 48,86 % |
| **Le Pen – Glucksmann** | 47,91 % | **49,41 %** | **+1,50 pt** | 44,36 % | 43,00 % | −1,36 pt | 40,22 % |
| **Le Pen – Lisnard** | 56,24 % | **58,46 %** | **+2,22 pts** | 53,72 % | 54,62 % | +0,90 pt | 51,66 % |

- Sur le duel par défaut (Le Pen – Mélenchon, `leg2024`), la probabilité Monte-Carlo de victoire de Marine Le Pen sur ce duel passe de `53,3 %` (v2.2) à **`50,25 %`** (v2.3, médiane `50,03 %`, IC 80 % `[28,7 ; 71,7]`), et les exprimés du 2nd tour passent de `65,49 %` à `65,97 %` des inscrits (abandon net `9,51 % → 8,85 %`).
- Probabilités globales de victoire (Monte-Carlo, tous duels confondus) : Le Pen `36,5 % → 33,5 %`, Mélenchon `30,6 % → 33,1 %`, Philippe `18,8 % → 16,6 %`, Lisnard `9,1 % → 11,9 %`. L'effet principal (`+1,5` à `+2,2 pts` en faveur de l'adversaire du RN à `leg2024`) provient directement de la suppression de l'asymétrie de fidélité pré-campagne (S3) et du rattachement forcé `camp: "rn"` sur l'extrême droite hors RN (S4). À `midpoint` (`50 %`), l'ancre 2017 (`55 %`, où Fillon est à `48 %` contre `52,5 %` pour Pécresse 2022) infléchit légèrement les profils à voisin droite/centre (`Glucksmann −1,36 pt`).

---

## 24/11/2026 — Sondages de l'entre-deux-tours (P4, affichage seulement)

Ajout purement descriptif prévu à la section 6 de `docs/plan-front-republicain.md` (décision 5 du 24/11/2026). **Aucun paramètre, aucun réglage par défaut, aucun calcul de 1er ou 2nd tour et aucune sortie Monte-Carlo ne sont modifiés** ; la version active du modèle reste la v2.2 (`STORAGE_VERSION = 17`).

1. **Données présidentielles entre-deux-tours (`src/data/second-round-poll-bias.json`).**
   - Ajout d'un champ obligatoire `phase` (`avantPremierTour` | `entreDeuxTours`) sur chaque sondage, validé par Zod et par contrôle croisé des dates (`avantPremierTour` : `end < electionDate` ; `entreDeuxTours` : `electionDate <= end < secondRoundDate`).
   - Les 45 sondages 2022 et 18 sondages 2017 existants reçoivent `phase: "avantPremierTour"` sans aucune modification de leurs valeurs.
   - Ajout de tous les sondages publiés entre les deux tours jusqu'à l'interdiction légale (reprises des listes Wikipédia `listSource` et notices de la Commission des sondages, 2002 exclu) :
     - **2017** (23/04 au 05/05/2017) : **22 sondages** ; moyenne entre-deux-tours Macron `60,98 %` (écart résultat − moyenne `+5,12 pts`), derniers sondages du 05/05/2017 (`n = 3`) `62,67 %` (écart `+3,43 pts`), résultat réel `66,10 %`.
     - **2022** (10/04 au 22/04/2022) : **42 sondages** (avec correction de la notice OpinionWay 16-19/04/2022 vers la notice CDS n° 9611) ; moyenne entre-deux-tours Macron `54,61 %` (écart `+3,94 pts`), derniers sondages du 22/04/2022 (`n = 5`) `56,20 %` (écart `+2,35 pts`), résultat réel `58,55 %`.
   - `pollBiasGaps`, `directPollRmse` et `directPollGapAlert` filtrent strictement sur `phase === 'avantPremierTour'` et ignorent le fichier législatif : les mesures actuelles (`+3,3 pts` en 2022 / `+4,1 pts` en 2017, soit `−3,3` et `−4,1` pts pour les sondages ; RMSE historique `3,53 pts`) restent strictement inchangées.

2. **Données législatives 2024 (`src/data/legislative-duel-polls-2024.json`) et règle d'identité stricte.**
   - Inventaire effectué le 24/11/2026 (listes Wikipédia FR/EN, série complète des notices Commission des sondages n° 9865 à 9888 de juin-juillet 2024, publications Ifop de juillet 2024) : sur les 5 sondages de circonscription répertoriés, 4 ont été menés avant le 1er tour du 30/06/2024 (Nord 10e, Lot-et-Garonne 3e, Alpes-Maritimes 1re, Seine-Saint-Denis 7e) et sont exclus du périmètre.
   - **1 seul sondage de circonscription d'entre-deux-tours (duel) identifié** : **6e circonscription du Calvados (1406)**, Ifop-Fiducial pour Sud Radio (`120979-Resultats.pdf`), terrain 02-03/07/2024, `n = 611` inscrits (issu de 711 personnes de 18 ans et plus) : Élisabeth Borne (`Renaissance`, fiche Assemblée nationale `PA717161`) `54 %` contre `56,36 %` au résultat officiel (écart `+2,36 pts`) ; Nicolas Calbrix (`RN`, rapport Ifop) `46 %` contre `43,64 %` (résultats définitifs data.gouv.fr, ministère de l'Intérieur).
   - La table `candidateParties` inscrit explicitement le parti canonique de chacun des 19 candidats 2027 (jamais déduit d'une coalition ou d'une nuance). `matchingLegislativeDuelPolls` applique la règle d'identité stricte : le sondage du Calvados (`Renaissance` – `RN`) n'est affiché que sur le duel `attal` – `lepen` et est exclu sur tout parti voisin ou allié (ex. `philippe` `Horizons` – `lepen` `RN`). Pour toutes les autres paires de partis (notamment `LFI` – `RN`, `Horizons` – `RN`, `LR` – `RN`), aucun sondage n'existant, rien n'est affiché.

3. **Interface et documentation.**
   - Ajout dans `SecondRoundDuel.tsx` des deux tableaux distincts « Entre-deux-tours (pour mémoire, non utilisé dans le calcul) » et « Législatives 2024, même duel de partis » (uniquement lorsqu'une correspondance stricte existe). Mention ajoutée dans `src/ui/pages/Methodology.tsx` et `README.md`.

## 24/11/2026 — v2.3 (non adoptée — P1 rejeté) — Audit du moteur du 2nd tour (P1)

**Règles pré-enregistrées le 24/11/2026, avant tout calcul** (plan `docs/plan-front-republicain.md`, périmètre P1 + P2). Les sondages directs de 2nd tour 2027 ne servent jamais au calage. **Issue (décision du 24/11/2026) : P1 est rejeté** après échec des critères pré-enregistrés R1.2 et R1.4 ; aucun réglage par défaut n'est modifié, les valeurs Fillon/Jadot ne sont pas corrigées isolément (R1.12), et P2 n'est pas engagé.

### Règles P1 (section 3.2)

- **R1.1 Hiérarchie des sources.** On prend la moyenne d'Ipsos et d'Ifop quand les deux existent, sinon la seule disponible. On ne choisit jamais l'institut d'après le backtest.
- **R1.2 Tolérance de reproduction.** ±1 point sur la part de l'opposant au RN et ±1 point d'inscrits sur le volume de chaque finaliste. Elle s'applique à la configuration de référence de l'étape 2, pas à la reproduction partielle de l'étape 1.
- **R1.3 Seuil de correction.** Une simplification est corrigée si sa contribution atteint 0,5 point au moins une année. Une contribution de signe opposé selon l'année est signalée, mais pas corrigée.
- **R1.4 Adoption.** Trois conditions, toutes requises :
  - erreur en échantillon ≤ 1 point en 2017 **et** en 2022 ;
  - erreur croisée moyenne, en valeur absolue, non dégradée ;
  - résultats agrégés du backtest des législatives 2024 stables à ±0,5 point.
- **R1.5 Effet sur 2027.** Il est relevé après la décision et publié dans le changelog quel que soit son sens.

Les règles R1.6 à R1.10 et R1.12 traduisent la décision 8 de la section 9.1. Les règles R1.11, R1.13 et R1.14 ont été validées le 24/11/2026 (décision 9).

- **R1.6 Format et variantes d'institut.**
  - Toutes les lignes sont au format finaliste opposé au RN / RN / non-exprimé, en % des électeurs du candidat au 1er tour.
  - R1.1 s'applique ligne par ligne.
  - Les variantes « Ipsos seul » et « Ifop seul » sont publiées et jamais retenues. Quand une ligne manque dans une variante, elle est prise chez l'autre institut, et c'est signalé.
- **R1.7 Incohérence Ifop.**
  - Le tableau des reports est retenu tel que publié.
  - Variante : pour les lignes où le tableau de participation donne un taux d'abstention, la colonne non-exprimé est remplacée par ce taux, et les deux autres colonnes sont remises à l'échelle en proportion. Elle est publiée et jamais retenue.
- **R1.8 Résidu de la reproduction partielle.**
  - Calcul en voix. L'écart d'inscrits entre les deux tours (−13 490 en 2017, +4 463 en 2022) est publié et non corrigé.
  - Le résidu est réalisable si chacune de ses trois colonnes (voix vers l'opposant au RN, voix vers le RN, non-exprimé) est comprise entre 0 et la population résiduelle, à l'écart d'inscrits près.
  - La part du résidu qui vote est comparée à titre indicatif aux chiffres de l'Insee : 24,6 % (2017) et 25,3 % (2022) des abstentionnistes du 1er tour votent au 2nd, votes de toute nature. Le résidu mêle les petits candidats et les non-exprimés du 1er tour : la comparaison est indirecte et n'a pas de seuil.
  - Le contrôle est publié pour chaque variante. Seul le résidu de la version R1.1 peut déclencher l'arrêt.
- **R1.9 Petits candidats.**
  - Aucune ligne n'est inventée.
  - Dans la configuration de référence, un candidat sans ligne reçoit la ligne de son bloc (`historicalBloc`) : moyenne des lignes R1.1 des candidats couverts du bloc, finaliste exclu, pondérée par leurs voix du 1er tour. Cheminade, seul petit candidat du centre, garde la ligne transposée (79/7/14).
  - (c) n'est pas mesurée. On publie sa borne : les voix des candidats sans ligne rapportées aux exprimés du 2nd tour, soit l'effet maximal si tous ces électeurs changeaient de colonne.
- **R1.10 Ligne du centre.** Retirée de la dégradation. En 2017 et 2022, le bloc centre est celui du finaliste (profil `ensemble_rn`, `transfers.ts:126`), et la ligne ne s'applique qu'à Cheminade en 2017. Elle reste une hypothèse documentée.
- **R1.11 Fidélité des finalistes (validée le 24/11/2026, critère strict).**
  - (f) est mesurée pour diagnostic et publiée. Elle n'est jamais corrigée dans P1, car les fidélités 2027 sont sourcées à part (enquêtes Harris de l'automne 2026).
  - L'idée que la fidélité déclarée avant le scrutin surestime la fidélité mesurée après reste une hypothèse non vérifiée, notée comme telle.
  - Critère strict : l'effet de (f) reste compris dans l'erreur évaluée par R1.4. Si cet effet est important, P1 peut échouer pour une cause qu'il ne corrige pas. Ce risque est accepté.
- **R1.12 Fillon et Jadot.** Les valeurs R1.1 remplacent celles du dépôt, dans le nouveau fichier de matrices, seulement si P1 est adopté (R1.4). Il n'y a pas de correction isolée.
- **R1.13 a et q de référence (validée le 24/11/2026).**
  - Ils sont fixés par la réconciliation des définitions d'Ifop et de l'Insee (section 9.2), écrite et datée dans le changelog avant l'étape 2.
  - Ifop ne mesure q qu'en 2022. Son application à 2017 est une transposition, documentée comme telle.
  - Si la réconciliation n'aboutit pas, a et q gardent leurs valeurs par défaut dans la configuration de référence, et (d) n'est pas mesurée.
- **R1.14 Ligne de l'extrême droite hors finaliste (validée le 24/11/2026).** Elle ne s'applique que si (b) passe le seuil R1.3.
  - Valeur : moyenne simple des lignes R1.1 de Dupont-Aignan 2017 et de Zemmour 2022. Chaque élection compte pour une observation.
  - Évaluation croisée : chaque année est évaluée avec la seule ligne de l'autre année.

### Règles P2 (section 4.3)

- **R2.1 Pas de nouveau réglage.**
  - Aucun nouveau curseur.
  - Les préréglages `pres2022` (0), `midpoint` (0,5) et `leg2024` (1) gardent leur position. Aucun préréglage `pres2017` n'est ajouté, sauf demande.
  - Le mode `uncertain` tire désormais la position uniformément sur toute l'étendue des trois ancres, de min(0 ; s₂₀₁₇) à max(1 ; s₂₀₁₇).
- **R2.2 Défaut (validé le 24/11/2026).**
  - 2022 désigne `pres2022` par construction ; 2017 désigne le préréglage le plus proche de s₂₀₁₇.
  - Si les deux désignent le même préréglage, c'est-à-dire si s₂₀₁₇ < 0,25, `pres2022` devient le défaut. Sinon, le défaut devient `uncertain`.
  - Avant adoption, on vérifie que la règle R1.4 reste satisfaite avec ce défaut.
- **R2.3 Ancre 2017 (décision 3).** 2017 est la troisième ancre, à la position s₂₀₁₇. Aucune extrapolation n'est faite au-delà des trois ancres.
- **R2.4 Leave-one-out sur les ancres.** L'erreur publiée pour le front est calculée en retirant à chaque fois l'ancre de l'élection évaluée.
- **R2.5 Fidélités utilisées pour mesurer le front (validée le 24/11/2026).**
  - **Problème.** Le moteur corrigé garde les fidélités 2027 des finalistes (R1.11). Si s₂₀₁₇ est calculé avec elles, il absorbe l'écart (f) de 2017, qui ne relève pas du front. Ce serait une compensation sans fondement, du type décrit en section 2.1. L'erreur se propagerait au défaut (R2.2, qui dépend de s₂₀₁₇) et au leave-one-out de 2022 (R2.4, qui utilise l'ancre 2017). L'ampleur n'est pas connue : (f) sera mesurée à l'étape 2 de P1.
  - **Règle.** s₂₀₁₇ est calculé avec les lignes R1.1 des deux finalistes de 2017. En 2017, ces lignes ne viennent que d'Ifop (section 3.3) : la variante R1.7 s'applique donc aussi à s₂₀₁₇ et est publiée.
  - **Variante.** s₂₀₁₇ calculé avec les fidélités 2027 est publié pour comparaison et jamais retenu.
  - **Inchangé.** La prévision 2027 garde les fidélités Harris. Les évaluations d'adoption (R1.4, et R2.2 qui y renvoie) gardent le critère strict (décision 9).

### Réconciliation Ifop / Insee pour `a` et `q` (R1.13, rédigée le 24/11/2026 avant l'étape 2)

1. **Définitions dans le moteur (`src/domain/secondRound.ts`).**
   - `a` (`abstainerMobilization`, défaut actuel `0,20`, Monte-Carlo ±0,04 borné à `[0,05 ; 0,45]`) : part des **abstentionnistes du 1er tour** (`inscrits − votants`, France entière) qui **expriment un suffrage valide** pour l'un des deux finalistes au 2nd tour (hors blancs et nuls). Les votants blancs et nuls du 1er tour (`blankNull1`) sont isolés à part et ne sont pas remobilisés dans le moteur (comportement non mesuré).
   - `q` (`abstainerAntiRnShare`, défaut actuel `0,55`, Monte-Carlo ±0,08 borné à `[0,30 ; 0,78]` ; `0,50` hors duel RN) : part de ces nouveaux votants exprimés qui votent pour l'adversaire du RN.

2. **Sources et définitions mesurées pour `a`.**
   - **Ifop-Fiducial 2022, données en composition** (PDF p. 27 / imprimée p. 26 ; `src/data/second-round-dropout.json`, `src/domain/newVoters.ts`) : parmi les suffrages exprimés au 2nd tour, `6 %` des électeurs de Macron et `5 %` des électeurs de Le Pen déclarent s'être abstenus au 1er tour (±0,5 pt d'arrondi entier). Appliqué aux voix officielles du 2nd tour (`18 768 639` et `13 288 686`) et rapporté aux abstentionnistes officiels du 1er tour 2022 (`48 747 876 − 35 923 707 = 12 824 169`), on obtient **`rAbs = 1 790 553 / 12 824 169 = 0,1396` (`14,0 %`)**, fourchette d'arrondi entier **`[0,127 ; 0,152]`** (`3,67 %` des inscrits du 2nd tour). Cette mesure correspond **exactement** au numérateur et au dénominateur de `a`, mais repose sur un seul scrutin déclaratif (souvenir du vote au 1er tour, risque de sous-déclaration de l'abstention du 1er tour, redressement sur le 1er tour non précisé).
   - **Ifop-Fiducial 2022, tableau de participation** (PDF p. 11 / imprimée p. 10) : `32 %` des abstentionnistes déclarés du 1er tour déclarent voter au 2nd (tous votes). Mesure écartée : supérieure au taux administratif d'émargement Insee (`25,3 %`) et incohérente en interne avec les données en composition du même rapport (`14,0 %` d'exprimés, qui laisseraient environ `2,3 M` de blancs/nuls sur les seuls abstentionnistes du 1er tour).
   - **Insee, listes d'émargement** (`src/data/second-round-dropout.json`, `src/domain/newVoters.ts`) :
     - **2017** (Insee Première n° 1670, France hors Mayotte) : `4,8 %` d'inscrits votent au 2nd tour seulement sur `19,5 %` d'abstentionnistes du 1er tour (`100 − 72,7 − 7,8`), soit **`24,62 %`** (`24,74 %` sur `4,8 + 14,6`).
     - **2022** (Insee Flash Normandie n° 124, France métropolitaine) : `5,6 %` d'inscrits votent au 2nd tour seulement sur `22,1 %` d'abstentionnistes du 1er tour (`100 − 70,2 − 7,7`), soit **`25,34 %`** (`25,00 %` sur `5,6 + 16,8`).
     - Deux écarts de définition par rapport à `a` : (i) l'Insee compte **tous les émargements**, blancs et nuls compris (taux moyen national de blancs et nuls au 2nd tour : **`11,52 %`** en 2017, **`8,66 %`** en 2022 ; taux spécifique aux nouveaux votants non mesuré) ; (ii) le champ géographique exclut les Français de l'étranger (2017 et 2022), Mayotte (2017) et l'ensemble de l'outre-mer (2022, où l'abstention T1 France entière est de `26,31 %` contre `22,1 %` en métropole).

3. **Résultat de la confrontation pour `a`.**
   - En retranchant à titre indicatif le taux moyen national de blancs et nuls du 2nd tour (hypothèse non vérifiée), l'Insee donne **`0,218`** en 2017 (`24,62 % × (1 − 0,1152)`) et **`0,231`** en 2022 (`25,34 % × (1 − 0,0866)`), soit encore **`9,2` points au-dessus** d'Ifop `rAbs` (`0,140`) en 2022.
   - Concilier `25,34 %` et `13,96 %` par le seul effet des blancs et nuls supposerait que **`44,9 %`** des abstentionnistes du 1er tour ayant émargé au 2nd tour ont voté blanc ou nul (plus de 5 fois le taux moyen de `8,66 %`), ce qu'aucune donnée n'étaye.
   - **Constat.** Le seul alignement des définitions (votes exprimés vs émargements) ne réconcilie pas les deux chiffres : l'écart résiduel provient de facteurs non mesurés (sous-déclaration probable de l'abstention T1 dans le déclaratif Ifop, écart de champ géographique, taux propre de blancs et nuls inconnu).

4. **Sources et définition pour `q`.**
   - L'Insee ne mesure pas `q` (les listes d'émargement ne contiennent pas le choix de vote).
   - **Ifop-Fiducial 2022** mesure `q` sur exprimés à **`0,59`** (`59 %` Macron / `41 %` Le Pen, PDF p. 25 / imprimée p. 24). Contrôle interne via les données en composition (PDF p. 27 / imprimée p. 26) : `0,06 × 18 768 639 / 1 790 553 = 62,9 %`, fourchette d'arrondi entier **`[58,6 % ; 67,1 %]`**, compatible avec `59 %`.
   - Aucune mesure de `q` n'existe pour 2017 : l'application de `0,59` à 2017 est une **transposition** (R1.13).

5. **Décision R1.13 (validée le 24/11/2026 avant l'étape 2 — Option A).**
   - **`a` de référence** : **`0,14`** (`rAbs = 0,1396` calculé depuis Ifop 2022 en composition et les résultats officiels 2022, seule mesure correspondant exactement à la définition du moteur ; fourchette d'arrondi entier `[0,127 ; 0,152]`).
   - **`q` de référence** : **`0,59`** (Ifop 2022, PDF p. 25 / imprimée p. 24 ; appliqué à 2017 par transposition, conformément à R1.13).
   - **Étape 2 et plage Monte-Carlo** : la dégradation `(d)` (`a = 0,20`, `q = 0,55` contre `a = 0,14`, `q = 0,59`) est mesurée à l'étape 2. Si `(d)` passe le seuil R1.3 à l'étape 3, la plage Monte-Carlo de `a` sera recalée pour couvrir les deux sources (d'Ifop borne basse `0,127` jusqu'à Insee `0,231` ajusté / `0,253` brut).

### Résultats de l'audit P1 (examinés après pré-enregistrement des règles — 24/11/2026)

**Décision : P1 rejeté** (24/11/2026, application stricte des critères pré-enregistrés R1.2 et R1.4). Aucun paramètre ni réglage par défaut n'est modifié ; la version active du modèle reste la v2.2 (`STORAGE_VERSION = 17`). Les voix officielles du 2nd tour 2017 (Décision n° 2017-171 PDR du Conseil constitutionnel : Macron `20 743 128`, Le Pen `10 638 475`) ont été ajoutées à `src/data/reference-2017.json` (et le repli codé en dur à `66,1` supprimé dans `src/domain/backtest.ts`), et les matrices brutes des 4 enquêtes 2017–2022 sont archivées et validées dans `src/data/second-round-reference-matrices.json` (non branchées sur le moteur par défaut, R1.12). Scripts reproductibles : `scripts/reproduce-second-round.ts`, `scripts/step2-degradation.ts`, `scripts/step3-evaluation.ts`.

1. **Étape 1 — Reproduction partielle en voix et contrôle du résidu (R1.6, R1.7, R1.8)** :
   - **2017** : 6 candidats couverts = `34 594 071` voix (`95,95 %` des exprimés T1) ; petits candidats sans ligne = `1 460 323` (`4,05 %`) ; non-exprimés T1 = `11 527 789` (`24,23 %` des inscrits T1) ; population résiduelle T1 = `12 988 112` (`27,30 %`) ; écart inscrits T2 − T1 = `−13 490`. Repère indicatif Insee (abstentionnistes T1 votant T2, tous votes) : `24,6 %`.
     - **R1.1 (principal)** : résidu Macron `+2 636 270` (`20,30 %`), Le Pen `+472 994` (`3,64 %`), non-exprimé `+9 865 358` (`75,96 %`) ; part exprimée `23,94 %` (`84,8 % / 15,2 %`) → **réalisable**.
     - **R1.6 — Ipsos seul** *(repli Ifop sur `macron`, `lepen`)* : résidu `+2 898 241` / `+986 800` / `+9 089 581` ; part exprimée `29,91 %` (`74,6 % / 25,4 %`) → **réalisable**.
     - **R1.6 — Ifop seul (publié)** : résidu `+2 374 299` / **`−40 812`** / `+10 641 135` → **non réalisable** (`−40 812 < −13 490` : les 6 grands candidats attribuent seuls `10 679 287` voix à Le Pen contre `10 638 475` au total officiel).
     - **R1.7 sur R1.1** : résidu `+3 129 590` / `+867 592` / `+8 977 441` ; part exprimée `30,78 %` (`78,3 % / 21,7 %`) → **réalisable**.
     - **R1.7 sur Ifop seul** : résidu `+3 009 427` / `+369 716` / `+9 595 478` ; part exprimée `26,02 %` (`89,1 % / 10,9 %`) → **réalisable**.
   - **2022** : 6 candidats couverts = `31 421 486` voix (`89,44 %` des exprimés T1) ; petits candidats sans ligne = `3 711 461` (`10,56 %`) ; non-exprimés T1 = `13 614 929` (`27,93 %` des inscrits T1) ; population résiduelle T1 = `17 326 390` (`35,54 %`) ; écart inscrits T2 − T1 = `+4 463`. Repère indicatif Insee : `25,3 %`.
     - **R1.1 (principal)** : résidu Macron `+3 668 931` (`21,18 %`), Le Pen `+2 225 810` (`12,85 %`), non-exprimé `+11 436 111` (`66,00 %`) ; part exprimée `34,02 %` (`62,2 % / 37,8 %`) → **réalisable**.
     - **R1.6 — Ipsos seul** : `+3 501 471` / `+2 263 837` / `+11 565 544` (`33,27 %`, `60,7 % / 39,3 %`) → **réalisable**.
     - **R1.6 — Ifop seul (publié)** : `+3 836 392` / `+2 187 783` / `+11 306 678` (`34,77 %`, `63,7 % / 36,3 %`) → **réalisable**.
     - **R1.7 sur R1.1** : `+3 921 650` / `+2 604 619` / `+10 804 584` (`37,67 %`, `60,1 % / 39,9 %`) → **réalisable**.
     - **R1.7 sur Ifop seul** : `+4 341 829` / `+2 945 400` / `+10 043 624` (`42,06 %`, `59,6 % / 40,4 %`) → **réalisable**.

2. **Étape 2 — Configuration de référence (R1.2), dégradations et borne de `(c)`** :
   - **Échec de la tolérance R1.2 (±1 pt part et ±1 pt d'inscrits par volume)** sur la configuration de référence (`r1_1`, `a = 0,14`, `q = 0,59`, lignes R1.1 par candidat, R1.9 petits candidats) ainsi que sur toutes les variantes R1.6 / R1.7 :
     - **2017 (`r1_1`)** : Macron `64,06 %` (écart **`−2,04 pts`**), vol. Macron `41,41 %` (**`−2,20`**), vol. Le Pen `23,23 %` (`+0,86`), exprimés `64,63 %` vs `65,97 %`. Variantes (part / vol. M / vol. LP) : Ipsos seul `−1,16 / −2,78 / −0,33` ; Ifop seul `−2,87 / −1,62 / +2,05` ; R1.7 sur R1.1 `−1,79 / −3,26 / +0,03` ; R1.7 sur Ifop seul `−2,80 / −2,99 / +1,18`. L'écart provient principalement de l'asymétrie du résidu dans les enquêtes 2017 (`+5,55 %` Macron / `+1,00 %` Le Pen d'inscrits en résidu officiel contre `+3,35 % / +1,86 %` dans le moteur).
     - **2022 (`r1_1`)** : Macron `57,99 %` (`−0,55 pt`, dans R1.2), vol. Macron `36,25 %` (**`−2,25`**), vol. Le Pen `26,26 %` (**`−1,001`**), exprimés `62,51 %` vs `65,76 %`. Variantes (part / vol. M / vol. LP) : Ipsos seul `−0,26 / −1,88 / −1,06` ; Ifop seul `−0,85 / −2,61 / −0,95` ; R1.7 sur R1.1 `−0,15 / −2,73 / −1,78` ; R1.7 sur Ifop seul `−0,03 / −3,57 / −2,50`. Le déficit de volume (`−3,25 pts` d'inscrits) tient à `a = 0,14` par rapport à l'Insee (`0,231` ajusté) et aux `1,62 %` de blancs/nuls du 1er tour non remobilisés.
   - **Tableau des dégradations** (points d'exprimés sur la part de Macron — ordre 1 : ajouté à la configuration de référence / ordre 2 : retiré du moteur actuel) :
     - `(a)` lignes de bloc du dépôt (gauche, droite) au lieu de R1.1 par candidat : **2017 `−0,489` / `+0,470`** ; **2022 `−0,129` / `+0,097`** *(sous le seuil R1.3 de 0,50 pt)*.
     - `(b)` extrême droite hors finaliste alignée sur `0/96/4` : **2017 `−3,015` / `+2,916`** ; **2022 `−1,654` / `+1,581`** *(seule simplification corrigible passant R1.3)*.
     - `(d)` `a = 0,20, q = 0,55` au lieu de `0,14 / 0,59` : **2017 `−0,372` / `+0,274`** ; **2022 `−0,304` / `+0,229`** *(sous le seuil R1.3)*.
     - `(f)` fidélités 2027 des finalistes (`95/1,5/3,5` et `96/1/3`) *(diagnostic seul, R1.11)* : **2017 `−1,091` / `+1,046`** ; **2022 `−1,072` / `+1,023`**.
     - `(c)` classement des petits candidats *(borne R1.9, voix sans ligne / exprimés T2)* : **2017 `4,65 pts`** (`1 460 323 / 31 381 603`) ; **2022 `11,58 pts`** (`3 711 461 / 32 057 325`). `(e)` (ligne du centre) retirée selon R1.10.

3. **Étape 3 — Évaluation R1.4 (autorisée malgré l'échec R1.2 pour bilan complet)** :
   - **Correction retenue par R1.3** : `(b)` seul, avec la ligne R1.14 moyenne simple de Dupont-Aignan 2017 (`26,5/38,0/35,5`) et Zemmour 2022 (`9,5/75,5/15,0`), soit **`18,00 / 56,75 / 25,25`**.
   - **Référence moteur actuel** : en échantillon `−6,87` (2017) et `−3,60` (2022) ; croisé `−8,20` (2017) et `−1,17` (2022), moyenne `|err|` = **`4,687 pts`**.
   - **Verdict R1.4 pour `(b)` seul (`r1_1`, critère strict R1.11)** : **ÉCHEC sur 2 conditions sur 3** :
     1. *En échantillon ≤ 1 pt* : **échec** — `62,14 %` (`−3,96 pts`) en 2017 et `56,53 %` (`−2,01 pts`) en 2022 (avec ED poolée R1.14 : `−4,91` et `−0,55` ; contrôle diagnostique hors `(f)` : `−2,89` et `−0,98`).
     2. *Erreur croisée moyenne `|err|` non dégradée* : **échec** — `−7,17` (2017) et `+3,38` (2022), moyenne **`5,276 pts > 4,687 pts`** (`+0,589 pt`). Projeter Dupont-Aignan 2017 (`38 %` RN) sur les `9,13 %` d'électeurs Zemmour+NDA de 2022 surestime Macron de `+3,38 pts` (levant la double compensation cachée dans le `−1,17 pt` actuel). Échec confirmé sur toutes les variantes : Ipsos seul `5,486`, Ifop seul `5,069`, R1.7 sur R1.1 `5,266`, R1.7 sur Ifop seul `5,051`, ainsi que sur `(a)+(b)` (`5,362`), `(a)+(b)+(d)` (`5,430`) et en diagnostic hors `(f)` (`5,261`).
     3. *Législatives 2024 stables à ±0,5 pt* : **OK** — variation exacte **`0,000 pt`** sur les 4 profils (même avec `(a)+(b)+(d)` : max `+0,339 pt`).

4. **Effet sur 2027 (R1.5, relevé après la décision de rejet)** :
   - **Effet appliqué au simulateur** : **nul (`0,00 pt`)**, aucun réglage ni matrice par défaut n'étant modifié (duel affiché par défaut inchangé : Le Pen `52,27 %` / Mélenchon `47,73 %`, médiane Monte-Carlo `52,00 %` `[32,78 ; 71,06]`, victoire Le Pen `54,4 %`).
   - **À titre informatif (non appliqué)** : si `(b)` seul (R1.14 `18,00 / 56,75 / 25,25`) avait été adopté, le duel par défaut Le Pen–Mélenchon serait passé à `50,81 %` (`−1,46 pt` sur Le Pen déterministe ; médiane MC `49,49 %`, `−2,51 pts`, `[31,49 ; 70,20]`, victoire Le Pen `48,8 %`), et le duel Le Pen–Philippe de `45,00 %` à `43,52 %` (`−1,49 pt`).

---

## 23 novembre 2026 (v2.2) — Sources, backtest 2012, front « incertain », alertes et sensibilité

**Règles arrêtées et consignées avant l’examen de leurs effets** (les résultats chiffrés sont ajoutés plus bas, à la section « Résultats v2.2 »). Les sondages directs de 2nd tour 2027 ne servent jamais à recalibrer le modèle.

### Règles

1. **Sources (T4)** : `methode.pdf` (document introuvable ; aucun fichier de ce nom dans le dépôt) n’est plus utilisé comme source ; il ne subsiste que dans l’historique de ce journal. Tout paramètre sans mesure publique consultée est déclaré « hypothèse non sourcée » dans le code, le README et la page Méthodologie, avec une plage de sensibilité. Ne sont conservés comme sourcés que les faits vérifiés (déclarations de candidature datées, liens ci-dessous).
2. **Backtest 2012 (T5)** : ajout de la présidentielle 2012 (et d’aucune autre) : résultats officiels (Conseil constitutionnel, décisions 2012-152 PDR et 2012-154 PDR), sondages Wikipedia, classification par bloc identique à 2017/2022 (Hollande, Joly, Mélenchon, Poutou, Arthaud : gauche ; Bayrou : centre ; Sarkozy : droite ; Le Pen, Dupont-Aignan : extrême droite ; Cheminade : centre par défaut comme en 2017). Le 2nd tour 2012 (Hollande–Sarkozy, sans RN) est exclu du backtest du front républicain mais le 1er tour et la couverture sont conservés. La validation croisée devient « leave-one-out » : chaque élection est testée avec les paramètres mesurés sur les deux autres. Convention « <0,5 % » = 0,25 pt (identique à 2017/2022).
3. **Recalage de `SIGMA_CAMPAIGN_REF` (T5)** : la règle v2.1 reposait sur 0,497 issu de `methode.pdf` (non vérifiable). Règle v2.2 : σ = plus petite valeur d’une grille de pas 0,005 dont la couverture brute poolée des intervalles `[P10 ; P90]` sur les 3 élections (candidats ≥ 2 % présents en campagne) atteint au moins 80 %. La moyenne arithmétique des `empiricalLogitRms` des 3 élections est publiée en contrôle. Plancher sondagier inchangé (0,14).
   **Amendement du 23/11/2026 à la règle 3 (rédigé avant tout calcul de son effet ; l'ancienne règle et son résultat 0,83 restent consignés ci-dessus et dans les résultats).** La règle de couverture à 80 % est fragile : elle ne s'appuie que sur une date par élection (2012 J−33, 2017 J−82, 2022 J−146), soit 21 points, et un seul candidat 2017 fait passer σ de 0,595 à 0,83. Nouvelle règle, appliquée telle quelle quel que soit le résultat (si elle s'avère inapplicable, on s'arrête et on le signale) :
   - **Dates d'évaluation** : pour chaque élection (2012, 2017, 2022), les dates J−d avec d = 150, 136, 122, …, 24 (tous les 14 jours de J−150 à J−14 ; J = jour du 1er tour, soit au plus 10 dates par élection). Une date n'est retenue que si la moyenne des sondages y est calculable avec la logique du code de couverture actuel : même fenêtre (`windowDays`), même offre (`require` / `exclude`, `offerProjection: false`) et au moins un institut utilisé à cette date exacte. Le repli « `usedStabilizedHorizon` » (avancer la date jusqu'à une offre stabilisée) n'est **pas** appliqué à la grille : il déplacerait l'horizon et dupliquerait des dates ; une date sans moyenne calculable est simplement écartée.
   - **Prévision évaluée** : celle affichée par défaut, c'est-à-dire projection de campagne activée avec cibles de concentration recalculées hors échantillon sur les deux autres élections (équivalent du `crossProjected` / `mcCross` existant). La version brute (`mcRaw`, sans projection) est calculée en contrôle.
   - **Critère** : CRPS moyen (en points de score) des scores de 1er tour des candidats ≥ 2 % au résultat réel et présents dans la moyenne, calculé sur les tirages Monte-Carlo : CRPS = E|X − y| − ½ E|X − X'|. Agrégation : moyenne par date, puis par élection, puis moyenne simple des 3 élections (poids égal par élection). σ retenu = argmin sur la grille 0,30 à 1,20 (pas 0,005 ; à égalité, le plus petit). Graine (2027) et nombre de tirages (2 000) communs à toutes les valeurs de σ.
   - **Stabilité hors échantillon** : pour chaque élection laissée de côté, σ optimisé sur les deux autres puis CRPS sur l'élection exclue ; les 3 σ et les 3 CRPS sont publiés.
   - **Contrôles publiés (sans effet sur le choix de σ)** : couverture [P10 ; P90] poolée et par élection au σ retenu, avec intervalle binomial exact (Clopper-Pearson) à 95 % — les dates d'une même élection sont fortement corrélées, la marge est donc optimiste ; couverture par tranche d'horizon (J−150 à J−100, J−99 à J−50, J−49 à J−14) pour éprouver la forme σ ∝ √t (diagnostic seul : la forme n'est pas modifiée dans cette passe).
   - **Exécution** : le balayage est lancé hors de l'application par `bun scripts/calibrate-sigma.ts`, qui écrit `src/data/sigma-calibration.json` (versionné) lu par la page Méthodologie ; `SIGMA_CAMPAIGN_REF` est fixé à la valeur de ce fichier.
   **Second amendement du 23/11/2026 à la règle 3 (décision du responsable du projet, rédigé après examen des résultats du CRPS ci-dessous et d’un balayage exploratoire de la couverture sur la même grille : ce n’est donc pas une règle fixée avant tout calcul).** Motif : l’objectif affiché est que les intervalles [P10 ; P90] couvrent le résultat réel dans environ 80 % des cas ; le minimum du CRPS (σ 0,395) n’en couvre que 53,6 % tous points confondus. Le CRPS récompense la netteté et reste dominé par des erreurs de centrage durables que σ ne corrige pas. Règle appliquée :
   - **Inchangé** : dates d’évaluation, prévision évaluée, candidats ≥ 2 %, grille 0,30 à 1,20 (pas 0,005), 2 000 tirages, graine 2027, tirages de 1er tour communs à toutes les valeurs de σ (`firstRoundOnly`).
   - **Critère** : pour chaque σ, couverture [P10 ; P90] par élection (points candidat-date regroupés au sein de l’élection, et non moyenne des taux par date), puis moyenne simple des 3 élections ; σ retenu = valeur dont cette moyenne est la plus proche de 80 % (à égalité, la plus petite).
   - **Diagnostics publiés (sans effet sur le choix)** : courbe et minimum du CRPS, couverture poolée (tous points) par σ, contrôles de couverture de l’amendement précédent.
   - **Stabilité hors échantillon** : pour chaque élection exclue, σ choisi par la même règle sur les deux autres, puis couverture et CRPS mesurés sur l’élection exclue.
   - **Alternatives écartées** : couverture poolée à 80 % (jamais atteinte sur la grille : 79,7 % à σ 1,15–1,20, intervalles très larges imposés par quelques candidats mal centrés) ; incertitude propre à chaque candidat (chantier séparé, voir `docs/plan-incertitude-par-candidat.md`).
4. **Projection de campagne (T3a)** : `projection.enabled` passe à `false` par défaut. Critère de réactivation : la projection (cibles croisées) doit battre la moyenne brute en validation croisée sur 2012, 2017 **et** 2022 (RMSE strictement inférieur pour chacune). **Amendement du 23/11/2026 (décision du responsable du projet, après examen des résultats ci-dessous)** : la projection reste **activée par défaut** (`enabled: true`, comme en v2.1.1) malgré le critère non atteint ; la limite est affichée dans la page Méthodologie et le README. La migration v16 → v17 conserve le choix de chaque utilisateur (aucune désactivation forcée). Ce choix n’est pas une validation statistique : la règle ci-dessus reste le critère de mesure, et son résultat est publié tel quel.
5. **Vote utile (T3b)** : le bénéficiaire `'auto'` est le candidat le plus haut de la famille (bloc) à la date de simulation, sans tirage aléatoire. Variantes comparées : (A) leader à la date (actuel), (B) leader recalculé par tirage Monte-Carlo, (C) leader figé de la dernière vague. Critères : RMSE croisé puis couverture ; la variante au plus faible RMSE croisé moyen est retenue, à égalité (écart < 0,05 pt) la plus simple (A).
6. **Front républicain « incertain » (T1)** : nouveau préréglage sans changer le défaut (législatives 2024). À chaque itération Monte-Carlo, un tirage uniforme commun U[0 ; 1] fixe la force du front pour les 3 électorats (gauche, centre, droite) à la fois ; 0,5 pour l’affichage déterministe. Justification : seules deux ancres mesurées existent (présidentielle 2022 et législatives 2024), sans information pour trancher entre elles ; un tirage uniforme commun traduit cette ignorance et conserve la corrélation entre électorats. Cohérence avec le triangulaire [35 ; 75] du report gauche hors LFI : ce dernier reste appliqué sur la valeur du curseur gauche, donc varie avec le tirage commun.
7. **Alerte d’écart aux sondages directs (T2)** : seuil = 2 × RMSE historique des sondages directs de 2nd tour (écart quadratique moyen, sur les sondages de `second-round-poll-bias.json` à la même distance du 1er tour ± 20 jours, calculé depuis les données, sans constante), comparé à l’écart entre le score modèle et la moyenne des sondages directs du duel. Comportement implicite des sans-intention : `q = (m·E − p·I)/(E − I)`, avec `m` = score modèle du candidat, `p` = son score publié, `I` = part de la base ayant une intention (100 − sans-intention), `E` = part de la base qui s’exprime (base inscrits : exprimés du 2nd tour modèle ; base votants : 100, blancs et nuls négligés) ; `q` est la part des sans-intention qui votent pour lui que le modèle suppose. Cas impossibles (`E ≤ I`, `q` hors [0 ; 100]) signalés ; rien n’est affiché si la base est absente. (Rédaction précisée le 23/11/2026 avant tout examen des résultats : la première version de cette règle inversait les rôles de `m` et `p`.)
8. **Sensibilité (T6)** : tableau repliable (fermé par défaut) par réglage non mesuré, utilisant uniquement des valeurs alternatives déjà documentées, sans Monte-Carlo. Lignes : front républicain, projection de campagne (activée par défaut ; alternative : désactivée), fuite inter-blocs et concentration du centre (affichées « sans effet : projection désactivée » si l’utilisateur désactive la projection), nouveaux votants vers l’adversaire du RN, mobilisation des abstentionnistes (bornes `14 %` et `22 %` des repères Ifop 2022 / Insee 2017–2022 du curseur), fidélité des finalistes (différenciée 96 / 92 / 95 % contre fidélité uniforme par défaut 95 / 1,5 / 3,5 % pour tous) et report gauche hors LFI → Mélenchon.

### Sources des scénarios de candidatures (`CANDIDACY_SCENARIO_WEIGHTS`)

Les poids `40/30/15/10/5 %` sont une **hypothèse non sourcée** (jugement), non une estimation statistique. Règle explicite : un scénario par combinaison de candidatures testée par les sondeurs ; plage de sensibilité : poids uniformes (20 % chacun) contre pondération actuelle. Déclarations de candidature consultées :

- Édouard Philippe : candidature officialisée le 03/09/2024 (entretien au Point) ; premier grand meeting le 05/07/2026. [Journal du Net](https://www.journaldunet.com/business/action-publique/1532943-edouard-philippe-officialise-sa-candidature-a-la-presidentielle-2027-et-se-dit-pret-en-cas-de-scrutin-anticipe/)
- David Lisnard : candidature annoncée le 31/03/2026 avec départ des Républicains. [LCP](https://lcp.fr/actualites/je-suis-candidat-david-lisnard-quitte-lr-et-relance-le-debat-sur-une-primaire-a-droite)
- Gabriel Attal : candidature annoncée le 22/05/2026. [LCP](https://lcp.fr/actualites/presidentielle-2027-gabriel-attal-officialise-sa-candidature-436721)
- Christine Lagarde : « Je ne suis pas candidate » (09/07/2026). [Euronews](https://fr.euronews.com/2026/07/09/je-ne-suis-pas-candidate-lagarde-a-euronews-dans-le-contexte-de-la-presidentielle) Le scénario « Lagarde seule » est donc une hypothèse de pure prudence.

### Hypothèses non sourcées (plages de sensibilité)

- `CROSS_BLOC_LEAK = 0,12` : aucune étude publique consultée ni mesure du backtest ne l’établit ; plage de sensibilité `[0,06 ; 0,18]`.
- `TARGET_CONCENTRATION.centre = 0,75` : le centre n’a qu’un candidat principal en 2012 (Bayrou), 2017 et 2022 (Macron) ; la concentration observée est donc triviale (100 %) et non informative. Plage `[0,65 ; 0,85]`.
- Correction d’incohérence : le commentaire de `TARGET_CONCENTRATION` indique bien `droite = 0,77`, valeur du code (ne pas lire 0,75 pour la droite dans les anciennes notes).

### Résultats v2.2 (examinés après la rédaction des règles ci-dessus)

Relevé au 23/11/2026, duel affiché Le Pen – Mélenchon (défauts) : avant, 52,3 % pour Le Pen (IC 80 % : 36,9 – 68,5), victoire 56,9 %, fréquence du duel 56,5 % ; après, 52,5 % (IC 80 % : 34,8 – 72,1), victoire 57,3 %, fréquence du duel 32,6 %. Ces chiffres « après » ont été relevés projection désactivée. Avec la projection réactivée par défaut (amendement de la règle 4, relevé du 23/11/2026, `σ` effectif 0,815) : duel Le Pen 52,3 – Mélenchon 47,7 ; dans les tirages où ce duel a lieu (41,0 % des tirages), Le Pen l’emporte dans 55,3 % des cas, score médian 52,0 [P10 34,7 ; P90 69,3] ; victoire finale toutes configurations : Le Pen 36,8 %, Mélenchon 29,3 %, Philippe 18,9 %, Lisnard 9,7 %. La baisse de fréquence du duel tient à l’élargissement de σ.

- **σ de campagne (règle 3)** : 0,595 → 0,83 (plus petite valeur de la grille atteignant 80 % de couverture brute poolée). Contrôle : la moyenne des `empiricalLogitRms` (0,18 ; 0,53 ; 0,69) est de 0,47, très inférieure à 0,83 : la règle de couverture est plus prudente que la mesure directe du bruit logit, et la couverture n’est pas monotone en σ (candidats pris un à un). Couverture brute 2012 : 6/6 ; 2017 : 4/6 ; 2022 : 7/9.
- **σ de campagne, amendement du 23/11/2026 (CRPS)** : σ_ref = **0,395** (ancienne valeur 0,83), minimum du CRPS poolé 2,16184 sur la grille 0,30–1,20 (pas 0,005), 2 000 tirages, graine 2027, prévision par défaut (projection activée, cibles hors échantillon). Courbe : 0,30 → 2,17183 ; 0,35 → 2,16413 ; 0,38 → 2,16212 ; 0,40 → 2,16187 ; 0,415 → 2,16226 ; 0,45 → 2,165 ; 0,50 → 2,17304 ; 0,595 → 2,20029 ; 0,83 → 2,32272 ; 1,00 → 2,44957 ; 1,20 → 2,62753. Courbe très plate autour du minimum (σ faiblement identifié). CRPS par élection à 0,395 : 2012 0,95433 ; 2017 3,00586 ; 2022 2,52533. Leave-one-out : 2012 exclue → σ 0,49 (CRPS 2012 : 1,00284) ; 2017 exclue → 0,34 (3,02233) ; 2022 exclue → 0,34 (2,54118). Contrôle brut (sans projection) : CRPS 2,4152. Dates retenues : 2012 : 1 (J−24 seulement), 2017 : 7 (J−108 à J−24), 2022 : 10 (J−150 à J−24) ; 18 dates, 12 écartées, 138 points candidat-date (6 / 42 / 90). 2012 démarre tard car, avant le 17/03/2012, toutes les hypothèses de sondage (107) contiennent un non-candidat exclu par le filtre strict ; seul un sondage BVA du 18/10/2011 est conforme, et la fenêtre de 21 jours ne donne aucune moyenne à J−38. Aucune donnée ajoutée. Couverture [P10 ; P90] à 0,395 (contrôle, non optimisée, optimiste car dates corrélées) : poolée 74/138 = 53,6 % (IC 95 % exact [44,9 ; 62,1] %) ; 2012 6/6 ([54,1 ; 100] %) ; 2017 26/42 = 61,9 % ([45,6 ; 76,4] %) ; 2022 42/90 = 46,7 % ([36,1 ; 57,5] %) ; par tranche d’horizon : J−150..J−100 24/42 = 57,1 %, J−99..J−50 30/60 = 50,0 %, J−49..J−14 20/36 = 55,6 %. Contrôle brut : 72/138 = 52,2 % ([43,5 ; 60,7] %). La couverture est donc très inférieure à 80 % : σ agit ici comme netteté, l’erreur de centrage domine. Précision d’exécution : un premier essai avec le Monte-Carlo complet (flux aléatoire dépendant des finalistes tirés, donc tirages de 1er tour non strictement communs) donnait un minimum bruité à 0,415 ; le mode `firstRoundOnly` (tirages de 1er tour strictement communs) a été ajouté, sans modifier le texte de la règle. Script : `scripts/calibrate-sigma.ts` → `src/data/sigma-calibration.json`.
- **Effet sur le duel par défaut (Le Pen – Mélenchon, 146 jours)** : score déterministe inchangé 52,27 / 47,73. Avant (σ 0,83) : médiane 51,7, P10 33,2, P90 70,8, victoire Le Pen 54,4 %, fréquence du duel 41,0 % ; victoires finales Le Pen 36,8 %, Mélenchon 29,3 %, Philippe 18,9 %, Lisnard 9,7 %. Après (σ 0,395) : médiane 52,8, P10 40,8, P90 65,1, victoire Le Pen 61,5 %, fréquence du duel 72,5 % ; victoires finales Le Pen 50,0 %, Mélenchon 31,1 %, Philippe 12,7 %, Lisnard 3,8 %. Ces probabilités restent conditionnées à des hypothèses non validées ; validation humaine requise avant toute diffusion.
- **σ de campagne, second amendement du 23/11/2026 (couverture moyenne par élection)** : σ_ref = **0,825** (valeur précédente 0,395). Couverture moyenne par élection 79,84 % (plateau identique de 0,825 à 0,865 : la règle retient le plus petit) ; CRPS 2,3194 (minimum 2,16184 à 0,395, couverture moyenne 69,5 % à ce point). Courbe (couverture moyenne / poolée / CRPS) : 0,30 → 68,0 % / 50,7 % / 2,1718 ; 0,40 → 69,5 % / 53,6 % / 2,1619 ; 0,50 → 71,8 % / 57,2 % / 2,1730 ; 0,60 → 73,3 % / 60,1 % / 2,2021 ; 0,70 → 74,4 % / 62,3 % / 2,2462 ; 0,80 → 77,5 % / 66,7 % / 2,3033 ; 0,90 → 81,7 % / 71,7 % / 2,3717 ; 1,00 → 83,3 % / 73,9 % / 2,4496 ; 1,20 → 88,4 % / 79,7 % / 2,6275. Couverture au σ retenu : 2012 6/6 ([54,1 ; 100] %) ; 2017 32/42 = 76,2 % ([60,5 ; 87,9] %) ; 2022 57/90 = 63,3 % ([52,5 ; 73,2] %) ; poolée 95/138 = 68,8 % ([60,4 ; 76,4] %) ; par tranche d’horizon : J−150..J−100 27/42 = 64,3 %, J−99..J−50 40/60 = 66,7 %, J−49..J−14 28/36 = 77,8 %. Contrôle brut (sans projection) : CRPS 2,46014, couverture 98/138 = 71,0 %. Leave-one-out : 2012 exclue → σ 1,115 (couverture 2012 : 100 %) ; 2017 exclue → σ 0,72 (couverture 2017 : 64,3 %) ; 2022 exclue → σ 0,30 (couverture 2022 : 42,2 %). **Limites constatées** : (1) le σ choisi varie de 0,30 à 1,115 selon l’élection exclue : la règle est mal identifiée avec 3 élections ; (2) 2012 n’a qu’une date (6 points, couverts quel que soit σ) et relève la moyenne par élection : sans 2012, la couverture à 0,825 est d’environ 69,8 % (moyenne de 2017 et 2022) ; (3) la couverture tous points reste à 68,8 %. Ces limites viennent d’erreurs de centrage durables par candidat (par exemple, écart moyen projeté − réel sur les dates : Pécresse 2022 +9,8 pts, Mélenchon 2017 −7,2, Mélenchon 2022 −6,5, Hamon 2017 +5,9) qu’un σ commun ne peut absorber sans élargir tous les intervalles.
- **Effet du second amendement sur le duel par défaut (Le Pen – Mélenchon, 146 jours, σ effectif 0,810)** : score déterministe inchangé 52,27 / 47,73. Duel affiché, tous tirages : médiane Le Pen 52,0, P10 32,8, P90 71,1, victoire Le Pen 54,4 %. Tirages où ce duel a lieu (40,6 %) : Le Pen l’emporte dans 55,4 % des cas, médiane 52,1 [P10 34,8 ; P90 69,6]. Victoires finales : Le Pen 36,9 %, Mélenchon 28,8 %, Philippe 19,9 %, Lisnard 9,4 %, Attal 1,8 %, Glucksmann 1,3 %, Lagarde 1,3 %. Sur les données figées des tests, les duels alternatifs restent sous le seuil de 30 % (≈ 25 % chacun) : seul le duel déterministe est proposé. Ces probabilités restent conditionnées à des hypothèses non validées ; validation humaine requise avant toute diffusion.
- **Backtest 2012** : 8 sondages de veille, 4 instituts en campagne (J−33 avec offre stabilisée) ; RMSE brut de veille 1,16 pt (croisé 1,72). Blancs et nuls non séparés dans les résultats 2012 sourcés (`blankOrInvalid`).
- **Projection (règle 4)** : RMSE campagne brut contre projeté croisé : 2012 1,398 / 1,398 (égalité) ; 2017 4,079 / 4,954 (pire) ; 2022 5,329 / 2,942 (meilleur). Le critère (strictement meilleur sur les trois) n’est **pas atteint**. Par décision du 23/11/2026 (voir l’amendement de la règle 4), la projection reste néanmoins activée par défaut ; la migration v17 ne modifie pas ce réglage chez les utilisateurs existants.
- **Vote utile (règle 5)**, RMSE croisé leave-one-out : A (leader à la date) 1,398 / 4,954 / 2,942 ; B (leader recalculé par tirage) 1,391 / 3,900 / 5,465 ; C (dernière vague) 1,398 / 4,954 / 2,942 (2012, 2017, 2022). Moyennes : A 3,10 ; B 3,59 ; C 3,10. Les moyennes sont arrondies ; B gagne en 2012 et 2017 mais perd nettement en 2022. La règle retient la plus faible moyenne, à égalité la plus simple : **A**. Le tirage aléatoire du bénéficiaire n’existait pas en production. Limites : l’intensité et le calendrier du vote utile ne sont pas testés finement.
- **Front « incertain »** : implémenté, non activé par défaut.
- **Alerte et sensibilité (règles 7 et 8)** : implémentées dans le bloc « Repère » du 2nd tour ; testées.

---

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
   - Lorsque aucune alliance manuelle n’est cochée, les tirages Monte-Carlo échantillonnent par défaut parmi les 5 configurations de candidatures testées au centre et à droite (Philippe + Lisnard 40 %, Philippe seul 30 %, Philippe + Attal 15 %, Attal seul 10 %, Lagarde seule 5 %) (poids : hypothèse non sourcée, voir v2.2).
3. **Persistance (`settingsStore.ts`)** : passage en version `15` pour appliquer ces deux nouveaux défauts aux navigateurs existants.

---

## 22 novembre 2026 (v2.1) — Corrections suite à la revue critique (`docs/revue-refonte-2026-11-22.md`)

À la suite de la revue critique de la v2, les réglages par défaut, le backtest, l’historique et le modèle de 2nd tour sont corrigés selon les règles suivantes, **arrêtées et consignées avant examen de leur effet sur les scores 2027** :

1. **Écart-type de campagne au 1er tour (`monteCarlo.ts`) — `SIGMA_CAMPAIGN_REF` : `0,40 → 0,595`** :
   - **Règle écrite :** moyenne arithmétique des deux mesures empiriques disponibles à J−156, soit `0,497` (présidentielles 1995–2022, candidats ≥ 5 % ; source `methode.pdf` retirée, non vérifiable, voir v2.2) et `0,693` (`empiricalLogitRms` mesuré par notre propre backtest sur 2022 à J−148), donnant `(0,497 + 0,693) / 2 = 0,595` (plancher sondagier inchangé à `0,14`).
   - **Motivation :** à `0,40`, les intervalles annoncés à 80 % ne couvraient que 50 % des résultats réels de 2017 et 2022. Un test de couverture automatisé est ajouté au backtest.
2. **Filtre 2017 du backtest (`reference-2017.json`, `backtest.ts`)** :
   - Le filtre de `campaignPolls` exige désormais `fillon` (avec `melenchon`, `macron`, `lepen`) et exclut `juppe`, `sarkozy`, `hollande`, `valls`, `montebourg`, `bayrou`, `peillon`, mettant fin à la moyenne invalide qui additionnait Juppé, Fillon et Sarkozy.
   - Si aucun sondage ne correspond à l’offre stabilisée à J−d (cas de 2017 à J−148 avant la fin des primaires), le backtest avance à la première date disposant d’au moins 3 instituts sur l’offre stabilisée et affiche explicitement cet horizon effectif.
3. **Validation croisée stricte de la projection (`backtest.ts`, `campaignProjection.ts`)** :
   - Ajout d’une colonne **strictement hors échantillon** évaluant le vote utile avec des cibles de concentration mesurées *uniquement sur l’autre élection* (2017 pour tester 2022, 2022 pour tester 2017), sans moyennes structurelles ni tendance.
   - **`meanReversion` : `0,5 → 0` par défaut** : les moyennes structurelles (`PRIOR_BLOC_SHARES`) agrègent 2017–2024 (fuite temporelle sur le backtest) et dégradent légèrement la prévision de 2022 (`2,62` avec vs `2,53` sans). Le curseur reste disponible en option.
   - **`dampedTrend` : `0,5 → 0` par défaut** : non validée en backtest. Le curseur reste disponible en option.
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
8. **Option « Scénarios de candidatures pondérés » (`monteCarlo.ts`)** :
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
