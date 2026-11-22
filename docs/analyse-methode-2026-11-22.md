# Analyse comparative : méthode « 10 000 présidentielles » et simulateur

Note de travail du 22/11/2026, à reprendre pour les prochaines modifications du simulateur.

## 1. Objectif du simulateur (décision de l'utilisateur)

Le simulateur vise à **corriger les biais des sondages** : incertitude des électeurs à cinq mois du vote, forte part de répondants qui ne se prononcent pas encore. Il cherche à être **plus juste que les sondages**.

- Les sondages de duel de 2nd tour ne sont **pas** une référence : pas de recalage sur eux, pas d'avertissement quand le simulateur s'en écarte.
- Critère d'évaluation d'une correction : prévoit-elle mieux le résultat réel que les sondages de l'époque sur les élections passées (2017, 2022) ? Est-elle techniquement correcte ?

## 2. Le document analysé

« 10 000 présidentielles : simulation statistique de l'élection présidentielle de 2027 », statisticien anonyme (chaîne numerodesecu), version du 13/11/2026, 17 pages. Code non publié.

### Méthode

- **Point de départ.**
  - 6 instituts (Cluster17, Elabe, Harris, Ifop, Ipsos, Odoxa) ; OpinionWay exclu (environ 700 répondants après filtre).
  - Sondages terminés depuis le 20/10/2026.
  - Poids `2^(-t/5 j) × min(n, 1500)/1000 / H` : 48 % du poids repose sur un seul sondage Cluster17.
  - Effets d'institut × 0,5 (au plus 0,6 point).
  - Normalisation par offre de candidats.
- **Candidatures.** Scénarios probabilisés : RN 91/9 Le Pen/Bardella, primaire de la droite 60 %, Tondelier 35 %, etc. Les décisions de février sont tirées sur les sondages simulés. Tous les résultats supposent Mélenchon candidat.
- **Campagne.** Chocs en logit, loi de Student à 5 degrés de liberté. Écart-type total σ = 0,497 (1995-2022), dont σ_bloc = 0,372 et σ_candidat = 0,330.
- **Erreur des sondages la veille.** Mesurée sur 2017 et 2022 (2022 double) : +3,2 points pour la gauche radicale, −1,6 pour l'extrême droite. Écart-type minimal de 1 point.
- **Second tour.**
  - Reports = λ × déclarations 2027 corrigées + (1 − λ) × législatives 2024 (Ipsos), avec λ ~ U(0 ; 0,5).
  - Tirage de Dirichlet de concentration 40.
  - Fidélité des électeurs des finalistes : 92/2/6.
  - Mobilisation des abstentionnistes : a ~ U(0,20 ; 0,33), q ~ U(0,55 ; 0,70).
  - Choc commun η de 4 points face à l'extrême droite.

### Résultats

- Victoire : extrême droite 43,7 %, Mélenchon 36,5 %, Philippe 12,9 %.
- Duel Le Pen – Mélenchon dans 63 % des simulations ; Mélenchon gagne 48,6 % de ces duels, avec un score médian de 49,7 %.
- Variantes publiées dans le document :

| Variante | Victoire de Mélenchon |
|---|---|
| Déclarations de 2027 seules | 18,7 % |
| Législatives 2024 seules | 43,3 % |
| Sans correction de la veille | 26,1 % |
| Cumul de trois choix défavorables à Mélenchon | 11,6 % |

### Verdict sur sa qualité

Le document est très transparent, mais ses chiffres principaux ne sont pas robustes :

1. **Réglages arrêtés après examen des résultats**, le même jour : fenêtre, demi-vie, liste des instituts et poids de 2024. Chacun a augmenté la victoire de Mélenchon ; le seul poids de 2024 l'a fait passer de 31,9 à 36,5 %.
2. **Correction de la veille conservée bien qu'elle fasse moins bien que l'absence de correction** (erreur quadratique 2,36 contre 1,71 sur 2007-2022). L'écart-type minimal d'un point rend l'erreur de l'extrême droite négative dans 94 % des tirages.
3. **Reports 2024 mal transposés** :
   - électeurs du PS remplacés par le report NFP → Ensemble, c'est-à-dire un autre sens de vote ;
   - circonscriptions issues des désistements, non représentatives ;
   - adversaires locaux, pas Mélenchon lui-même.
