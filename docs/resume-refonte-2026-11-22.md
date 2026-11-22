# Résumé détaillé de la refonte du simulateur (v2 — 22 novembre 2026)

Ce document récapitule de façon précise et exhaustive l’ensemble des suppressions, corrections méthodologiques, nouvelles fonctionnalités, évolutions d’interface et vérifications réalisées sur `simulateur2027`.

---

## 1. Vue d’ensemble

À la suite d’un audit critique complet du code existant et des données historiques (présidentielles 2017 et 2022, législatives 2024), le simulateur a fait l’objet d’une refonte complète articulée autour de cinq axes :

1. **Suppression des corrections déterministes sur-ajustées** qui dégradaient la précision hors échantillon (biais de blog, ratios 2017–2022, régression écologique OLS de Goodman, redressement de participation par certitude de vote, alliances extrapolées par reports de 2nd tour).
2. **Reconstruction d’un moteur de calcul sobre et comptablement exact** : 1er tour pondéré (demi-vie 14 j + projection d’offre intra-institut par paires propres) et 2nd tour unifié en flux bruts (% des électeurs inscrits).
3. **Quantification explicite de l’incertitude et backtest automatisé** : simulation Monte-Carlo déterministe (2 000 tirages) et validation historique hors échantillon intégrée sur `/methodologie`.
4. **Projection temporelle optionnelle vers avril 2027** : vote utile intra-bloc réglable séparément par bloc, léger amortissement des écarts précoces, archivage automatique de l’historique 2025–2027 (66 vagues réelles) et graphique de trajectoire avec cône d’incertitude à 80 %.
5. **Modèle homogène du front républicain (vote de rejet du RN)** sur les 4 types de duels face au RN, couplé aux nouveaux votants et directement ajustable globalement et par famille de duel.

> **Règle d’or conservée tout au long de la refonte :** aucun paramètre par défaut n’est recalibré sur les sondages directs de 2nd tour 2027 (qui restent un repère d’affichage indépendant).

---

## 2. Stratégies et modules supprimés

| Module / Fichier supprimé | Raison empirique et méthodologique |
| --- | --- |
| `src/domain/blogBias.ts`, `blogBias.test.ts` | L’effet mesuré en 2022 reposait en grande partie sur un artefact de filtrage (`withOthers: false` excluant Arnaud Montebourg à 2–4 % et renormalisant mécaniquement la gauche à la hausse), changeait de signe selon la fenêtre et manquait de sondages exploitables en 2017. |
| `src/domain/corrections.ts`, `corrections.test.ts`, `progression.ts`, `progression.test.ts`, `references.ts`, `references.test.ts`, `pastElections.ts`, `calibration.ts` | Extrapoler des erreurs ou dynamiques candidat par candidat depuis $n = 1$ à $2$ élections dégrade le RMSE hors échantillon (en 2017, la correction croisée par ratio fait passer le RMSE de `0,58 pt` à `1,18 pt`). `reference-2017.json` et `reference-2022.json` sont conservés uniquement pour le backtest et le calibrage de la variance. |
| `src/domain/transferCorrection.ts`, `transferCorrection.test.ts` | La régression écologique OLS de Goodman sur les 342 circonscriptions de 2024 produisait des estimations hors bornes (`−8,8 % / 107,3 %`), rejetées sur les blocs des finalistes mais conservées sur les blocs colinéaires (`centre`, `droite`), gonflant artificiellement le score du challenger de `+4` à `+5 pts`. L’enquête Ipsos-Talan brute concorde déjà à `0,6–1,3 pt` près avec les urnes agrégées de 2024. |
| `src/domain/turnout.ts`, `turnout.test.ts`, `src/sync/turnout.ts`, `turnout.test.ts`, `src/data/turnout-certainty.json`, notices texte associées, dépendance `unpdf` | La transposition d’un indicateur de certitude de vote 5 mois avant le scrutin sur le vote 2022 des abstentionnistes de 2017 n’était pas identifiée et reposait sur un scraping PDF fragile. |
| Mode d’abandon « par camps » (`campDropout`), `src/ui/dropout.ts`, soustraction uniforme `u = N / X` et réconciliation `grossFlows()` | Le mode « camps » écrasait artificiellement l’abstention de blocs entiers (ex. électeurs de Glucksmann tombant de `25 %` à `2,0 %` d’abstention dans un duel Le Pen – Mélenchon), et `grossFlows()` déformait les taux affichés pour réconcilier un calcul net avec les nouveaux votants. |
| `allianceSplit2024` et `src/ui/components/AllianceRates.tsx` | Transposer des reports de 2nd tour face au RN à des fusions de 1er tour était méthodologiquement incohérent (et aboutissait à un report de 100 % lorsque le RN menait une alliance). Seules les alliances effectivement testées par les sondeurs sont proposées. |

