# Revue critique de la refonte v2 du simulateur

Note de travail du 22/11/2026, à reprendre pour les prochaines modifications du simulateur.

Objet : relecture critique de la refonte décrite dans `docs/resume-refonte-2026-11-22.md`, réalisée à partir de `docs/analyse-methode-2026-11-22.md`. Critère d'évaluation inchangé : une correction n'est retenue que si elle prévoit mieux le résultat réel que les sondages de l'époque sur 2017 et 2022, et si elle est techniquement correcte.

Données : base du 21/11/2026 (J−148), réglages par défaut sauf mention contraire.

## 1. Verdict

La refonte améliore nettement l'architecture. Tous les chiffres du résumé se reproduisent. `bun run typecheck`, `bun run lint` et `bun run test` (173 / 173) passent ; `bun run build` n'a pas été relancé.

En revanche, elle remplace d'anciens réglages non validés par de nouveaux réglages qui ne le sont pas davantage. Le test sur 2017 et 2022, présenté comme « hors échantillon », ne l'est pas pour les deux éléments qui décident du résultat.

Trois points changent les conclusions affichées :

1. Le réglage par défaut du front républicain n'a aucune source, et il donne en pratique les mêmes reports que les déclarations des sondages 2027.
2. L'incertitude du 1er tour est sous-estimée de près de moitié. Une fois corrigée, la probabilité de victoire de Le Pen passe de 69,6 % à 49–62 %.
3. Le test 2017 du 1er tour additionne Juppé, Fillon et Sarkozy dans une même moyenne : il est inexploitable.

## 2. Ce qui tient

- **2nd tour en flux bruts** (`secondRound.ts`) : les comptes tombent juste et le mode « par camps » a disparu. Les électeurs de Glucksmann ne sont plus à 2 % d'abstention.
- **Suppressions justifiées** : correction du billet de blog, régression de Goodman, redressement de participation.
- **Agrégation du 1er tour correcte** : seuil de 3 instituts, paires *ceteris paribus*, ajustement des sondages qui ne testent pas exactement l'offre simulée (`offerProjection.ts`).
- **Vote utile au sein d'un bloc** : il améliore vraiment la prévision de 2022. Avec des cibles mesurées sur 2017 seulement, l'erreur quadratique moyenne reste à 2,6–2,7 points, contre 5,35 pour les sondages bruts. C'est la meilleure brique de la refonte.

## 3. Problèmes majeurs

### 3.1 Le défaut « Érodé 2027 » (55/50/35) n'a pas de source, et c'est lui qui fait le résultat

- Le code ne contient ni donnée ni calcul pour ces valeurs, seulement un libellé (`src/ui/components/RepublicanFrontControls.tsx:10`, préréglages dans `src/domain/transfers.ts:28-33`).
- Effet sur les duels face au RN (score de Le Pen) :

| Préréglage | Le Pen – Mélenchon | Le Pen – Philippe | Le Pen – Lisnard |
|---|---|---|---|
| Effacé (0 %) | 60,1 % | 60,0 % | 56,8 % |
| **Érodé 2027 (défaut)** | **58,3 %** | **52,2 %** | **51,0 %** |
| Niveau 2022 (75 %) | 55,7 % | 50,0 % | 49,0 % |
| « Niveau 2017 » (100 %) | 53,8 % | 47,7 % | 46,6 % |

- Le défaut fait changer le vainqueur de Le Pen – Philippe.
- Ces reports sont presque ceux des déclarations 2027 corrigées. Sur les 8 types de reports que le front modifie, la part du finaliste s'écarte en moyenne de 3 points des déclarations 2027, contre 15 points des mesures 2024 :

| Profil | Électorat | Mesure 2024 | Défaut 2027 | Déclarations 2027 corrigées |
|---|---|---|---|---|
| `lfi_rn` | centre | 43/19/38 | 23/27/49 | 16/25/59 |
| `lfi_rn` | droite | 26/38/36 | 11/48/41 | 9/55/36 |
| `ecolo_ps_pcf_rn` | centre | 54/15/31 | 48/18/34 | 48/15/37 |
| `ecolo_ps_pcf_rn` | droite | 29/34/37 | 16/42/42 | 21/44/35 |
| `ensemble_rn` | gauche | 72/3/25 | 56/8/36 | 49/7/43 |
| `ensemble_rn` | droite | 53/23/25 | 47/26/27 | 49/24/27 |
| `lr_rn` | gauche | 70/3/27 | 43/10/46 | 44/6/50 |
| `lr_rn` | centre | 79/7/14 | 75/8/16 | 73/9/18 |