4. **Intervalles trop étroits** (couverture de 74 % pour 80 % attendus), sans recalage. La version publiée n'a pas été testée telle quelle.
5. **Hypothèses discutables** :
   - fidélité symétrique de 92 % alors que les déclarations 2027 donnent 97-98 % pour Le Pen et 91-93 % pour Mélenchon ;
   - q (part des abstentionnistes revenus qui va à l'adversaire de l'extrême droite) non testé ;
   - erreur de Zemmour imputée à Le Pen.
6. **Exécution** :
   - script non reproductible ;
   - écart inexpliqué de 1,8 point dans une variante (bogue possible) ;
   - duels sans extrême droite enregistrés sur 1 000 tirages seulement ;
   - artefact LaTeX en page 1.

**À ne pas reprendre** : demi-vie de 5 jours, correction de la veille 2:1, λ fixé après coup, écart-type minimal d'un point, effets d'institut (gain négligeable).

**À retenir** :
- les scénarios de candidatures probabilisés ;
- l'incertitude de campagne (σ ≈ 0,5 en logit à J-156, variance proportionnelle au temps) ;
- le test sur les élections passées ;
- le journal des réglages.

## 3. État du simulateur au 22/11/2026

Données du 21/11/2026, scénario par défaut « Philippe + Attal », 7 instituts (YouGov, Ifop, Elabe, OpinionWay, Cluster17, Harris, Ipsos).

- **1er tour par défaut** : Le Pen 25,5, Mélenchon 18,0, Lisnard 8,6, Lagarde 8,0, Glucksmann 7,8, Philippe 7,5.
- **2nd tour par défaut** : Mélenchon 57,6, Le Pen 42,4.

### Décomposition du 2nd tour

Effet cumulé des réglages par défaut, ajoutés un par un :

| Étape | Mélenchon | Effet |
|---|---|---|
| Reports de l'enquête Ipsos 2024 bruts, sans correction (`abstentionCalibration: false`) | 46,8 | — |
| + abstention répartie « par camp » (`abstentionCalibration`) | 49,1 | +2,3 |
| + correction par régression écologique (`transferCorrectionEnabled`) | 53,7 | +4,6 |
| + correction du billet de blog (`blogBiasEnabled`) | 57,6 | +3,9 |

À titre de repère, en remplaçant les lignes gauche, centre et droite du profil `lfi_rn` (réglages ci-dessus désactivés) :
- mélange moyen du PDF (62/5/33, 36/21/43, 22/43/35) : 44,0 ;
- déclarations 2027 corrigées (33/11/56, 16/27/57, 10/57/32) : 35,2.

### Reports effectifs par défaut

Part pour Mélenchon / pour Le Pen / abstention ou blanc :

- Glucksmann **94/4/2** (enquête : 72/3/25). En cause, le mode « camps » : le taux du camp mesure les propres électeurs du finaliste en 2024.
- Philippe **62/13/25** (enquête : 43/19/38 ; déclarations 2027 : 9/31/60).

### Régression écologique (méthode de Goodman) sur les législatives 2024

Valeurs : estimation ± erreur type, en %.

| Profil | n | Centre | Droite | Lignes des finalistes |
|---|---|---|---|---|
| `lfi_rn` | 48 | 63±6 / 13±4 / 24±5 | 51±5 / 22±3 / 27±5 | gauche 100 / −4 ; extrême droite 107 % RN |
| `ecolo_ps_pcf_rn` | 104 | — | — | gauche 103 % |
| `ensemble_rn` | 132 | — | — | extrême droite : abstention −6 % |
| `lr_rn` | 58 | — | — | gauche : RN −11±5 % |

Les valeurs impossibles viennent des abstentionnistes du 1er tour venus voter au 2nd : comme le modèle ne les prévoit pas, leurs voix sont attribuées aux autres blocs.

### Test des composantes du billet en laissant une élection de côté

Test 2017 ↔ 2022, blocs gauche et extrême droite, erreur quadratique en points :

| Composante | Avec | Sans |
|---|---|---|
| Progression (sondages à même distance → derniers sondages) | **0,96** | 2,22 |
| Correction (derniers sondages → résultat) | 3,77 | **2,37** |
| Total | 3,59 | 4,03 |