---

## 3. Refonte du moteur de calcul (`src/domain/`)

### 3.1 Agrégation du 1er tour et projection d’offre (`pollAverage.ts`, `offerProjection.ts`, `alliances.ts`)
- **Pondération exponentielle fraîcheur × échantillon** :
  $$w_i = 2^{-\text{âge}_i / 14} \times \sqrt{\frac{\min(n_i,\, 2\,000)}{1\,000}}$$
  La demi-vie de **14 jours** divise par deux le poids d’un sondage toutes les deux semaines, et le plafond à **2 000 répondants** empêche une grande enquête ancienne d’écraser les vagues récentes.
- **Seuil d’entrée des petits candidats (`MIN_MINOR_INSTITUTES = 3`)** : un petit candidat n’entre dans l’offre de base (et dans la promotion automatique `sync.ts`) que s’il est testé par au moins 3 instituts distincts. Sur la base actuelle : **5 retenus** (`ruffin`, `villepin`, `polony`, `lisnard`, `riner`), **3 écartés** (`bouamrane`, `lagarde`, `asselineau`).
- **Correction du bug `observedDonors`** : seules les paires strictement *ceteris paribus* au sein d’un même sondage (`|a \ b| = 1`, `|b \ a| = 0`) servent à estimer les donneurs d’un petit candidat, supprimant les imputations parasites.
- **Projection d’offre intra-institut (`offerProjection.ts`)** : activée par défaut (désactivable dans les paramètres), elle réintègre les instituts récents qui ne testent pas exactement l’offre cible (distance ≤ 2 candidats, ex. Odoxa et Cluster17 sans Attal sur leur hypothèse principale) en appliquant les transferts mesurés sur paires exactes mono-candidat des autres instituts. Sur la base actuelle : **8 instituts agrégés dont 2 projetés**.
- **Alliances testées uniquement (`alliances.ts`)** : seules les configurations effectivement posées aux sondés sont activables ; les électeurs du candidat rallié sont répartis directement par les réponses des sondés.

### 3.2 Second tour unifié en flux bruts (`secondRound.ts`, `transfers.ts`, `newVoters.ts`)
- **Identité comptable exacte en % des électeurs inscrits** :
  $$V_A = E_1 \sum_c x_c \, \pi_{c \to A} + (100 - P)\, a \, q_A, \qquad \text{Score}_A = \frac{100 \, V_A}{V_A + V_B}$$
  avec $V_A + V_B + \text{NonExprimés} + \text{BlancsNuls}_1 = 100\,\%$ des inscrits, aucun recalibrage post-hoc par camp.
- **Fidélité différenciée par finaliste** (`transfers-legislatives-2024.json`) : Le Pen `96 / 1 / 3`, Mélenchon `92 / 2 / 6`, défaut `95 / 1,5 / 3,5` (surcharge uniforme manuelle possible dans les réglages avancés).
- **Duels hors RN** : calibrés sur les enquêtes « jour du vote » des présidentielles **2007** (Sarkozy–Royal) et **2012** (Hollande–Sarkozy) pour les duels gauche vs centre/droite ; matrice de repli symétrique documentée réservée aux duels de même camp (avec avertissement explicite).
- **Option « Déclarations 2027 » (`transfers-2027-declared.json`)** : désactivée par défaut, activable seule (`declared2027`) ou en mélange pondéré (`blend`). Applique une correction sur échelle **logit multinomial** ($\delta_{\text{finaliste}} = +0,35$, $\delta_{\text{RN}} = -0,20$ par rapport à l’abstention) mesurée sur l’écart moyen campagne → jour du vote en 2017 et 2022, garantissant le respect strict des bornes `[0 ; 100]` et de la somme à 100 %.
- **Allègement des données de 2024 (`second-round-dropout.json`)** : les 342 circonscriptions individuelles (`162 Ko`) ont été remplacées par leurs 4 agrégats exacts (`12 Ko`) utilisés pour le contrôle de cohérence.