Valeurs : part pour le finaliste / pour le RN / abstention ou blanc, en %.

- Ce défaut contredit la décision du 22/11/2026 : les déclarations 2027 ne devaient être qu'une option, jamais le défaut.
- Il va à rebours du seul biais de sens constant : en 2017 comme en 2022, les sondages de campagne ont sous-estimé le barrage de 3 à 4 points. Ce défaut affaiblit encore le barrage.
- Il prolonge la tendance 2017 → 2022 jusqu'en 2027, alors que la refonte supprime ailleurs ce type d'extrapolation tirée de deux élections.

### 3.2 L'échelle du front républicain est mal étiquetée et réglée sur son propre test

Score de Macron simulé au 2nd tour, 1er tour réel connu, profil `ensemble_rn` (réels : 66,1 % en 2017, 58,55 % en 2022) :

| Force du front | 2017 | 2022 |
|---|---|---|
| 0 % | 51,4 | 49,9 |
| 55 % | 58,6 | 57,0 |
| 75 % | 60,6 | **58,9** |
| 100 % | **62,7** | 60,9 |

- « 100 % = niveau 2017 » est faux : aucun réglage ne reproduit 2017. 100 % correspond au niveau de l'enquête des législatives 2024, entre 2017 et 2022.
- Le repère « 75 % = 2022 » a été réglé pour reproduire 2022 : c'est le rôle des 6 coefficients et du seuil de 6 % de `src/domain/transfers.ts:139-140` (le commentaire des lignes 118-120 le dit). L'écart de +0,4 point affiché est donc un ajustement, pas une validation.
- La page Méthodologie affirme pourtant « sans aucun recalibrage sur les résultats testés » (`src/ui/components/Methodology.tsx:470-472`).
- Le seul vrai test, 2017, donne −3,4 points : la même erreur que les sondages de l'époque (62,0 %). Le modèle ne fait pas mieux qu'eux.

### 3.3 Le report le plus décisif n'est ni mesuré ni ajusté

Les électeurs de gauche hors LFI (Glucksmann, Tondelier, Roussel, environ 13 % des exprimés) se reportent à 72 % sur Mélenchon (72/3/25).

- Ce taux est emprunté : c'est celui des électeurs NFP pour un candidat Ensemble face au RN en 2024 (`transfers-legislatives-2024.json`, profil `lfi_rn`, ligne `gauche`, provenance `transpose`).
- Il échappe au réglage du front et à son incertitude simulée, parce que la relation est classée `same` (`src/domain/transfers.ts:101-106` et 131).
- C'est incohérent : dans le même duel, le report des électeurs du centre vers Mélenchon est abaissé de 43 % à 23 %.

| Report gauche hors LFI → Mélenchon | Score de Le Pen | Victoire Le Pen | Victoire Mélenchon |
|---|---|---|---|
| 72/3/25 (défaut) | 58,3 % | 69,6 % | 16,1 % |
| 62/5/33 | 59,5 % | 70,7 % | 14,3 % |
| 50/8/42 | 61,0 % | 74,4 % | 11,1 % |
| 36/11/52 (déclarations 2027 corrigées) | 62,7 % | 78,3 % | 6,7 % |

Même incohérence au 1er tour : la projection donne à Mélenchon 88 % des voix que perd Glucksmann (fuite hors bloc de 12 %, `CROSS_BLOC_LEAK`).

La loi de Dirichlet (κ = 40) donne un écart-type d'environ 7 points sur cette ligne : elle ne couvre pas l'écart de 36 points entre les deux sources.

### 3.4 Les intervalles d'incertitude sont trop étroits

- Le code utilise un écart-type de 0,41 (logit) à J−148 (`src/domain/monteCarlo.ts:37`).
- Son propre backtest (`empiricalLogitRms`) mesure 0,69 en 2022 et 0,79 en 2017 (cette dernière valeur est faussée par le point 3.5). Le PDF retenait 0,50 sur 1995–2022.
- Test de couverture : appliqués aux sondages de J−148 en 2017 et 2022, les intervalles annoncés à 80 % ne contiennent le résultat réel que 7 fois sur 14 (candidats à 2 % ou plus), soit 50 %. Même résultat en mode projection.
- Le commentaire de `monteCarlo.ts:33-36` affirme l'accord avec l'erreur historique : le backtest du code le contredit.

| Écart-type au 1er tour | Victoire Le Pen (sondages actuels) | Victoire Le Pen (projection avril 2027) |
|---|---|---|
| 0,41 (actuel) | 69,6 % | 65,8 % |
| 0,50 (PDF) | 61,8 % | 59,6 % |
| 0,72 (backtest du code) | 49,0 % | 45,6 % |