Le test repose sur deux élections seulement : c'est un indice, pas une preuve.

### Autres constats

- Lagarde (8 %) et Asselineau ne sont testés que par Cluster17, une seule hypothèse (H4 du 10/11/2026) ; Bouamrane ne l'est que par OpinionWay. Tous sont pourtant ajoutés dans les hypothèses de tous les instituts : le champ par défaut compte 19 candidats.
- Fidélité par défaut de 1 (100 %) pour les deux finalistes, au-dessus de la plage observée (90 à 99 %).
- La participation attendue n'a aucun effet par défaut (le billet couvre déjà la mobilisation).
- Sondages de duel de 2nd tour à cinq mois du vote, pour l'adversaire du RN :
  - 2022 : 55,3 % (12 sondages) contre 58,6 % au résultat ;
  - 2017 : 62 % (un seul sondage) contre 66,1 %.
  - Ils ont donc sous-estimé le barrage d'environ 3 à 4 points.

## 4. Priorités décidées

1. **Billet de blog.** Retirer la composante « correction », garder la « progression » par défaut et renommer l'option de façon neutre.
   - Fichiers : `src/domain/blogBias.ts`, `src/domain/corrections.ts`, `src/domain/turnout.ts` (`turnoutCoverage`).
2. **Régression écologique.** La désactiver par défaut, ou la refaire avec une variable pour les abstentionnistes du 1er tour (part des inscrits) et une estimation contrainte entre 0 et 100 %.
   - Fichiers : `src/domain/transferCorrection.ts`, `defaultSettings()` dans `src/domain/simulate.ts`.
3. **Abstention par camp.** Passer la portée par défaut de `'bloc'` à `'family'`, ou revenir aux taux de l'enquête pour les électorats qui ne sont pas ceux des finalistes.
   - Fichier : `src/domain/secondRound.ts` (`campScope`).
4. **Petits candidats.** Ne plus ajouter par défaut ceux qu'un seul institut teste (Lagarde, Asselineau, Bouamrane).
   - Fichiers : `src/domain/pollAverage.ts` (`minorDonors`, imputation), `src/data/polls-2027.json`.
5. **Fidélité.** La différencier selon le finaliste (déclarations 2027 ou mesures du jour du vote).
   - Fichiers : `src/domain/transfers.ts`, `src/domain/secondRound.ts`, `defaultFidelity` dans `src/data/transfers-legislatives-2024.json`.
6. **Test sur les élections passées.** Ajouter un test 2017 ↔ 2022 de chaque correction, comparé aux sondages de l'époque, aux tests automatiques et à la page Méthodologie.
   - Données disponibles : `reference-2017.json`, `reference-2022.json`, `second-round-poll-bias.json`.
7. **Incertitude.** Afficher une fourchette, par exemple 1 000 tirages sur la chaîne de calcul (σ ≈ 0,5 en logit à J-150 au 1er tour, 4 à 5 points au 2nd).

Autres décisions :
- Déclarations de reports 2027 : éventuellement en option, une fois corrigées, jamais par défaut.
- Tenir un journal daté des changements de réglages par défaut.
- Ne pas modifier un réglage par défaut après avoir vu son effet sur le score (piège du PDF).
- README et page Méthodologie : retirer l'argument « appliquée aux sondages de 2022, la correction redonne exactement le résultat », tautologique.

## 5. Reproduire les chiffres

Lancer `bun install`, puis un script bun qui importe les modules par chemin absolu :

```ts
const { simulationData: d } = await import('<repo>/src/data/schema.ts')
const { simulate, defaultSettings } = await import('<repo>/src/domain/simulate.ts')
const { computeCalibration } = await import('<repo>/src/domain/calibration.ts')
const cal = computeCalibration(d, d.polls)
const r = simulate(d, { ...defaultSettings(), blogBiasEnabled: false }, cal)
console.log(r.secondRound.a, r.secondRound.pct, r.secondRound.flows)
```

- Régression écologique : `actualTransfers(profile)` dans `src/domain/transferCorrection.ts`, sur `d.secondRoundDropout.legislatives2024.profiles`.
- Test du billet : `cal.blogBias[bloc].years[2017|2022]`, qui contient `early`, `final`, `result`, `progression` et `correction`.