### 3.3 Modèle homogène du Front républicain (vote de rejet du RN) (`transfers.ts`, `secondRound.ts`, `monteCarlo.ts`)
En 2017 comme en 2022, ~42 à 43 % des électeurs d’Emmanuel Macron au 2nd tour votaient avant tout par rejet du RN. Un premier patch avait introduit un mélange 50/50 législatives 2024 / présidentielles 2017–2022 uniquement pour `ensemble_rn`, ce qui créait une anomalie interne : les électeurs de gauche se reportaient davantage sur un candidat LR (`70 %`) que sur un candidat du centre (`62,3 %`), donnant à David Lisnard un avantage artificiel de 6 points sur Édouard Philippe face au RN.

Ce patch asymétrique a été remplacé par un **modèle homogène du front républicain** couvrant les **4 types de duels face au RN** (`lfi_rn`, `ecolo_ps_pcf_rn`, `ensemble_rn`, `lr_rn`) :
- **Échelle commune ancrée sur l’histoire (`0 %` à `100 %`)** :
  - `100 %` (**Niveau 2017 / barrage fort**) : part directement des taux Ipsos-Talan 2024 pour `ensemble_rn`, `ecolo_ps_pcf_rn` et `lfi_rn` (qui intègrent déjà la différence de compatibilité entre candidats, sans double décote sur LFI) ; seule la ligne `gauche → lr_rn` reçoit un léger ajustement logit ($\delta_f = -0,35$, $\delta_r = +0,55$) afin de rester strictement inférieure à `gauche → ensemble_rn`.
  - `75 %` (**Niveau 2022**) : applique l’érosion mesurée entre 2017 et 2022 (reproduit Macron–Le Pen 2022 à `+0,40 pt` près).
  - **Défaut 2027 (`Érodé 2027`)** différencié par famille de duel : **Centre / Droite `55 %`**, **Gauche modérée `50 %`**, **LFI `35 %`**.
  - `0 %` (**Effacé**) : érosion maximale du barrage.
- **Équation en logit multinomial (`applyRepublicanFrontRow`)** : pour une érosion $e = 1 - F$, $\delta_f = -0,45\,e$ (bloc voisin), $-1,35\,e$ (bloc opposé), $-1,50\,e$ (bloc éloigné) ; le basculement s’effectue prioritairement vers l’**abstention/blanc**, avec un glissement modéré vers le RN ($\delta_r = +0,10\,e$ voisin, $+0,15\,e$ sur blocs à RN ≥ 6 %, $+1,40\,e$ uniquement sur les taux planchers < 6 % issus des désistements 2024).
- **Couplage aux nouveaux votants** (`effectiveAbstainerAntiRnShare`) : l’orientation anti-RN des abstentionnistes mobilisés (`55 %` de référence au niveau 2022, $F = 0,75$) évolue linéairement avec la force du front républicain du duel et retombe à `50 / 50` lorsque $F = 0$ ou hors duel RN.
- **Propagation dans Monte-Carlo** : tirage d’un choc corrélé national sur la tenue réelle du front républicain ($\sigma = 15\text{ pts}$, borné à $\pm 35\text{ pts}$) appliqué de manière homogène aux 4 profils et aux nouveaux votants.

### 3.4 Projection temporelle optionnelle vers avril 2027 (`campaignProjection.ts`, `polls-history-2027.json`)
Désactivée par défaut (l’ouverture reste la photographie actuelle des sondages), activable en un clic, et construite sur **3 piliers transparents qui s’annulent tous exactement à J−0** (`horizonFactor = clamp(joursRestants / 150, 0, 1)`) :

1. **Pilier 1 — Vote utile intra-bloc séparé par bloc** :
   - Cibles de concentration du candidat pivot calibrées sur 2017–2022 : **70 %** à gauche, **75 %** au centre, **75 %** à droite, **78 %** à l’extrême droite (déjà saturée à ~86 %, donc sans poussée artificielle).
   - **Intensité (`0–100 %`) et candidat pivot (`Auto` ou candidat forcé)** réglables séparément pour chaque bloc.
   - **Option « Regrouper Centre + Droite »** (`mergeCenterRight`, cible 65 % façon 2022) désactivée par défaut : le backtest montre en effet que garder les 4 blocs séparés améliore *à la fois* 2017 et 2022 (alors qu’un regroupement systématique dégrade 2017 en vidant Macron au profit de Fillon avant le *Penelopegate*).
   - Garde-fous : **fuite de 12 %** hors bloc vers les autres camps, **plancher protégé à 0,5 %**, pondération de drainage qui préserve les co-favoris forts.
