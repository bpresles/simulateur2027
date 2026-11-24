# Plan : moteur du 2nd tour et front républicain (P1 à P4)

**Statut (24/11/2026) :** **P1 exécuté et rejeté** (échec des critères pré-enregistrés R1.2 et R1.4 ; aucun réglage par défaut modifié, modèle maintenu en v2.2 / `STORAGE_VERSION = 17`, repli codé en dur à `66,1` supprimé sur décision explicite) ; **P2 et P3 non engagés** (dépendent de P1) ; **P4 réalisé et vérifié** (affichage seulement, aucun impact sur les calculs). Voir le détail complet en section 11 et dans `docs/changelog-methode.md`.

Rédigé le 24/11/2026, à l'état du commit `2e673d5` de la branche `methode-v2-2`, puis mis à jour le même jour après le sourçage de l'étape 0 de P1 (section 3.3) et la validation des règles R1.11, R1.13, R1.14 et R2.5 (décisions 9 et 11). Ce texte est un plan : aucun paramètre n'a été modifié. Il sera exécuté par un agent, après validation complète (décision 10, section 10). Les décisions prises le 24/11/2026 figurent en section 9. Les règles chiffrées seront consignées dans `docs/changelog-methode.md` avant tout calcul.

L'option 3 (`docs/plan-incertitude-par-candidat.md`) a été abandonnée le 24/11/2026. σ_ref reste à 0,825 et le 1er tour est inchangé.

## 1. Objectif et contraintes

**Objectif.** Le moteur du 2nd tour doit reproduire les seconds tours passés à partir de mesures plutôt que d'hypothèses non sourcées, et aucun réglage par défaut ne doit masquer un biais structurel. Il s'agit de ne pas reproduire, par construction, l'erreur historique des sondages face au RN.

Le plan comporte quatre recommandations, traitées dans l'ordre :

- **P1** : remplacer les hypothèses non sourcées du moteur par des mesures.
- **P2** : recaler les ancres et le préréglage par défaut du front républicain, en même temps que P1. La présidentielle 2017 devient une troisième ancre.
- **P3** : recaler le choc commun η et documenter le budget d'incertitude du 2nd tour.
- **P4** : ajouter, pour affichage seulement, les sondages publiés entre les deux tours des présidentielles 2017 et 2022, ainsi que ceux des duels législatifs 2024 strictement identiques au duel affiché.

**Contraintes.**

- **Neutralité.**
  - On n'ajoute aucun paramètre propre à un candidat, un parti ou un bloc nommé. Les corrections passent par la structure par bloc déjà en place, avec des valeurs mesurées et appliquées de la même façon quels que soient les finalistes.
  - Les lignes par candidat servent uniquement au diagnostic.
  - P1 déplace le centre de la prévision. C'est accepté depuis le 24/11/2026 (décision 1), à condition de publier l'effet quel que soit son sens.
- **Règles écrites avant calcul.** Elles sont consignées dans `docs/changelog-methode.md`. Tout changement de réglage par défaut y figure aussi.
- **Sondages de 2027.** Les sondages directs de 2nd tour 2027 ne servent jamais au calage.
- **Effet sur 2027.** L'effet sur la prévision 2027 est relevé **après** la décision et publié quel que soit son sens. Il n'est jamais un critère d'adoption.
- **Pas de doublon.** On ne crée aucun nouveau curseur ni préréglage lorsqu'un mécanisme existant couvre déjà le besoin, par exemple le mode `uncertain` ou le tirage `rfShock`.

## 2. Diagnostic (faits mesurés)

Les mesures ont été faites au commit `2e673d5` avec les fonctions du backtest (`secondRoundPresidential`, `coverage80`), à partir des résultats réels du 1er tour. « En échantillon » signifie que le calcul utilise les matrices de reports de la même élection ; « croisé » signifie qu'il utilise celles de l'autre élection.

### 2.1 Erreur sur la part du candidat opposé au RN (points d'exprimés)

| Élection | Réel | En échantillon | Croisé | Défaut `leg2024` | Sondages directs avant le 1er tour |
|---|---|---|---|---|---|
| 2017 | 66,10 | 59,23 (**−6,87**) | 57,90 (−8,20) | 62,55 (−3,55) | 62,00 (−4,10) |
| 2022 | 58,55 | 54,95 (**−3,60**) | 57,38 (−1,17) | 60,73 (+2,18) | 55,27 (−3,28) |

Lecture :

- **Biais structurel de même signe.** Alimenté par ses propres matrices mesurées, le moteur sous-estime le candidat opposé au RN dans les deux cas. L'ordre de grandeur est le même que l'écart des sondages directs.
- **Le défaut compense plus qu'il ne mesure.** Avec `leg2024`, l'erreur moyenne tombe à −0,7 point, mais avec des signes opposés selon l'année. Le front fort de 2024 compense en partie le biais structurel au lieu de mesurer le front présidentiel. Faire P1 sans P2 produirait donc une double correction ; faire P2 sans P1 laisserait en place une compensation sans fondement.

### 2.2 Volumes (% des inscrits)

| Élection | Opposant au RN prévu / réel | Candidat RN prévu / réel | Exprimés prévus / réels |
|---|---|---|---|
| 2017 | 39,88 / 43,61 (−3,73) | 27,45 / 22,36 (+5,09) | 67,33 / 65,97 (+1,36) |
| 2022 | 35,97 / 38,50 (−2,53) | 29,49 / 27,26 (+2,23) | 65,46 / 65,76 (−0,30) |

Les valeurs réelles de 2017 sont calculées à partir de la part de 66,10 % des exprimés et des totaux de la décision n° 2017-171 PDR, présents dans `reference2017.secondRound`.

En 2022, le volume des exprimés est juste : l'erreur porte sur la **répartition** des voix entre les finalistes. Environ 2,2 à 2,5 points d'inscrits sont attribués au RN plutôt qu'à son adversaire. En 2017, le moteur compte en plus environ 1,4 point d'inscrits de trop dans les suffrages exprimés.

### 2.3 Aucune cause unique

Le tableau donne l'effet de chaque variante sur la part du candidat opposé au RN, en échantillon, en points.

