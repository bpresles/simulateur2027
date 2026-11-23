# Plan : incertitude propre à chaque candidat (option 3)

Rédigé le 23/11/2026, à l'état de la branche `methode-v2-2` (σ_ref = 0,825). Il s'agit d'un plan : aucune règle n'est encore arrêtée, aucun calcul de calage n'a été lancé. Les décisions à prendre figurent à la fin.

## 1. Objectif

Obtenir des intervalles [P10 ; P90] de 1er tour qui couvrent le résultat réel dans environ 80 % des cas **tous points confondus**, et pas seulement en moyenne par élection, sans élargir uniformément les intervalles de tous les candidats.

Contraintes :

- **Neutralité** : aucun paramètre propre à un candidat, un parti ou un bloc nommé. Seule l'incertitude peut être élargie, de façon symétrique (moyenne nulle), selon des caractéristiques neutres et observables en 2027 : taille, horizon, dispersion entre instituts. Aucune correction de centrage du type « tel candidat est sous-estimé ».
- **Règles écrites avant calcul**, consignées dans `docs/changelog-methode.md`, conformément au projet.
- Les sondages directs de 2nd tour 2027 ne servent jamais au calage.

## 2. Diagnostic (faits mesurés)

Mesures faites au σ_ref actuel de 0,825, sur la prévision par défaut (projection activée, cibles croisées), avec 2 000 tirages et la graine 2027. Elles portent sur 18 dates (2012 : 1, 2017 : 7, 2022 : 10), soit 138 points candidat-date répartis entre 21 candidats-élections (6 en 2012, 6 en 2017, 9 en 2022).

### 2.1 Couverture actuelle

- **Moyenne par élection : 79,8 %**, mais ce chiffre est tiré vers le haut par 2012, qui n'a qu'une date et 6 points, tous couverts quel que soit σ.
- **Tous points confondus : 95/138 = 68,8 %** (IC 95 % [60,4 ; 76,4] %, optimiste car les dates sont corrélées).
- **Par élection** : 2017 à 76,2 %, 2022 à 63,3 %. Sans 2012, la moyenne n'est que d'environ 69,8 %.
- **Par horizon** : 64,3 % de J−150 à J−100, 66,7 % de J−99 à J−50, 77,8 % de J−49 à J−14.
- **Instabilité hors échantillon** : le σ choisi en leave-one-out va de 0,30 à 1,115 selon l'élection exclue.

### 2.2 Le manque de couverture est concentré

13 candidats-élections sur 21 sont couverts à toutes leurs dates, et aucun ne l'est jamais. Le déficit vient de 8 candidats-élections. L'erreur est l'écart prévu − réel, en points, en moyenne sur les dates :

| Élection | Candidat | Résultat | Erreur brute | Erreur projetée | Projetée à la dernière date | Couverts |
|---|---|---|---|---|---|---|
| 2022 | Pécresse | 4,8 | +8,9 | +9,8 | +6,6 (J−24) | 2/10 |
| 2017 | Mélenchon | 19,6 | −6,8 | −7,2 | −4,4 (J−24) | 3/7 |
| 2017 | Hamon | 6,4 | +5,3 | +5,9 | +3,8 (J−24) | 3/7 |
| 2022 | Mélenchon | 22,0 | −11,8 | −6,5 | −8,5 (J−24) | 7/10 |
| 2022 | Lassalle | 3,1 | −2,0 | −2,3 | −1,1 (J−24) | 1/10 |
| 2022 | Dupont-Aignan | 2,1 | +0,0 | −1,3 | −0,4 (J−24) | 1/10 |
| 2017 | Dupont-Aignan | 4,7 | −2,0 | −2,0 | −0,8 (J−24) | 5/7 |
| 2022 | Roussel | 2,3 | +0,3 | −0,5 | +1,0 (J−24) | 6/10 |

À titre de comparaison, la projection réduit nettement l'erreur de Le Pen 2022 (de −6,7 à −0,0) et de Zemmour (de +6,3 à +0,5). La moyenne quadratique des erreurs moyennes par candidat-élection passe de 4,53 (brute) à 3,61 (projetée).

### 2.3 Lecture

Les sources sont la table ci-dessus et `monteCarlo.ts`, l. 237-241 et 548-560.