2. **Pilier 2 — Amortissement léger des écarts précoces (*mean reversion*)** :
   - Rappel des totaux de blocs vers des fondamentaux structurels (50 % présidentielles 2017–2022 + 50 % législatives 2024), poids maximal **25 % à J−150**, décroissant jusqu’à 0 à J−0 (curseur `0–100 %`, défaut `50 %`).
3. **Pilier 3 — Historique réel 2025–2027 et tendance récente amortie** :
   - Archivage automatique de **66 vagues réelles** extraites de Wikipedia (`2025-03-26 → 2026-11-17`) dans `src/data/polls-history-2027.json` (mis à jour quotidiennement par `sync-polls`).
   - Calcul d’une tendance récente amortie exponentiellement sur **21 jours**, centrée à somme nulle et plafonnée à **±2,5 pts** (curseur `0–100 %`, défaut `50 %`).

### 3.5 Simulation Monte-Carlo déterministe (`monteCarlo.ts`)
- **2 000 tirages déterministes** (PRNG Mulberry32, graine `2027`) :
  - **1er tour** : chocs Student-$t(8)$ en log-ratio à moyenne nulle décomposés en choc de bloc (50 %), vote utile intra-bloc à somme nulle (30 %) et choc idiosyncrasique (20 %), dont la variance décroît linéairement jusqu’au scrutin (`σ_campagne = 0,40` à J−156, plancher sondagier `0,14`).
  - **2nd tour** : matrices Dirichlet ($\kappa = 40$, ±5 à 7 pts par ligne), choc corrélé sur le front républicain ($\sigma = 15\text{ pts}$), incertitude sur la participation (±5 pts), mobilisation (±4 pts) et orientation des abstentionnistes, fidélité (±2,5 pts) et choc commun national ($\sigma = 3,0\text{ pts}$ face au RN, $2,0\text{ pts}$ hors RN).
- Produit pour chaque candidat la médiane, l’intervalle à 80 % (`P10–P90`), la probabilité de qualification et la probabilité de victoire, ainsi que la distribution conditionnelle de tous les duels plausibles.

### 3.6 Validation historique automatisée (`backtest.ts`)
Évalue automatiquement et sans recalibrage quatre dimensions affichées dans `/methodologie` :
1. **Dernière semaine 2017 et 2022** : sondages bruts pondérés vs correction croisée par ratio.
2. **Campagne 1er tour à même horizon (J−148)** : tous candidats inclus (sans biais d’omission), RMSE brut vs **RMSE projeté** (validation hors échantillon de la projection temporelle).
3. **2nd tour présidentiel 2017 et 2022** (à 1er tour réel connu) : législatives 2024 seules, présidentielle croisée et **modèle front républicain** au repère de l’année.
4. **Cohérence agrégée des 342 duels des législatives 2024** : enquête Ipsos-Talan brute vs totaux réels des urnes sur les 4 profils.

---

## 4. Évolutions de l’interface et de la persistance (`src/ui/`, `src/state/`)

- **Ordre des sections sur la page principale (`src/ui/App.tsx`)** :
  1. `ScenarioBar` (*Paramètres de la simulation*)
  2. `RetainedPolls` (*Sondages retenus pour la simulation*, remonté directement sous les paramètres)
  3. `QualificationSwitch`
  4. `SecondRoundDuel` (*Second tour simulé*, placé au-dessus des issues simulées, avec sélecteur de duels plausibles et affichage du niveau de front républicain actif)
  5. `ElectedPresident` (*Issues simulées* : probabilités de victoire et de qualification, barres sur échelle fixe **0 – 100 %** avec repère à 50 %, intervalles à 80 % et rappel du niveau de front républicain actif)
  6. `CampaignTrajectory` (**nouveau** : graphique SVG interactif montrant les courbes historiques lissées en trait plein, le repère « Aujourd’hui », la trajectoire projetée en pointillés jusqu’au 18 avril 2027, le cône d’incertitude à 80 %, le survol date par date et la bascule directe Photographie / Projection)
  7. Grille `FirstRoundChart` (barres, intervalles `P10–P90`, seuil du 2nd tour et repère « aujourd’hui » sur échelle fixe **0 – 100 %** avec repère à 50 %, et décomposition détaillée des deltas en mode projection) et `VoteFlow` (diagramme de Sankey + tableau en flux bruts cohérents avec l’orientation effective des nouveaux votants)