| Variante testée | 2017 | 2022 | Statut |
|---|---|---|---|
| Mobilisation et orientation des nouveaux votants mesurées par l'Ifop 2022 (a = 0,14, q = 0,59) au lieu de 0,20 et 0,55 | +0,27 | +0,23 | mesure |
| q à la borne haute du Monte-Carlo (0,78) | +1,52 | +1,85 | test de sensibilité |
| Bloc extrême droite hors finaliste à 0/85/15 au lieu de la fidélité RN | +0,42 | +0,61 | test de sensibilité |
| Même bloc à 0/75/25 | +0,80 | +1,19 | test de sensibilité |
| Même bloc à 10/65/25 | +1,44 | +2,21 | test de sensibilité |
| Report de la gauche vers le finaliste +5 pts | +0,63 | +0,78 | test de sensibilité |
| Report de la droite vers le finaliste +5 pts | +0,48 | +0,20 | test de sensibilité |

Poids de l'extrême droite hors finaliste au 1er tour, en % des exprimés : Dupont-Aignan 4,70 et Asselineau 0,92 en 2017 ; Zemmour 7,07 et Dupont-Aignan 2,06 en 2022.

- **Fait.** Aucun levier mesuré ne comble l'écart à lui seul. Le seul levier mesuré, les nouveaux votants, n'apporte que 0,2 à 0,3 point.
- **Hypothèse, non vérifiée.** L'écart viendrait du cumul des simplifications par bloc :
  - lignes de bloc moyennées ;
  - électeurs de Zemmour et de Dupont-Aignan rattachés au camp RN, parce que l'enquête utilisée ne les couvre pas (`completionRule` de `transfers-legislatives-2024.json`) ;
  - Lassalle classé à droite et Asselineau à l'extrême droite (`RIGHT_IDS`, `ED_IDS` dans `backtest.ts`) ;
  - petits candidats au taux moyen de leur bloc ;
  - ligne du centre transposée des législatives.
- **Inconnue, en partie levée par le sourçage (section 3.3).** On ne sait pas si les enquêtes sont redressées sur les résultats des deux tours.
  - Ifop 2022 se redresse sur l'estimation des résultats définitifs. Le redressement sur le 1er tour n'est pas précisé.
  - Ipsos 2022 se redresse sur le souvenir du vote au 1er tour (notice CDS n° 1593), mais l'enquête précède le scrutin.
  - Les deux autres enquêtes ne documentent pas leur redressement.
  - Comme aucune matrice n'est complète, la reproduction du résultat ne peut de toute façon pas être vérifiée en entier.

### 2.4 Intervalles du 2nd tour

| Élection | Distance au scrutin | Intervalle [P10 ; P90] | Réel | Couvert | Largeur |
|---|---|---|---|---|---|
| 2017 | J−82 | [45,93 ; 75,39] | 66,10 | oui | 29,5 pts |
| 2022 | J−146 | [34,97 ; 73,60] | 58,55 | oui | 38,6 pts |

Ces intervalles couvrent le résultat, mais ils sont trop larges pour être informatifs. Ils mêlent l'incertitude du 1er tour et les aléas propres au 2nd tour, et on ne sait pas encore quelle part revient à chacun.

### 2.5 Inventaire des hypothèses du moteur du 2nd tour