### 3.5 Le test 2017 du 1er tour est invalide

- Le filtre de `reference-2017.json` (`campaignPolls`) n'exige que Mélenchon, Macron et Le Pen, sans exclusion.
- La moyenne au 26/11/2016 additionne donc Juppé (19,4 %), Fillon (18,3 %) et Sarkozy (11,8 %) : la droite y pèse 49,5 %. Hollande (5,9 %) et Bayrou (4,4 %) y figurent aussi.
- La projection concentre ensuite la droite sur Juppé (34,1 %), qui ne sera pas candidat, et fait tomber Fillon à 8,1 %.
- Les chiffres « 6,26 → 5,87 » du résumé ne veulent donc rien dire. La projection n'est en réalité validée que sur 2022, une seule élection.
- Le choix de garder 4 blocs plutôt que de fusionner centre et droite repose en partie sur ce test faux.

Résultats du 1er tour 2022 à J−148, pour comparaison (erreur quadratique moyenne en points) :

| Variante | 2022 |
|---|---|
| Sondages bruts | 5,35 |
| Projection par défaut | 2,62 |
| Projection sans moyennes structurelles | 2,53 |
| Cibles mesurées sur 2017 seulement, sans moyennes structurelles | 2,63 |
| Cibles mesurées sur 2017 seulement, avec moyennes structurelles | 2,72 |
| Vote utile à gauche seulement | 3,63 |
| Vote utile à l'extrême droite seulement | 4,66 |

### 3.6 La tendance récente n'est jamais testée, et son historique est mélangé

- Le backtest la désactive (`src/domain/backtest.ts:287`, `dampedTrend: 0`), mais elle est active à 50 % par défaut dans la projection.
- Chaque vague de `polls-history-2027.json` fait la moyenne de toutes ses hypothèses, chacune ramenée à 100 sur les candidats simulés (`src/sync/wikipedia.ts:473-527`) :
  - 8 vagues testent Bardella à la place de Le Pen ; les autres scores y sont gonflés d'environ 40 % ;
  - Lisnard n'apparaît que dans 25 vagues sur 66 ;
  - 3 vagues donnent exactement le même score à Lisnard et à Retailleau.
- La « tendance » mesure donc en partie des changements de candidats testés. Aujourd'hui, elle donne +1,1 point à Lisnard et −0,7 à Philippe.

## 4. Points secondaires