- **Réorganisation des contrôles (`ScenarioBar.tsx`, `RepublicanFrontControls.tsx`, `SettingsSheet.tsx`)** :
  - Dans **Paramètres de la simulation** (`ScenarioBar`) :
    - Carte compacte **Horizon temporel du 1er tour** (`Aujourd’hui` / `Projection avril 2027`) avec lien direct vers l’onglet dédié des réglages avancés ;
    - Contrôle complet du **Front républicain** directement accessible (`RepublicanFrontControls.tsx` : 4 préréglages `Effacé` / `Érodé 2027` / `Niveau 2022` / `Niveau 2017`, curseur principal global + 3 curseurs séparés `Centre / Droite`, `Gauche modérée`, `LFI`) ;
    - Source des reports (`Base historique`, `Mélange hist. / 2027`, `Déclarations 2027`) ;
    - Section **« Alliances testées par les sondeurs »** repliable et **repliée par défaut**.
  - Dans **Réglages avancés** (`SettingsSheet.tsx`) : 3 onglets contrôlés (**Reports et 2nd tour**, **Projection 1er tour** — accueillant les réglages fins du vote utile séparé par bloc, le choix du pivot, l’option Centre + Droite, l’amortissement et la tendance amortie — et **Alliances**).
- **Persistance (`src/state/settingsStore.ts`, version `13`)** : migration ascendante propre depuis les versions antérieures (v1–v12 → v13) préservant sondages exclus, alliances, surcharges et projection, tout en abandonnant les anciens champs supprimés.

---

## 5. Résultats chiffrés vérifiés (base au 21 novembre 2026, J−148)

### 5.1 Backtest hors échantillon

#### 1er tour — Dernière semaine (2017 & 2022)
| Année | Sondages | RMSE brut pondéré | Écart max | RMSE correction croisée par ratio |
| --- | ---: | ---: | ---: | ---: |
| **2017** | 9 | **0,58 pt** | 1,20 pt | 1,18 pt *(dégradé)* |
| **2022** | 11 | **1,85 pt** | 4,70 pts | 1,79 pt |

#### 1er tour — Campagne à J−148 (tous candidats inclus)
| Année | Date cible | Instituts | RMSE sondages bruts | **RMSE projeté** *(4 blocs)* | Gain |
| --- | --- | ---: | ---: | ---: | ---: |
| **2017** | 26 nov. 2016 | 3 | 6,26 pts | **5,87 pts** | −6 % |
| **2022** | 13 nov. 2021 | 4 | 5,35 pts | **2,62 pts** | **−51 %** |

#### 2nd tour présidentiel (2017 & 2022, 1er tour réel connu — score Macron)
| Année | Résultat réel | Législatives 2024 seules | Présidentielle croisée | **Modèle front républicain** *(repère année)* | Sondages T2 à J−148 |
| --- | ---: | ---: | ---: | ---: | ---: |
| **2017** *(100 %)* | **66,10 %** | 62,55 % (−3,5 pts) | 57,90 % (−8,2 pts) | **62,66 %** (−3,4 pts) | 62,0 % |
| **2022** *(75 %)* | **58,55 %** | 60,73 % (+2,2 pts) | 57,38 % (−1,2 pt) | **58,95 %** (**+0,4 pt**) | 55,3 % |

#### Cohérence agrégée des 342 duels des législatives 2024 (Ipsos-Talan brute vs urnes)
| Type de duel | Circos | Finaliste réel | Prédit (Ipsos brut) | Écart | Abandon net réel |
| --- | ---: | ---: | ---: | ---: | ---: |
| RN vs LFI | 48 | 51,09 % | 49,83 % | −1,26 pt | 8,44 % |
| RN vs PS / écolo / PCF | 104 | 53,71 % | 52,60 % | −1,11 pt | 5,22 % |
| RN vs Centre (Ensemble) | 132 | 57,34 % | 56,39 % | −0,95 pt | 2,37 % |
| RN vs Droite (LR / DVD) | 58 | 56,47 % | 55,92 % | −0,56 pt | 1,45 % |