1. **Grosses erreurs durables.** Pour Pécresse 2022, Mélenchon 2017 et 2022, et Hamon 2017, l'erreur reste forte à J−24. Or le modèle fait décroître tout l'aléa avec l'horizon : σ² = σ_ref² · t/156 + 0,14². À J−24, σ total ≈ 0,35 en log-ratio, dont ≈ 0,16 pour la part propre au candidat (20 % de la variance). Rien ne représente une erreur propre au candidat qui ne se résorbe pas en fin de campagne.
2. **Petits candidats.** Lassalle et Dupont-Aignan en 2022, ainsi que Roussel, sont mal couverts malgré des erreurs de 1 à 2 points. Sur l'échelle log-ratio, un intervalle autour d'un score de 1 à 3 % est étroit en points, alors que l'erreur relative observée est forte. L'échelle du bruit est peut-être mal adaptée aux petits scores.
3. **Taille de l'échantillon.** Ces 8 cas fondent tout le déficit. Tout paramètre ajouté sera, de fait, ajusté sur eux : l'échantillon effectif est d'environ 21 grappes, pas 138 points.

**Honnêteté méthodologique** : ce diagnostic a été vu avant la rédaction du plan. Les modèles proposés ci-dessous en sont inspirés, et leur validation devra le rappeler.

## 3. Modèles envisagés

Tous ajoutent un terme symétrique au log-ratio de chaque candidat. Ce terme est tiré une fois par itération (Student-t(8), même plafond ±3,5), indépendant entre candidats et additionnel aux chocs existants (bloc 50 %, intra-bloc 30 %, propre 20 %).

| Code | Terme | Paramètres libres (en plus de σ_ref) | Observable en 2027 | Remarque |
|---|---|---|---|---|
| **A** | Erreur de centrage indépendante de l'horizon : τ | 1 (τ) | oui | Répond au point 1. Le plus parcimonieux. |
| **B** | Échelle adaptée aux petits scores : τ_i = τ · (s_ref / max(s_i, s_min))^γ, avec s_ref et s_min fixés a priori | 1 à 2 (τ, γ) | oui | Répond au point 2. Risque de surajustement si γ est libre. |
| **C** | Inflation par dispersion entre instituts : τ_i² = τ² + k · Var_inst(i) | 1 à 2 (τ, k) | à vérifier | Fondé sur les données. Il faut vérifier que `averageHypothesisPolls` peut exposer la dispersion par candidat, en 2012-2022 comme en 2027. |
| **D** | Forme d'horizon σ² ∝ t^β au lieu de t | 1 (β) | oui | Diagnostic de la sous-couverture aux horizons longs. Pas prioritaire. |

Recommandation : **A d'abord**. **B** ou **C** seulement si A laisse les petits candidats sous-couverts. **Deux paramètres libres au maximum** au total, σ_ref compris s'il est recalé conjointement. Plus de queues épaisses (df < 8) n'est pas proposé : cela agit peu sur P10 et P90.

**Hors périmètre** :

- toute correction du centrage (biais par candidat ou par famille), contraire à la neutralité ;
- l'ajout de 2007 ou 2002 (règle actuelle : « 2012, pas au-delà ») ;
- la modélisation explicite de dynamiques de fin de campagne (effondrements, vote utile tardif), qui relève de la projection.

## 4. Règles à pré-enregistrer (proposition)

Ces règles sont à consigner dans le changelog **avant** tout balayage :

1. **Prévision évaluée, dates, candidats ≥ 2 %, graine 2027, 2 000 tirages, mode `firstRoundOnly`** : inchangés par rapport au second amendement de la règle 3.
2. **Grille conjointe** : σ_ref de 0,30 à 1,20 (pas 0,025, puis affinage à 0,005 autour du point retenu) × τ de 0 à 1,0 (pas 0,025), et paramètre secondaire éventuel sur une grille fixée à l'avance. τ = 0 reproduit le modèle actuel.
3. **Règle de sélection**, de type « netteté maximale sous contrainte de calibration » : parmi les couples dont la couverture [P10 ; P90] **tous points confondus** est dans [78 % ; 82 %], retenir celui de CRPS minimal ; à égalité, le plus petit τ, puis le plus petit σ_ref. Si aucun couple n'atteint la plage, retenir le plus proche de 80 % et le déclarer.
4. **Critère d'adoption face au statu quo** (τ = 0, σ_ref = 0,825), mesuré en leave-one-out. Pour chaque élection exclue, les paramètres sont choisis sur les deux autres puis évalués sur elle. Adoption si la couverture hors échantillon se rapproche de 80 % pour au moins 2 élections sur 3 **et** si le CRPS hors échantillon moyen n'augmente pas de plus de 2 %. Sinon, statu quo, et le résultat est publié tel quel.
5. **Contrôles publiés sans effet sur le choix** :
   - couverture à 50 % et 90 %, en plus de 80 %, pour vérifier la calibration sur plusieurs quantiles ;
   - couverture par élection, par tranche d'horizon et par taille de candidat (< 5 %, 5 à 15 %, > 15 %) ;
   - largeur moyenne des intervalles, en points ;
   - IC de la couverture poolée par bootstrap en grappes (rééchantillonnage des 21 candidats-élections), plus honnête que Clopper-Pearson sur des points corrélés ;
   - contrôle sans projection ;
   - effet sur le duel affiché en 2027, relevé **après** l'adoption.