| Élément | Valeur actuelle | Statut |
|---|---|---|
| Mobilisation des abstentionnistes a (`abstainerMobilization`) | 0,20 ; Monte-Carlo ±0,04, borné à [0,05 ; 0,45] | **Hypothèse**. Deux mesures existent : l'Ifop 2022 donne 0,14 [0,127 ; 0,152] et l'Insee indique que 24,6 % (2017) et 25,3 % (2022) des abstentionnistes du 1er tour votent au 2nd. Les définitions diffèrent (votes pour un finaliste ou votes de toute nature) et restent à réconcilier. |
| Orientation q (`abstainerAntiRnShare`) | 0,55 (0,5 hors duel RN) ; ±0,08, borné à [0,30 ; 0,78] | **Hypothèse**. L'Ifop 2022 mesure 59/41. |
| Extrême droite hors finaliste | fidélité du finaliste RN (`transfers.ts:266`), soit 0/96/4 | **Hypothèse contredite par les mesures** : Dupont-Aignan 2017 à 30 ou 46 vers Le Pen, Zemmour 2022 à 73 ou 78 (section 3.3). |
| Lignes de bloc présidentielles 2017 et 2022 | moyennes pondérées, par exemple gauche 2017 = Mélenchon 53/11/36 et Hamon 75/3/22, soit 58/9/33 | **Mesurées mais agrégées, provenance mêlée.** Les valeurs 2017 sont des moyennes Ipsos/Ifop ; Mélenchon et Pécresse 2022 viennent d'Ipsos seul ; Fillon 48/23/29 et Jadot 65/8/27 ne sont reproduits par aucune source (section 3.3). |
| Ligne du centre (79/7/14) | transposée du profil Ensemble des législatives | **Transposée**, sans mesure présidentielle. Dans le backtest, elle ne s'applique qu'à Cheminade en 2017 (0,18 % des exprimés), car le seul autre candidat classé au centre est le finaliste Macron (`historicalBloc`, `backtest.ts:173`). |
| Classement des petits candidats | `LEFT_IDS`, `RIGHT_IDS`, `ED_IDS` | **Hypothèse** de classement. Aucune ligne publiée pour ces candidats. |
| Fidélité des finalistes | 95/1,5/3,5 ; Le Pen 96/1/3 ; Mélenchon 92/2/6 | Sourcée pour 2027 (note du JSON, enquêtes Harris de l'automne 2026). **Le backtest applique ces valeurs de 2027 à 2017 et 2022** (`backtest.ts:267`). Les mesures de ces deux années en diffèrent : Macron 96 à 98, Le Pen 91 à 94 (section 3.3). |

## 3. P1 : remplacer les hypothèses non sourcées par des mesures

### 3.1 Étapes

0. **Sourçage : fait le 24/11/2026** (section 3.3). Aucune enquête ne publie toutes les lignes, ni de ligne complète pour les non-exprimés du 1er tour. Les matrices sont donc partielles, ce qui impose les adaptations des étapes 1 et 2 (décision 8 de la section 9.1).
1. **Reproduction partielle.** Un script `scripts/reproduce-second-round.ts` (nom provisoire) travaille sans le moteur, en voix.
   - **Données.** Résultats officiels des deux tours dans `reference-2017.json` et `reference-2022.json` (Conseil constitutionnel). Les voix des finalistes au 2nd tour de 2017 n'y figurent pas : le backtest lit le score dans `second-round-poll-bias.json`, avec un repli codé en dur à 66,1 (`backtest.ts:553`). Elles sont à ajouter depuis la décision n° 2017-171 PDR avant tout calcul.
   - **Contributions.** Chaque ligne retenue (R1.1, finalistes compris) est appliquée aux voix de son candidat au 1er tour. On obtient la contribution des électorats couverts aux voix de chaque finaliste et au non-exprimé du 2nd tour.
   - **Résidu.** Le résultat officiel du 2nd tour, moins ces contributions, donne le résidu attribuable aux petits candidats sans ligne et aux non-exprimés du 1er tour (27,3 % des inscrits en 2017, 35,5 % en 2022). Il est contrôlé par la règle R1.8.
   - **Variantes publiées pour comparaison** : Ipsos seul, Ifop seul (R1.6), et colonne non-exprimé d'Ifop tirée du tableau de participation (R1.7).
   - **Arrêt.** Si le résidu n'est pas réalisable, on s'arrête pour analyser, sans ajuster aucune ligne.
2. **Configuration de référence, puis dégradation.**
   - **Configuration de référence** (le « moteur complet » de la décision 8). Le moteur reçoit les lignes R1.1 des candidats couverts, finalistes compris, les lignes de bloc des petits candidats (R1.9) et a et q de référence (R1.13). Elle doit reproduire le résultat officiel à la tolérance R1.2. Sinon, on s'arrête pour analyser.
   - **Dégradation.** On revient une à une aux simplifications du moteur actuel :
     - (a) lignes de bloc du dépôt au lieu des lignes R1.1 par candidat. Cette étape mesure à la fois la provenance (Fillon, Jadot, valeurs d'Ipsos seul, arrondis) et l'agrégation. En échantillon, une agrégation pondérée par les voix de l'année est neutre par construction, sauf pour les petits candidats du bloc ; son effet propre apparaît surtout en croisé ;
     - (b) extrême droite hors finaliste alignée sur la fidélité RN (0/96/4) au lieu des lignes mesurées ;
     - (d) a = 0,20 et q = 0,55 au lieu des valeurs de référence ;
     - (f) fidélités 2027 des finalistes (Macron 95/1,5/3,5 ; Le Pen 96/1/3) au lieu des lignes mesurées. **Diagnostic seulement** (R1.11).
   - Les contributions ne sont pas additives. Chacune est mesurée dans les deux ordres : ajoutée à la configuration de référence, puis retirée du moteur actuel. Le résultat est un tableau des contributions en 2017 et en 2022, en points d'exprimés sur la part de l'opposant au RN.
   - **Non mesurées.** (c), le classement des petits candidats, est seulement borné (R1.9). (e), la ligne du centre, n'est pas testable (R1.10).
3. **Corrections.** On retient uniquement les simplifications qui passent le seuil de la règle R1.3 et qui peuvent être remplacées par une mesure applicable en 2027 avec la structure par bloc. (f) en est exclue (R1.11). Pistes possibles, sous réserve des résultats :
   - a et q de référence, avec une plage Monte-Carlo qui couvre les deux sources (Ifop et Insee) ;
   - une ligne mesurée pour l'extrême droite hors finaliste (R1.14) ;
   - des lignes de bloc recalculées selon R1.1, Fillon et Jadot compris (R1.12).

   Le classement des petits candidats n'est pas corrigé, faute de mesure. La règle existante (`LEFT_IDS`, `RIGHT_IDS`, `ED_IDS`) est seulement écrite dans Méthodologie.
4. **Données et tests.**
   - **Fichier `src/data/second-round-reference-matrices.json`** (nom provisoire), avec son schéma Zod dans `schema.ts` :
     - `surveys` : identifiant, institut, terrain (début et fin), réalisation avant ou après le scrutin, effectif, mode, redressement (texte, ou `null` s'il n'est pas documenté), URL, page du PDF et page imprimée. Aucune coordonnée nominative des salariés des instituts n'est reprise ;
     - `rows`, par élection : identifiant du candidat (celui de `reference-AAAA.json`) et valeurs brutes de chaque enquête au format finaliste opposé au RN / RN / non-exprimé, ou `null`. Les valeurs R1.1 sont calculées dans le code, jamais stockées ;
     - `participation` : taux d'abstention par vote du 1er tour tiré des tableaux de participation Ifop, tel que publié (variante R1.7) ;
     - `abstainers` : ligne partielle Ifop 2022 (32 % de votants ; exprimés 59/41), avec ses champs explicites ;
     - validation : chaque triplet somme à 100 à 1 point près, chaque candidat existe dans le fichier de référence de l'année, chaque valeur renvoie à une enquête déclarée.
   - Voix des finalistes de 2017 ajoutées à `reference-2017.json`. Le repli à 66,1 de `backtest.ts:553` est supprimé.
   - **Tests.**
     - Reproduction sur une fixture de trois candidats fictifs, avec un résidu calculé à la main.
     - Un résidu réalisable et un résidu non réalisable.
     - Invariants : totals.a + totals.b + nonExpressed + blankNull1 = 100, et q = 0,5 hors duel RN.
     - Valeurs attendues du backtest mises à jour seulement si P1 est adopté.
5. **Documentation.** Changelog (règles R1.1 à R1.14 et R2.1 à R2.5 datées avant l'étape 1), `Methodology.tsx`, README. Le tableau des contributions, les variantes et le contrôle du résidu sont publiés quel que soit le résultat.

### 3.2 Règles à pré-enregistrer

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

### 3.3 Résultat du sourçage (étape 0, 24/11/2026)

Valeurs relevées sur le rendu des pages, pas seulement sur l'extraction texte. Format commun : finaliste opposé au RN / RN / non-exprimé (blancs, nuls et abstention), en % des électeurs de chaque candidat du 1er tour.

**Enquêtes**

| Enquête | Terrain | Échantillon | Redressement | Source |
|---|---|---|---|---|
| Ipsos Sopra Steria 2017 | 04 au 06/05/2017, **avant le scrutin** | 4 838 inscrits, en ligne, quotas | Non documenté. Reports « tenant compte » de l'analyse des transferts dans 500 bureaux de vote | [PDF](https://www.ipsos.com/sites/default/files/files-fr-fr/doc_associe/ipsos_sopra_steria_sociologie_des_electorats_7_mai_20h15_0.pdf), p. 4 |
| Ifop-Fiducial 2017 | 07/05/2017, 11 h à 18 h | 2 470 inscrits de métropole, en ligne | Non trouvé. Mention « sur la base de l'estimation Ifop publiée à 17h00 » | [PDF](https://www.ifop.com/wp-content/uploads/2018/03/3756-1-study_file.pdf), p. 27 (imprimée 25) |
| Ipsos Sopra Steria 2022 | 21 au 23/04/2022, **avant le scrutin** | 4 000 inscrits, Access Panel en ligne | Sociodémographique et souvenir du vote au 1er tour 2022 (notice CDS n° 1593, rattachée au rapport « Comprendre le vote » : son application au rapport « Sociologie » est une inférence). Même mention des 500 bureaux de vote | [PDF](https://www.ipsos.com/sites/default/files/ct/news/documents/2022-04/Ipsos%20Sopra%20Steria_Sociologie%20des%20e%CC%81lectorats%20et%20profil%20des%20abstentionnistes_24%20Avril%2020h.pdf), p. 4 ; [notice](https://www.commission-des-sondages.fr/notices/medias/fichiers/add/1593), p. 4 |
| Ifop-Fiducial 2022 | 24/04/2022, 11 h à 18 h | 4 827 inscrits, en ligne, quotas | « Sur la base de l'estimation des résultats définitifs du ministère de l'Intérieur ». Redressement sur le 1er tour non précisé | PDF fourni en local (version 10 h du 25/04), p. 23 (imprimée 22) ; participation p. 9 et 10 |

**Matrices publiées** (Ipsos | Ifop)

| Vote au 1er tour | 2017 Ipsos | 2017 Ifop | 2022 Ipsos | 2022 Ifop |
|---|---|---|---|---|
| Mélenchon | 52/7/41 | 54/14/32 | 42/17/41 | 42/13/45 |
| Hamon | 71/2/27 | 79/4/17 | — | — |
| Jadot | — | — | 65/6/29 | 64/7/29 |
| Macron | — | 97/2/1 | 98/1/1 | 96/1/3 |
| Fillon / Pécresse | 48/20/32 | 51/23/26 | 53/18/29 | 52/18/30 |
| Le Pen | — | 3/91/6 | 3/91/6 | 2/94/4 |
| Dupont-Aignan / Zemmour | 27/30/43 | 26/46/28 | 10/73/17 | 9/78/13 |
| Abstentionnistes du 1er tour | — | — | — | partiel : 32 % de votants, exprimés 59/41 |

**Constats**

- **Couverture.** Les lignes publiées couvrent 95,9 % des exprimés du 1er tour en 2017 et 89,4 % en 2022. Aucune ligne pour Arthaud, Poutou, Lassalle, Asselineau, Cheminade (2017), ni pour Roussel, Hidalgo, Lassalle, Dupont-Aignan, Poutou, Arthaud (2022). Aucune ligne complète pour les non-exprimés du 1er tour (24,2 % des inscrits en 2017, 27,9 % en 2022).
- **Nature des enquêtes.** Les enquêtes Ipsos sont réalisées avant le scrutin et leurs reports sont calés sur des bureaux de vote. Seules les enquêtes Ifop sont des enquêtes du jour du vote.
- **Incohérence interne des rapports Ifop.** La part non exprimée du tableau des reports est inférieure au taux d'abstention du tableau de participation (2022 : Macron 3 contre 8, Le Pen 4 contre 13 ; 2017 : Macron 1 contre 5, Le Pen 6 contre 11). L'hypothèse d'une base « votants du 2nd tour » est écartée en 2022 : elle impliquerait environ 3,0 millions de blancs et nuls de plus que le total officiel. La cause reste inconnue.
- **Provenance des valeurs de `presidentialCenterRn.elections`.**
  - 2017 Mélenchon 53/11/36 et Hamon 75/3/22 : moyenne Ipsos/Ifop.
  - 2022 Mélenchon 42/17/41 et Pécresse 53/18/29 : Ipsos seul.
  - **Fillon 48/23/29 et Jadot 65/8/27 : reproduits par aucune des deux sources** (moyennes : Fillon 49,5/21,5/29, Jadot 64,5/6,5/29).
  - Gauche 2022 (47/15/38) : la pondération par les voix du 1er tour donne 46,0/15,4/38,6.
- **Extrême droite hors finaliste.** Le moteur applique la fidélité du finaliste RN (0/96/4). Les reports mesurés en sont éloignés : Dupont-Aignan 2017 à 30 ou 46 vers Le Pen, Zemmour 2022 à 73 ou 78.
- **Non trouvé.** Notice CDS d'Ipsos 2017 ; annexes d'Ifop 2017 (erreur 404). La version 20 h 50 d'Ifop 2022 n'a pas été téléchargée.

## 4. P2 : recaler les ancres et le défaut du front républicain (avec P1)

### 4.1 Constat préalable

- L'ancre basse (position 0) correspond aux lignes de la présidentielle 2022. Évaluer un préréglage sur 2022 revient donc à rester en échantillon : si P1 réussit, `pres2022` reproduira 2022 par construction.
- Avec 2017 comme ancre (décision 3), le même problème vaut pour 2017. Le backtest du front se fait donc en leave-one-out sur les ancres (règle R2.4).
- Les informations disponibles sur la force du front lors d'une présidentielle se limitent à deux points, plus l'ancre des législatives 2024, qui relève d'un autre type de scrutin. Aucune valeur unique n'est justifiable statistiquement.

### 4.2 Étapes

1. **Ancre basse.** Après P1, la recalculer avec la structure corrigée, par exemple avec la ligne de l'extrême droite hors finaliste.
2. **2017, troisième ancre (décision 3).**
   - Calculer avec le moteur corrigé la position s₂₀₁₇ qui reproduit le résultat de 2017 à partir de son 1er tour réel. Cette position est exprimée sur l'échelle logit où 2022 vaut 0 et 2024 vaut 1. Les finalistes de 2017 y reçoivent leurs lignes mesurées, pas les fidélités 2027 (R2.5).
   - Les lignes mesurées de 2017 deviennent une ancre placée à s₂₀₁₇. L'interpolation logit devient linéaire par morceaux entre les trois ancres rangées par position. Par exemple, si 0 < s₂₀₁₇ < 1, elle va de 2022 à 2017, puis de 2017 à 2024.
   - Si s₂₀₁₇ sort de [0 ; 1], l'échelle et le curseur sont étendus jusqu'à s₂₀₁₇, sans aller au-delà des trois ancres.
   - Fichiers concernés : `transfers.ts` (`applyRepublicanFrontRow`, `frontStrengthForBloc`, écart logit appliqué aux autres profils), `transfers-legislatives-2024.json`, `backtest.ts`, le composant de réglage du front et Méthodologie.
3. **Défaut (décision 2).** Il est fixé par la règle R2.2.
4. **Backtest hors échantillon.** On applique la règle R2.4 : 2017 est évalué avec les seules ancres 2022 et 2024, puis 2022 avec les seules ancres 2017 et 2024.
5. **Migration v17 → v18** (`settingsStore.ts`, `STORAGE_VERSION`).
   - `republicanFront` n'est réinitialisé que si la valeur enregistrée est l'ancien défaut ; les choix explicites sont conservés.
   - Un test couvre la migration.
6. **Changelog.** P1 et P2 forment une seule version de méthode, consignée dans une seule entrée.

### 4.3 Règles à pré-enregistrer

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

## 5. P3 : recaler η et documenter le budget d'incertitude du 2nd tour

**Prérequis.** P1 et P2 sont adoptés ou rejetés.

### 5.1 Faits

Aléas actuels du 2nd tour (`monteCarlo.ts`, vers les l. 594 à 610 au commit `2e673d5`) :

| Aléa | Tirage |
|---|---|
| Position du front (`rfShock`) | normal σ 0,25, borné à ±0,5, ou uniforme sur [−0,5 ; 0,5] en mode `uncertain` |
| Poids déclaré | ±0,5 |
| Report gauche hors LFI | tirage triangulaire |
| Participation | ±5 pts, bornée à [55 ; 88] |
| Mobilisation | ±0,04 |
| q | ±0,08 |
| Fidélité | ±2,5 pts |
| Matrices de reports | Dirichlet κ = 40 |
| Choc commun η | σ 3,0 pts face au RN, 2,0 hors RN, ajouté en points d'exprimés au score final (l. 510) |

Aucune source n'est documentée pour η. `docs/analyse-methode-2026-11-22.md` mentionnait une version antérieure à 4 points.

### 5.2 Étapes

1. **Décomposition de variance.** Couper un aléa à la fois et mesurer l'effet sur la largeur [P10 ; P90] et sur la variance, aux dates du backtest et pour 2027. Refaire le calcul **à 1er tour réel fixé** pour isoler la part propre au 2nd tour.
2. **Recherche de double emploi.**
   - η avec `rfShock`, surtout en mode `uncertain`, qui couvre déjà toute l'étendue des ancres.
   - η avec la Dirichlet, avec les plages de a et q, et avec la fidélité.

   Chaque aléa doit représenter une source d'incertitude distincte, décrite par écrit.
3. **Recalage de η (décisions 4 et 11 du 24/11/2026).** Règle validée, à inscrire datée dans le changelog avant tout calcul de P3 :
   - **Grille.** σ_η face au RN de 0 à 5 points, au pas de 0,25.
   - **Distribution conditionnelle.** Le 1er tour réel est fixé et tous les autres aléas du 2nd tour restent actifs. Le front est évalué en leave-one-out sur les ancres (R2.4), pour que le résidu ne soit pas nul par construction.
   - **Finalistes (R2.5).** Ils reçoivent les lignes R1.1 de leur élection ; l'aléa de fidélité (±2,5 pts) reste actif autour de ces lignes. Sinon, η absorberait l'écart entre les fidélités 2027 et celles de 2017 et 2022, qui n'existe pas dans la prévision 2027. La courbe du CRPS obtenue avec les fidélités 2027 est publiée pour comparaison.
   - **Choix.** On retient le σ_η qui minimise le CRPS conditionnel moyen sur 2017 et 2022, parmi les valeurs où les deux résultats réels tombent dans leur [P10 ; P90] conditionnel. À égalité, on prend la plus petite valeur.
   - **η hors RN.** Il est recalé sur 2012 (Hollande – Sarkozy) seulement si les reports hors RN du moteur ne proviennent pas de 2012. Sinon, σ = 2,0 est conservé et documenté comme hypothèse.
4. **Publication.** Ajouter au backtest la largeur et le CRPS du 2nd tour, à côté de la couverture. Publier aussi la courbe complète du CRPS en fonction de σ_η.

### 5.3 Critères d'adoption (validés le 24/11/2026, décision 11)

- La couverture de 2017 et de 2022 est maintenue.
- La largeur moyenne baisse.
- Le CRPS du 2nd tour se dégrade au plus de 2 %.
- Avec deux points face au RN, on ne vise jamais une couverture nominale précise.

## 6. P4 : sondages de l'entre-deux-tours (affichage seulement)

### 6.1 Objectif

Montrer l'écart entre les sondages publiés **entre les deux tours** et le résultat, puisque c'est l'objet de la discussion sur le « front républicain ». Le périmètre (décision 5) couvre :

- les présidentielles 2017 et 2022 (Macron – Le Pen) ;
- les législatives 2024, uniquement pour les duels de circonscription dont la paire de partis est strictement identique à celle du duel affiché.

2002 est exclu, car trop ancien. Ces sondages ne servent à aucun calcul.

### 6.2 Étapes

1. **Données présidentielles.** Compléter `src/data/second-round-poll-bias.json` avec les sondages publiés entre les deux tours de 2017 et de 2022.
   - Ajouter un champ `phase` (`avantPremierTour` ou `entreDeuxTours`) à chaque sondage.
   - S'arrêter aux derniers sondages publiés avant l'interdiction légale.
   - Sourcer chaque valeur avec son URL, sans aucune valeur extrapolée.
2. **Données législatives 2024.** Elles vont dans un fichier séparé, par exemple `src/data/legislative-duel-polls-2024.json`, avec son schéma Zod.
   - **Périmètre.** Sondages de circonscription publiés entre les deux tours (1er tour le 30/06/2024, 2nd tour le 07/07/2024), pour un **duel** uniquement : les triangulaires sont exclues.
   - **Contenu de chaque fiche.** Circonscription, institut, dates, effectif, scores et URL, ainsi que le résultat officiel du 2nd tour dans la circonscription, avec sa source.
   - **Étiquette de parti.** Les nuances officielles ne suffisent pas : les candidats du Nouveau Front populaire sont regroupés sous une nuance commune, et le RN est distingué de ses alliés. L'appartenance (LFI, RN…) est donc établie candidat par candidat, avec sa source.
   - **Disponibilité inconnue.** Le nombre de sondages de circonscription publiés entre les deux tours reste à inventorier. Si aucun n'existe pour une paire de partis, rien n'est affiché et la méthodologie le dit.
3. **Règle d'identité stricte.**
   - Un sondage législatif n'est affiché que si sa paire de partis est exactement celle du duel affiché. Par exemple, LFI – RN pour un duel Mélenchon – Le Pen ; un duel entre un allié du RN et LFI ne compte pas.
   - La correspondance entre candidat 2027 et parti est écrite dans le fichier de données, jamais déduite.
4. **Schéma.** Adapter le schéma Zod (`schema.ts`, vers la l. 357) et la validation.
5. **Calculs.** `pollBiasGaps`, `directPollRmse` et `directPollGapAlert` filtrent sur `avantPremierTour` et ignorent le fichier législatif. Les mesures actuelles (−4,1 et −3,3) restent ainsi **inchangées**.
6. **Interface.** Dans `SecondRoundDuel.tsx`, ajouter deux tableaux distincts :
   - « Entre-deux-tours (pour mémoire, non utilisé dans le calcul) » ;
   - pour le duel affiché seulement, « Législatives 2024, même duel de partis ».

   Mentionner l'ajout dans Méthodologie.
7. **Tests.**
   - Les valeurs de `pollBiasGaps` et `directPollRmse` sont identiques avant et après l'ajout.
   - La sortie de `runMonteCarlo` à graine fixe ne change pas.
   - La règle d'identité stricte est testée, y compris le cas d'une paire voisine qui doit être exclue.

## 7. Ordre et dépendances

1. **P1 + P2** : une seule version de méthode, la v2.3. L'option 3, abandonnée, n'a jamais été commitée sous ce numéro. L'étape 0 de P1 est faite (section 3.3). La suite commence par l'inscription datée des règles R1.1 à R1.14 et R2.1 à R2.5 dans le changelog, avant tout calcul.
2. **P3** : après P1 et P2, parce que les résidus conditionnels dépendent du moteur corrigé et des trois ancres.
3. **P4** : techniquement indépendant (données et affichage), placé en dernier comme demandé.

Chaque étape se termine par `bun run lint`, `bun run typecheck`, `bun run test` et `bun run build`. Aucun commit n'est fait sans demande explicite.

## 8. Risques

- **Surajustement.** On ne dispose que de deux duels présidentiels face au RN. Les règles sont écrites avant calcul et les corrections passent par des mesures, pas par des paramètres libres.
- **Double emploi de 2017.** 2017 sert à la fois d'ancre et de point de backtest. Le leave-one-out sur les ancres (R2.4) évite de le compter comme une validation.
- **Recalage de η sur deux points.** Le résultat sera fragile. La courbe complète est publiée et la règle est figée avant calcul.
- **Matrices partielles.** Les lignes publiées laissent sans mesure les petits candidats (4,1 % des exprimés du 1er tour en 2017, 10,6 % en 2022) et les non-exprimés du 1er tour. La reproduction ne peut donc pas être vérifiée en entier : elle se limite au contrôle du résidu (R1.8). Une ligne manquante n'est jamais inventée ; l'hypothèse actuelle est conservée et documentée.
- **Nature des enquêtes.** Elles sont déclaratives et redressées. Les enquêtes Ipsos sont réalisées avant le scrutin et calées sur des bureaux de vote. Les rapports Ifop présentent une incohérence interne, de cause inconnue (section 3.3). La reproduction vérifie la cohérence des enquêtes, pas leur exactitude. Les variantes R1.6 et R1.7 montrent la sensibilité au choix de la source.
- **Fidélités hors période.** Le backtest applique à 2017 et 2022 des fidélités mesurées pour 2027. Le diagnostic (f) en mesure l'effet sans le corriger (R1.11). Les grandeurs ajustées sur le passé (s₂₀₁₇, η) ne doivent pas absorber cet écart (R2.5).
- **Transposition à 2027.** Le poids et le comportement de l'extrême droite hors RN dépendent du contexte : ralliement de 2017, candidature Zemmour de 2022. L'ancre des législatives 2024 relève d'un autre type de scrutin.
- **Sondages législatifs.** Les sondages de circonscription sont rares et portent sur de petits échantillons. Ils sont affichés à titre d'illustration, jamais agrégés en mesure de biais.
- **Sensibilité politique.** Les corrections déplacent le centre de la prévision. Le résultat est publié quel que soit son sens, sans paramètre propre à un camp.
- **Diffusion.** Une validation humaine et l'avis d'un juriste sur la loi n° 77-808 du 19/07/1977 sont nécessaires avant toute publication.

## 9. Décisions

### 9.1 Prises le 24/11/2026

1. **Neutralité de P1.** Accepté : les corrections mesurées peuvent déplacer le centre de la prévision, et l'effet est publié quel que soit son sens.
2. **Défaut du front (R2.2).** Accepté : `pres2022` si 2017 et 2022 désignent le même préréglage, `uncertain` sinon.
3. **Rôle de 2017.** Troisième ancre (R2.3), avec un leave-one-out sur les ancres (R2.4).
4. **η.** À recaler (section 5.2, étape 3).
5. **Périmètre de P4.** 2002 exclu. Législatives 2024 incluses, uniquement pour les duels de partis strictement identiques au duel affiché.
6. **Validation.** Les modifications de P2, P3 et P4 décrites ci-dessus sont validées, ainsi que les choix de la section 9.2. Le scénario « Lagarde seule » reste inchangé pour l'instant.
7. **Sourçage (étape 0 de P1).** Le PDF Ifop-Fiducial 2022 a été fourni en local. La recherche web des enquêtes Ipsos 2017 et 2022 et Ifop 2017 est autorisée.
8. **Adaptation de l'étape 1 de P1**, validée après le sourçage (section 3.3) :
   - **Format et sources.** Trois colonnes : finaliste opposé au RN / RN / non-exprimé. La règle R1.1 (moyenne Ipsos/Ifop) est maintenue. Les variantes « Ipsos seul » et « Ifop seul » sont publiées pour comparaison et ne sont jamais retenues d'après le backtest.
   - **Incohérence Ifop.** Le tableau des reports est retenu tel que publié. La variante où la colonne non-exprimé est remplacée par le taux d'abstention du tableau de participation (finalistes remis à l'échelle) est publiée pour comparaison et n'est jamais retenue.
   - **Reproduction partielle et résidu.** Les lignes publiées sont appliquées à leurs candidats. On en déduit le résidu attribuable aux petits candidats et aux non-exprimés du 1er tour (27,3 % des inscrits en 2017, 35,5 % en 2022). Le résidu doit être réalisable : chaque colonne est comprise entre 0 et la population concernée. Il est comparé à titre indicatif aux chiffres de l'Insee. S'il n'est pas réalisable, on s'arrête pour analyser. La tolérance R1.2 ne s'applique qu'au moteur complet, à l'étape 2.
   - **Petits candidats.** Aucune ligne n'est inventée. La simplification (c) n'est pas mesurable directement : son effet est borné par la taille du résidu.
   - **Ligne du centre (e).** Non testable en 2017 et 2022, car le centre était le bloc du finaliste (`transfers.ts:126`). Elle est retirée de l'étape 2 et reste une hypothèse documentée.
   - **Fillon et Jadot.** Les valeurs R1.1 remplacent celles du dépôt dans le nouveau fichier de matrices, seulement si P1 est adopté (R1.4). Il n'y a pas de correction isolée.
9. **Règles R1.11, R1.13 et R1.14.** Validées :
   - R1.11 avec le critère strict : l'effet de (f) reste compté dans R1.4 ;
   - R1.13 telle que rédigée ;
   - R1.14 avec la moyenne simple des deux élections.
10. **Exécution.** Confiée à un agent Sonnet en effort medium, après validation complète du plan, selon les consignes de la section 10. D'ici là, on rédige seulement le plan : ni code, ni entrée de changelog, ni fichier de données.
11. **Derniers points du plan.** Validés :
    - R2.5 (section 4.3) et son application à η (section 5.2, étape 3) ;
    - la règle de recalage de η (section 5.2, étape 3) et les critères d'adoption de P3 (section 5.3), couverts par la décision 6 ;
    - les consignes pour l'agent d'exécution (section 10).
12. **Validation d'ensemble.** Le plan est validé. L'utilisateur lance lui-même l'agent d'exécution, qui suit la section 10.

### 9.2 Retenues par défaut, telles que proposées, sauf avis contraire

- **Sources (R1.1).** Moyenne d'Ipsos et d'Ifop. Le PDF Ifop-Fiducial 2022 a été fourni en local (décision 7).
- **Seuils (R1.2 à R1.4).** Tolérance de ±1 point, seuil de 0,5 point, critères d'adoption.
- **a et q.** Mesure de référence et plage du Monte-Carlo, fixées après réconciliation des définitions Ifop et Insee.
- **Migration.** Seuls les utilisateurs restés sur l'ancien défaut sont réinitialisés.
- **η.** Grille de 0 à 5 points au pas de 0,25. 2012 est utilisé pour η hors RN seulement si les reports hors RN ne viennent pas de 2012.
- **Stockage de P4.** Champ `phase` pour les présidentielles, fichier séparé pour les législatives.

### 9.3 Validation d'ensemble

Le plan est validé dans son ensemble le 24/11/2026 (décision 12). Aucun point ne reste ouvert.

## 10. Consignes pour l'agent d'exécution

Destinataire : l'agent d'exécution (décisions 10 et 12). Il n'est lancé qu'après validation complète du plan et lit le plan en entier avant d'agir. En cas d'ambiguïté, il s'arrête et pose la question au lieu de trancher.

### 10.1 Périmètre d'un lancement

- **Un lancement couvre P1 + P2** (v2.3). P3 et P4 font chacun l'objet d'un lancement séparé, après décision sur P1 + P2.
- **Répertoire et branche** : ceux qu'indique l'utilisateur au lancement. Le plan doit y être présent, car il n'est pas encore suivi par git.
- **Valeurs des enquêtes** : celles de la section 3.3, déjà relevées, sans nouveau sourçage. Une valeur manquante ou douteuse entraîne un arrêt et une question. Aucun PDF n'est ajouté au dépôt.
- **Voix des finalistes de 2017** : relevées dans la décision n° 2017-171 PDR du Conseil constitutionnel, avec l'URL. Si la source n'est pas accessible, l'agent s'arrête et demande.

### 10.2 Ordre et points d'arrêt

Chaque arrêt donne lieu à un compte rendu (section 10.5). L'agent attend une validation explicite avant de continuer.

| # | Travail | Arrêt pour validation |
|---|---|---|
| 1 | Recopier mot pour mot, datées, les règles R1.1 à R1.14 et R2.1 à R2.5 dans `docs/changelog-methode.md`, sous une entrée « v2.3 (en préparation) ». | Texte inscrit, avant tout calcul. |
| 2 | P1, étape 1 : voix 2017 dans `reference-2017.json` ; fichier de matrices et schéma Zod (section 3.1, étape 4), créés dès ici parce que le script les lit, mais non branchés sur le moteur par défaut (R1.12) ; script de reproduction partielle ; variantes R1.6 et R1.7 ; contrôle R1.8. Si le résidu R1.1 n'est pas réalisable, arrêt immédiat. | Contributions, résidus et contrôles. |
| 3 | Réconciliation des définitions Ifop et Insee pour a et q (R1.13), rédigée et datée dans le changelog. | Texte de la réconciliation, avant l'étape 2. |
| 4 | P1, étape 2 : configuration de référence (tolérance R1.2), puis dégradations (a), (b), (d) et (f) dans les deux ordres ; borne de (c). Si R1.2 n'est pas respectée, arrêt immédiat. | Tableau des contributions. |
| 5 | P1, étape 3 : corrections retenues selon R1.3, R1.12 et R1.14 ; évaluation R1.4, avec les variantes publiées. | Décision d'adoption de P1, prise par l'utilisateur. |
| 6 | P2 : ancre basse, s₂₀₁₇ selon R2.5, interpolation entre les trois ancres, leave-one-out R2.4, défaut selon R2.2. | s₂₀₁₇ et défaut proposé, avant toute modification du défaut. |
| 7 | Migration v17 → v18, suppression du repli à 66,1, valeurs attendues des tests mises à jour seulement si P1 est adopté, documentation, entrée de changelog, effet sur 2027 (R1.5). | Diff complet, avant tout commit. |

Si P1 est rejeté à l'arrêt 5, l'agent publie les résultats dans la documentation et le changelog, ne modifie aucun défaut et ne passe pas à P2 sans nouvelle instruction.

### 10.3 Interdits

- Ajuster une valeur pour réduire un écart au résultat réel. Seules les grandeurs définies par les règles sont calculées : s₂₀₁₇ ici, σ_η en P3.
- Inventer une valeur, une ligne de report ou une source.
- Utiliser les sondages directs de 2nd tour 2027 pour caler quoi que ce soit.
- Ajouter un paramètre réglable propre à un candidat, un parti ou un bloc nommé. Les lignes mesurées par candidat historique sont des données sourcées, utilisées comme le décrit la section 3.
- Modifier le scénario « Lagarde seule », σ_ref (0,825) ou le modèle du 1er tour.
- Changer un réglage par défaut sans entrée datée dans le changelog.
- Modifier les valeurs attendues des tests du backtest avant l'adoption de P1, ou désactiver un test pour faire passer la suite.
- Commiter, pousser, utiliser `git stash` sans message ni identifiant, ajouter `.serena/` ou un PDF au dépôt.
- Reproduire le nom ou les coordonnées d'un salarié d'institut.
- Publier ou diffuser quoi que ce soit. Une validation humaine et l'avis d'un juriste sur la loi n° 77-808 du 19/07/1977 sont requis avant toute diffusion.

### 10.4 Vérifications

Après chaque ligne du tableau 10.2 qui modifie du code ou des données : `bun run lint`, `bun run typecheck`, `bun run test` et `bun run build`. Un échec est rapporté avec sa sortie, jamais contourné.

### 10.5 Compte rendu à chaque arrêt

En français, en commençant par l'essentiel :

- ce qui a été fait et les fichiers modifiés ;
- les chiffres obtenus, avec leur origine (fichier et ligne, ou page du PDF) ;
- les écarts au plan, avec leur raison ;
- les faits, les hypothèses et les inconnues, distingués ;
- les questions qui bloquent la suite.

## 11. État d'avancement au 24/11/2026

| Chantier | Statut | Synthèse |
|---|---|---|
| **P1** — Audit du moteur du 2nd tour | **Exécuté et rejeté** (24/11/2026) | Lignes 1 à 5 du tableau 10.2 exécutées intégralement. Rejeté par le responsable du projet après échec des critères pré-enregistrés R1.2 et R1.4. Aucun réglage par défaut modifié (`STORAGE_VERSION = 17`, méthode v2.2 inchangée) ; matrices brutes 2017–2022 archivées mais non branchées (R1.12). Voix officielles du 2nd tour 2017 ajoutées dans `src/data/reference-2017.json` et repli codé en dur à `66,1` supprimé dans `src/domain/backtest.ts` sur décision explicite. |
| **P2** — Ancre basse et défaut du front républicain | **Non engagé** | Dépend de P1 (non engagé suite au rejet de P1 ; un nouveau cadrage est requis avant toute reprise). |
| **P3** — Incertitude du 2nd tour (recalage de η) | **Non engagé** | Dépend de P1 + P2 (résidus conditionnels dépendants du moteur et des ancres). |
| **P4** — Sondages de l'entre-deux-tours (affichage seulement) | **Réalisé et vérifié** (24/11/2026) | Indépendant de P1–P3. Aucun impact sur les calculs ni sur Monte-Carlo. |

### 11.1 Bilan synthétique de P1 (rejeté)

- **Pré-enregistrement (ligne 1)** : règles R1.1–R1.14 et R2.1–R2.5 copiées mot pour mot dans `docs/changelog-methode.md`, puis réconciliation R1.13 validée (Option A : `a_ref = 0,14`, `q_ref = 0,59`).
- **Étape 1 (ligne 2)** : matrices brutes des 4 enquêtes 2017–2022 validées dans `src/data/second-round-reference-matrices.json` (`src/data/schema.ts`, `src/domain/secondRoundReproduction.ts`, `scripts/reproduce-second-round.ts`). Résidu R1.1 réalisable en 2017 et 2022 (seule la variante R1.6 « Ifop seul publié » 2017 échoue avec `−40 812` voix sur Le Pen).
- **Étape 2 (ligne 4)** : la configuration de référence échoue à la tolérance **R1.2** (±1 pt de part et ±1 pt d'inscrits par volume) en 2017 (`−2,04 pts` sur Macron ; volume Macron `−2,20 pts` d'inscrits) et en 2022 (volume Macron `−2,25 pts`, volume Le Pen `−1,001 pt` d'inscrits), ainsi que toutes les variantes R1.6/R1.7 (`src/domain/secondRoundDegradation.ts`, `scripts/step2-degradation.ts`). Dégradations mesurées : `(b)` extrême droite hors finaliste (`−1,14 / +1,11 pt` en 2017 ; `−1,81 / +1,72 pt` en 2022) passe seul le seuil R1.3 (≥ 0,50 pt, même signe) ; `(a)` et `(d)` restent sous 0,50 pt ou de signe opposé ; diagnostic `(f)` fidélité finalistes `−0,68 / +0,66 pt` en 2017 et `+0,02 / −0,02 pt` en 2022.
- **Étape 3 (ligne 5)** : l'application de `(b)` seul (R1.14 : moyenne simple Dupont-Aignan 2017 / Zemmour 2022 = `25,25 / 55,0 / 19,75 %`) échoue à **R1.4** (`src/domain/secondRoundStep3.ts`, `scripts/step3-evaluation.ts`) : erreur en échantillon `−2,65 pts` en 2017 (> 1 pt) et erreur croisée moyenne dégradée (`1,51 pt` contre `1,40 pt` actuellement ; agrégats législatifs 2024 stables à ±0,00 pt).
- **Décision** : P1 rejeté le 24/11/2026 ; audit publié dans `src/ui/pages/Methodology.tsx`, `docs/changelog-methode.md` et `README.md`. Repli codé en dur à `66,1` supprimé dans `src/domain/backtest.ts` (lit désormais `reference-2017.json`).

### 11.2 Bilan synthétique de P4 (réalisé)

- **Présidentielles 2017 et 2022** (`src/data/second-round-poll-bias.json`) : champ `phase` (`avantPremierTour` | `entreDeuxTours`) ajouté et validé par dates ; ajout de **22 sondages** entre-deux-tours en 2017 (`23/04` au `05/05/2017`, moyenne `60,98 %`, derniers `62,67 %` vs `66,10 %`) et **42 sondages** en 2022 (`10/04` au `22/04/2022`, moyenne `54,61 %`, derniers `56,20 %` vs `58,55 %`).
- **Législatives 2024** (`src/data/legislative-duel-polls-2024.json`) : après inventaire complet (Wikipédia FR/EN, notices Commission des sondages n° 9865–9888, publications Ifop juillet 2024), 4 sondages locaux ont été réalisés avant le 1er tour (exclus) et **1 seul duel de circonscription d'entre-deux-tours** a été identifié : 6e circonscription du Calvados (Ifop-Fiducial pour Sud Radio, `02–03/07/2024`, `n = 611` inscrits, Élisabeth Borne `Renaissance` `54 %` vs `56,36 %`, Nicolas Calbrix `RN` `46 %` vs `43,64 %`). Table `candidateParties` explicite pour les 19 candidats 2027 ; règle d'identité stricte implémentée dans `matchingLegislativeDuelPolls` (`src/domain/secondRound.ts`).
- **Invariance et affichage** : `pollBiasGaps`, `directPollRmse` et `runMonteCarlo` (graine `2027`) sont strictement inchangés (vérifié par tests). Deux tableaux distincts ajoutés dans `src/ui/components/SecondRoundDuel.tsx`, documentés dans `src/ui/pages/Methodology.tsx`, `docs/changelog-methode.md` et `README.md`.

### 11.3 Vérifications (24/11/2026)

- `bun run lint` : OK
- `bun run typecheck` : OK
- `bun run test` : 27/27 fichiers, 241/241 tests passés
- `bun run build` : OK