### 5.2 Projections 2027 (données actuelles, 66 vagues historiques `2025-03-26 → 2026-11-17`)

#### Comparaison des horizons de 1er tour (Front républicain par défaut `Érodé 2027`)
| Mode | Top 5 au 1er tour | Duel central | Probabilités d’élection (Monte-Carlo) |
| --- | --- | --- | --- |
| **Photographie actuelle** *(défaut)* | Le Pen 31,2 % · Mélenchon 16,1 % · Philippe 9,4 % · Lisnard 8,8 % · Glucksmann 8,2 % | Le Pen 58,3 % – Mélenchon 41,7 % | Le Pen 69,6 % · Mélenchon 16,1 % · Philippe 7,3 % · Lisnard 5,3 % |
| **Projection avril 2027** *(4 blocs)* | Le Pen 30,6 % · Mélenchon 22,3 % · Philippe 15,0 % · Lisnard 11,2 % · Glucksmann 4,5 % | Le Pen 57,9 % – Mélenchon 42,1 % | Le Pen 65,8 % · Mélenchon 16,9 % · Philippe 12,1 % · Lisnard 5,3 % |
| **Projection Centre + Droite regroupé** | Le Pen 31,0 % · Mélenchon 22,5 % · Philippe 20,5 % · Lisnard 8,0 % · Glucksmann 4,5 % | Le Pen 56,9 % – Mélenchon 43,1 % | Le Pen 53,5 % · Philippe 30,6 % · Mélenchon 15,3 % · Lisnard 0,7 % |

#### Sensibilité des 4 duels face au RN selon le préréglage du Front républicain (score RN simulé)
| Préréglage Front républicain | Mélenchon (`lfi_rn`) | Glucksmann (`ecolo_ps_pcf_rn`) | Philippe (`ensemble_rn`) | Lisnard (`lr_rn`) |
| --- | ---: | ---: | ---: | ---: |
| **Effacé (`0 %`)** | RN 60,1 % | RN 56,6 % | RN 60,0 % | RN 56,8 % |
| **Érodé 2027 *(défaut : 55 / 50 / 35 %)*** | **RN 58,3 %** | **RN 54,8 %** | **RN 52,2 %** | **RN 51,0 %** |
| **Niveau 2022 (`75 %`)** | RN 55,7 % | RN 53,8 % | RN 50,0 % | RN 49,0 % |
| **Niveau 2017 (`100 %`)** | RN 53,8 % | RN 52,7 % | RN 47,7 % | RN 46,6 % |

---

## 6. Inventaire des fichiers créés et principaux fichiers modifiés

### Nouveaux fichiers
- **Domaine** : `src/domain/offerProjection.ts` (+ `.test.ts`), `src/domain/campaignProjection.ts` (+ `.test.ts`), `src/domain/monteCarlo.ts` (+ `.test.ts`), `src/domain/backtest.ts` (+ `.test.ts`).
- **Données** : `src/data/polls-history-2027.json` (66 vagues historiques 2025–2026), `src/data/transfers-2027-declared.json` (reports déclarés 2026 + paramètres logit).
- **Interface** : `src/ui/components/CampaignTrajectory.tsx`, `src/ui/components/RepublicanFrontControls.tsx`.
- **Documentation** : `docs/changelog-methode.md`, `docs/resume-refonte-2026-11-22.md` (ce document).

### Principaux fichiers modifiés
- **Domaine** : `src/domain/types.ts`, `src/domain/pollAverage.ts`, `src/domain/alliances.ts`, `src/domain/transfers.ts`, `src/domain/secondRound.ts`, `src/domain/newVoters.ts`, `src/domain/simulate.ts` (et suites de tests associées).
- **Données & Sync** : `src/data/schema.ts`, `src/data/transfers-legislatives-2024.json`, `src/data/second-round-dropout.json`, `src/data/polls-2027.json`, `src/sync/wikipedia.ts`, `src/sync/sync.ts`, `scripts/sync-polls.ts`, `.github/workflows/sync-polls.yml`, `package.json`.
- **État & UI** : `src/state/settingsStore.ts`, `src/hooks/useSimulation.ts`, `src/ui/App.tsx`, `src/ui/components/ScenarioBar.tsx`, `src/ui/components/SettingsSheet.tsx`, `src/ui/components/FirstRoundChart.tsx`, `src/ui/components/SecondRoundDuel.tsx`, `src/ui/components/ElectedPresident.tsx`, `src/ui/components/VoteFlow.tsx`, `src/ui/components/VoteFlowSankey.tsx`, `src/ui/components/RetainedPolls.tsx`, `src/ui/components/QualificationSwitch.tsx`, `src/ui/components/AllianceSwitches.tsx`, `src/ui/components/Methodology.tsx`, `README.md`.