- **Offre par défaut maximale (16 candidats)** : chez Harris, Ipsos et Odoxa, environ 18 points de la moyenne sont imputés et non mesurés (Lisnard à 8,9 là où il n'est pas testé, Riner, Ruffin, Villepin, Polony). Chez Odoxa, cela monte à 23 points en comptant Attal, ajouté par projection d'offre.
- **Lisnard, 4e à 8,8 %, reste traité comme un petit candidat au 2nd tour** : ses électeurs reprennent des reports de 1er tour mesurés par Cluster17 (50 % Retailleau, 40 % Le Pen, 10 % Glucksmann) et votent à 63 % Le Pen, contre 48 % pour ceux de Retailleau.
- **Cibles de concentration non mesurées** (`src/domain/campaignProjection.ts:29-34`) : 75 % pour le centre et pour la droite ne viennent d'aucune élection (en 2017 et 2022 : centre à 100 %, droite à 94 % puis 60 %). Pour l'extrême droite, 78 % n'est pas la moyenne observée (75,5 %).
- **Moyennes structurelles par bloc** (`PRIOR_BLOC_SHARES`, `campaignProjection.ts:47-52`) : codées en dur et non recalculables depuis le code ; elles incluent 2017, 2022 et 2024, donc des données postérieures aux élections testées. L'effet sur le backtest est faible (±0,1 point), mais l'étiquette « hors échantillon » est fausse.
- **Correction des déclarations 2027** : les corrections (+0,35 / −0,20) sont dites « mesurées » mais sont codées en dur dans `transfers-2027-declared.json`. Certaines lignes portent la mention « ordre de grandeur, peu testé directement » (`lr_rn` / `gauche`).
- **Retrait d'un candidat** (`offerProjection.ts:146-150`) : 10 % de ses voix sont redistribuées au prorata de tous les candidats, RN compris. Hypothèse non mesurée.
- **Métadonnées périmées** : la mention « mélange 50/50 » dans `transfers-legislatives-2024.json` (`presidentialCenterRn`, `ensemble_rn.sourceDuel`), et un commentaire de `monteCarlo.ts:169` qui annonce 3,5 points d'incertitude commune au lieu de 3,0 dans le code. Paramètre `_transfers` inutilisé dans `applyRepublicanFrontRow`.

## 5. Pistes d'amélioration, par priorité

1. **Corrections objectives, sans arbitrage** :
   - corriger le filtre 2017 : exiger Fillon, exclure Juppé, Sarkozy, Hollande, Valls, Montebourg, Bayrou ;
   - ajouter au backtest un test de couverture des intervalles et la variante « cibles mesurées sur l'autre élection » ;
   - fixer l'écart-type du 1er tour par une règle écrite avant d'en voir l'effet (entre 0,5 et 0,7) ;
   - corriger les mentions « hors échantillon » et « sans aucun recalibrage » ;
   - mettre à jour les métadonnées périmées.
2. **Front républicain** (arbitrage requis) :
   - renommer l'échelle : 100 % = législatives 2024 ;
   - remplacer les 6 coefficients par une simple interpolation entre deux repères mesurés : l'enquête 2024 et les enquêtes « jour du vote » 2022 ;
   - choisir le défaut avant d'en voir l'effet et le noter au journal (`docs/changelog-methode.md`). Le plus défendable au vu des données : le niveau 2024 ou celui de 2022, pas en dessous.
3. **Report gauche hors LFI → Mélenchon** (arbitrage requis) : en faire une incertitude explicite, avec un curseur dédié et une plage large (35 à 75 %) dans la simulation, et afficher son poids dans le résultat.
4. **Tendance récente** : la désactiver tant qu'elle n'est pas testée, et reconstruire l'historique avec une seule hypothèse par vague, la plus proche de l'offre simulée.
5. **Candidatures** : reprendre l'idée du PDF de scénarios de candidature pondérés par leur probabilité plutôt que l'offre maximale, et traiter Lisnard comme un candidat principal avec ses propres reports.

Règles rappelées :
- ne pas modifier un réglage par défaut après avoir vu son effet sur le score ;
- tenir le journal daté des changements de réglages par défaut ;
- ne qualifier un test de « hors échantillon » que si aucun paramètre n'a été choisi en regardant l'élection testée.

## 6. Reproduire les chiffres

Lancer `bun install`, puis des scripts bun qui importent les modules par chemin absolu (`<repo>` = racine du dépôt).

```ts
const { simulationData: d } = await import('<repo>/src/data/schema.ts')
const { simulate, defaultSettings } = await import('<repo>/src/domain/simulate.ts')
const { computeBacktest } = await import('<repo>/src/domain/backtest.ts')
const s = defaultSettings()
const r = simulate(d, s)                       // photographie ; projection : s.projection.enabled = true
console.log(r.selectableDuels.map((x) => [x.a, x.b, x.result.pct.a]))
console.log(r.monteCarlo.candidates)           // winProb, qualifProb, p10, p90
console.log(computeBacktest(d))                // dont empiricalLogitRms
```

- **Préréglages du front** : `simulate(d, { ...s, republicanFront: REPUBLICAN_FRONT_PRESETS.level2022 })` (`transfers.ts`).
- **Report gauche hors LFI** : `simulate(d, { ...s, transferOverrides: { lfi_rn: { gauche: { finalist: 36, rn: 11, abstention: 53 } } } })`.
- **Comparaison aux déclarations 2027** : `effectiveProfiles(...)` contre `correctDeclaredRowLogit(d.declaredTransfers.profiles[p][b], d.declaredTransfers.logitCorrection)`.
- **Échelle du front sur 2017 et 2022** : reprendre `evaluatePresidentialT2` de `backtest.ts` avec `applyRepublicanFrontRow('ensemble_rn', b, ligne2024, d.transfers, F)` pour F de 0 à 1.
- **Écart-type du 1er tour** : il dépend de `data.polls.asOf`. Appeler `runMonteCarlo` avec `asOf` reculé de 225 jours avant le scrutin donne σ ≈ 0,50, et de 486 jours σ ≈ 0,72.
- **Couverture** : moyenne de J−148 via `averageHypothesisPolls` (comme `backtest.ts`, section 2), puis `runMonteCarlo` avec `asOf` = date cible, candidats classés par bloc comme dans `backtest.ts`, et comptage des résultats réels compris entre `p10` et `p90`.
- **Cibles « autre élection »** : `TARGET_CONCENTRATION` est un objet exporté modifiable. 2017 → gauche 0,708, centre 0,99, droite 0,943, extrême droite 0,791 ; 2022 → gauche 0,687, centre 1,0, droite 0,604, extrême droite 0,717.