## 5. Étapes

0. **Décisions** (section 7), puis rédaction des règles dans `docs/changelog-methode.md` (v2.3, daté).
1. **Faisabilité de C**, si C est retenu : vérifier que la dispersion entre instituts est calculable par candidat et par date dans `averageHypothesisPolls` (`src/domain/pollAverage.ts`), pour les références historiques comme pour 2027, sans changer la moyenne.
2. **Moteur** (`src/domain/monteCarlo.ts`) :
   - ajouter un terme `persistentShock[i]` dans la somme des log-ratios (l. 555-559), d'écart-type τ_i non multiplié par l'horizon ;
   - ajouter `tauOverride` dans `MonteCarloInput`, à l'image de `sigmaCampaignRefOverride` ;
   - ordre des tirages du générateur : tirer le nouveau terme **après** les chocs existants, pour que τ = 0 reproduise bit à bit les résultats actuels (test de non-régression).
3. **Calage** :
   - `src/domain/sigmaCalibration.ts` : grille 2D, règle de sélection, leave-one-out 2D, couverture multi-quantiles, bootstrap en grappes, parseur étendu ;
   - `scripts/calibrate-sigma.ts`, renommé ou doublé en `calibrate-uncertainty.ts` ;
   - `src/data/sigma-calibration.json`, avec un nouveau schéma (τ, courbes 2D réduites).
   - Coût estimé à partir du balayage 1D actuel (≈ 26 s pour 181 valeurs) : de l'ordre de 10 à 20 min pour la grille grossière 2D. À confirmer.
4. **Application** : constantes `SIGMA_CAMPAIGN_REF` et `PERSISTENT_SHOCK_TAU`, lues depuis le JSON comme aujourd'hui ; affichage du σ effectif et de τ dans `src/ui/pages/Methodology.tsx` (`SigmaCalibrationBlock`, paragraphe « Chocs de campagne ») ; README §5.
5. **Tests** :
   - non-régression à τ = 0 ;
   - moyenne nulle et variance du nouveau terme ;
   - déterminisme pour une graine donnée ;
   - tirages de 1er tour identiques d'une valeur de σ à l'autre en `firstRoundOnly` ;
   - cohérence du JSON (point retenu conforme à la règle) ;
   - mise à jour de `simulate.test.ts`, car le nombre de duels plausibles au-dessus du seuil de 30 % peut changer.
6. **Résultats** : consigner dans le changelog la courbe, le leave-one-out, les contrôles, la décision d'adoption, puis l'effet sur 2027 (relevé après décision).

**Migration** : aucune si τ est une constante du modèle (recommandé). Si l'on expose un réglage utilisateur, il faut passer `STORAGE_VERSION` à 18, avec une migration qui conserve les réglages existants.

## 6. Risques

- **Surajustement** aux 8 candidats-élections mal couverts : c'est la raison de la limite à deux paramètres, du leave-one-out et du critère d'adoption fixé à l'avance.
- **Leave-one-out toujours instable** avec 3 élections : le résultat peut rester non concluant, et il faudra alors le dire.
- **Intervalles plus larges** : probabilités de victoire plus proches de 50 %, davantage de duels au-dessus du seuil de 30 %, effet visible dans l'interface. C'est le prix d'intervalles honnêtes.
- **2012 à une seule date** : poids faible sous une cible tous points confondus. Une extension des dates 2012 (projection d'offre sur les hypothèses contenant une personnalité non candidate) serait possible, mais elle modifie la prévision évaluée et doit être décidée à part.
- **Diffusion** : toute publication reste soumise à validation humaine et, pour les simulations fondées sur des sondages, à l'avis d'un juriste au regard de la loi n° 77-808 du 19/07/1977.

## 7. Décisions à prendre

1. **Cible de couverture** : tous points confondus, avec bootstrap en grappes (recommandé), ou moyenne par élection (règle actuelle).
2. **Modèles à tester** : A seul (recommandé pour commencer), A + B ou A + C.
3. **Règle de sélection** : « CRPS minimal parmi les couples à 78-82 % de couverture » (recommandé), ou couverture la plus proche de 80 % seule.
4. **Critère d'adoption face au statu quo** : celui de la section 4, ou un autre à fixer avant calcul.
5. **Dates 2012** : inchangées (recommandé dans ce chantier), ou extension par projection d'offre.
6. **Statut** : constante du modèle (recommandé), ou réglage utilisateur avec migration v18.