---

## 7. Vérification technique

L’ensemble de la chaîne de validation passe sans erreur :
- `bun run typecheck` (`tsc -b --noEmit`) : **OK (0 erreur)**
- `bun run lint` (`eslint .`) : **OK (0 erreur)**
- `bun run test` (`vitest run`) : **20 / 20 fichiers de tests, 173 / 173 tests passés**
---

## 8. Mise à jour v2.1 (22 novembre 2026) — Corrections issues de la revue critique (`docs/revue-refonte-2026-11-22.md`)

À la suite de la revue critique de la v2, une passe d’assainissement méthodologique et technique complète a été appliquée, en consignant chaque changement par défaut dans `docs/changelog-methode.md` **avant** examen de son effet sur 2027 :

### 8.1 Corrections techniques et méthodologiques réalisées
1. **Écart-type de campagne (`monteCarlo.ts`)** : `SIGMA_CAMPAIGN_REF` passé de `0,40` à **`0,595`** par règle écrite (`(0,497 + 0,693) / 2`, moyenne de l’écart-type logit 1995–2022 de `methode.pdf` et du RMS logit 2022 de notre backtest ; plancher sondagier `0,14`). Commentaire obsolète (`3,5 pts` → `3,0 pts`) corrigé.
2. **Filtre strict 2017 (`reference-2017.json`, `backtest.ts`)** : exige désormais `fillon` (avec `melenchon`, `macron`, `lepen`) et exclut `juppe`, `sarkozy`, `hollande`, `valls`, `montebourg`, `bayrou`, `peillon`. Faute de sondage strict à J−148 avant la fin des primaires, le backtest avance à la première date à offre stabilisée (≥ 3 instituts) : **`2017-01-31` (J−82)**, affiché explicitement.
3. **Validation croisée stricte & couverture 80 % (`backtest.ts`, `Methodology.tsx`)** :
   - Ajout de `crossProjectedRmse` (**strictement hors échantillon** : cibles de concentration mesurées uniquement sur l’autre scrutin, sans moyennes structurelles ni tendance).
   - Ajout de `coverage80` mesurant la couverture empirique des intervalles Monte-Carlo `[P10 ; P90]` sur 2017 (`3/6` T1 brut, T2 couvert) et 2022 (`7/9` = `78 %` T1 brut, `6/9` croisé, T2 couvert).
   - Désactivation par défaut de `meanReversion` (`0,5 → 0`) et `dampedTrend` (`0,5 → 0`, corrélation de pente 1995–2022 non significative `r = −0,26`).
   - Distinction stricte sur `/methodologie` entre évaluations **hors échantillon** et **contrôles internes / de calibration**.
4. **Historique 2025–2027 nettoyé (`sync/wikipedia.ts`, `polls-history-2027.json`)** : sélection d’**une seule hypothèse cohérente par vague** exigeant `lepen` et `melenchon` et ≥ 75 % de masse simulée (`58` vagues propres, `0` vague Bardella sans Le Pen).
5. **Front républicain sans coefficients ad hoc (`transfers.ts`, `RepublicanFrontControls.tsx`)** : remplacement des 6 coefficients inventés et du seuil à 6 % par une **interpolation logit directe entre deux repères mesurés** — **Présidentielle 2022 (`0 %`)** et **Législatives 2024 (`100 %`)**, 3 préréglages (`Présidentielle 2022`, `Mi-chemin`, `Législatives 2024`), sans extrapolation sous 2022 ni couplage non mesuré sur les nouveaux votants. **Défaut provisoire : `100 %` (Législatives 2024), en attente d’arbitrage utilisateur.**
6. **Report gauche hors LFI → Mélenchon (`transfers.ts`, `monteCarlo.ts`, `SecondRoundDuel.tsx`, `RepublicanFrontControls.tsx`, `SettingsSheet.tsx`)** : curseur dédié (`lfiLeftTransfer`, défaut provisoire `72 %`), plage d’incertitude Monte-Carlo uniforme configurable (`lfiLeftTransferRange`, défaut provisoire `[35 % ; 75 %]`) et encadré de sensibilité affiché sur les duels LFI–RN. **Valeur centrale et plage en attente d’arbitrage utilisateur.**
7. **David Lisnard candidat principal & `offerProjection.ts` à 100 %** : suppression du bloc `minor` sur `lisnard` dans `polls-2027.json` (7 instituts sur 8 ; il relève désormais du bloc `droite` au 2nd tour) et suppression de la fuite arbitraire de 10 % lors du retrait d’un candidat dans `offerProjection.ts`.
8. **Incertitude des candidatures et projection avril 2027 activées par défaut (`simulate.ts`, `campaignProjection.ts`, `ScenarioBar.tsx`, v2.1.1)** : la projection avril 2027 (vote utile par bloc, sans amortissement ni tendance) et l’échantillonnage Monte-Carlo sur 5 offres testées pondérées (`Philippe + Lisnard` 40 %, `Philippe seul` 30 %, `Philippe + Attal` 15 %, `Attal seul` 10 %, `Lagarde seule` 5 %, hors alliance forcée) sont activés par défaut (désactivables en un clic).
9. **Persistance (`settingsStore.ts`)** : montée en version `15` avec migration ascendante propre.

### 8.2 Chiffres vérifiés v2.1 (base au 21 novembre 2026, J−148)
- **Backtest 1er tour en campagne** :
  - **2017 (J−82, offre stabilisée, 3 instituts)** : RMSE brut `4,08 pts` · RMSE croisé hors échantillon `5,05 pts` (Hamon encore devant Mélenchon fin janvier 2017) · RMS logit `0,53`.
  - **2022 (J−148, 4 instituts)** : RMSE brut `5,35 pts` · **RMSE croisé hors échantillon `2,63 pts`** (−51 %) · RMS logit `0,69`.
- **Couverture empirique des IC 80 % (contrôle de calibration)** :
  - **2017 (J−82, `σ = 0,45`)** : `3/6` T1 (`50 %`), T2 `[47,4 ; 72,3 %]` couvre `66,1 %`.
  - **2022 (J−148, `σ = 0,60`)** : `7/9` T1 brut (`78 %`), `6/9` croisé (`67 %`), T2 `[39,4 ; 72,6 %]` couvre `58,5 %`.
- **Backtest 2nd tour présidentiel** (score Macron, 1er tour réel connu) :
  - **2017 (`66,10 %` réel)** : ancre Lég. 2024 `62,55 %` (−3,5 pts, hors éch.) · ancre Prés. 2022 / croisée `57,90 %` (−8,2 pts, hors éch.).
  - **2022 (`58,55 %` réel)** : ancre Lég. 2024 `60,73 %` (+2,2 pts, hors éch.) · Prés. croisée `57,38 %` (−1,2 pt, hors éch.) · ancre Prés. 2022 `54,95 %` (−3,6 pts, en éch. : Zemmour/NDA traités au taux RN 96 %).
- **Scénario 2027 (8 instituts dont 4 projetés, photographie actuelle)** :
  - **Ancre 100 % (Lég. 2024, défaut provisoire)** : Le Pen – Mélenchon `52,6 – 47,4 %` (sensibilité `[35 ; 75 %]` : RN de `52,3 %` à `56,6 %`), Le Pen – Philippe `45,5 – 54,5 %` · Probabilités de victoire : Le Pen `44,5 %`, Mélenchon `26,5 %`, Philippe `13,4 %`, Lisnard `9,6 %`, Glucksmann `4,8 %`.
  - **Ancre 0 % (Prés. 2022)** : Le Pen – Mélenchon `56,7 – 43,3 %` (sensibilité `[35 ; 75 %]` : RN de `56,4 %` à `61,1 %`), Le Pen – Philippe `51,7 – 48,3 %` · Probabilités de victoire : Le Pen `53,5 %`, Mélenchon `20,9 %`, Philippe `12,0 %`, Lisnard `8,4 %`, Glucksmann `3,8 %`.
- **Vérification technique v2.1** : `typecheck` OK, `lint` OK, **`20 / 20` fichiers de tests (`178 / 178` tests passés)**, `vite build` OK.
