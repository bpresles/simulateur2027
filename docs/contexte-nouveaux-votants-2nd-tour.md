# Contexte : nouveaux votants au 2nd tour (partie 3, en attente)

Fichier de reprise, rédigé le 15/11/2026. Il résume l'analyse, les décisions prises et ce qui reste à faire pour afficher les « nouveaux votants » dans les reports du 2nd tour. Rien de cette partie n'est encore codé.

## 1. Objet

Le graphique « Reports vers le second tour » (`src/ui/components/VoteFlowSankey.tsx`) et le mode Tableau (`src/ui/components/VoteFlow.tsx`) ne montrent que des flux **partant** des électeurs du 1er tour : vers chaque finaliste ou vers « Blanc, abst. ». Aucun flux n'**arrive** des abstentionnistes ou des votants blancs et nuls du 1er tour. Cela laisse croire qu'il n'y a pas de nouveaux votants au 2nd tour, ce qui est factuellement faux.

But : un affichage factuel et pédagogique des nouveaux votants, c'est-à-dire des abstentionnistes ou votants blancs et nuls du 1er tour qui s'expriment au 2nd. Il doit montrer la part qui s'exprime, pour qui elle vote, et la part qui ne s'exprime toujours pas. **Le résultat des finalistes ne doit pas changer.**

## 2. Ce que fait le modèle aujourd'hui (vérifié)

- L'abandon est un **solde net** tiré des résultats officiels : `1 − exprimés du 2nd tour ÷ exprimés du 1er tour` (`src/domain/secondRound.ts` : `secondRoundDropout`, `presidentialDropout`, `profileDropout`). Il est calé sur les duels équivalents des législatives 2024 (`campDropout`, régression par camp sur les circonscriptions). Les nouveaux votants sont donc **déjà comptés**, en déduction des départs. Le score des finalistes en tient compte, mais de façon implicite : le modèle suppose qu'ils votent comme les électorats dont ils compensent les départs.
- La fidélité des électeurs des finalistes vaut 1 par défaut (`defaultFidelity` dans `transfers-legislatives-2024.json`). Cela correspond à un solde proche de 0 mesuré en 2024 pour le camp des finalistes.
- Les taux par camp sont bornés à 0 (`duelCampRates`, `Math.max(0, …)`). Trois des quatre types de duel de 2024 avaient pourtant un solde négatif, avec des arrivées supérieures aux départs : −0,7 à −1,7 point, à 1 ou 1,6 écart type, donc peu significatif. Effet négligeable.
- Données de report 2024 (`transfers-legislatives-2024.json`, Ipsos-Talan) : une ligne par électorat du 1er tour, **aucune** ligne « abstention » ou « blancs et nuls au 1er tour ».

## 3. Ce qui est établi, avec sources

| | 2017 | 2022 | Législatives 2024 (475 circonscriptions avec 2nd tour) |
|---|---|---|---|
| Votants T1 → T2 (officiel) | 37,00 M → 35,47 M | 35,92 M → 35,10 M | 27,56 M → 27,47 M |
| Exprimés T1 → T2 (officiel) | 36,05 M → 31,38 M (−13,0 %) | 35,13 M → 32,06 M (−8,7 %) | 26,85 M → 25,96 M (−3,3 %) |
| Inscrits n'ayant voté qu'au 2nd tour (Insee, listes d'émargement) | 4,8 % | 5,6 % (métropole) | pas de publication trouvée |
| Abstentionnistes du T1 qui votent au T2 (Insee) | 24,6 % | 25,3 % | — |

Ifop jour du vote, 2nd tour 2022 :
- 32 % des abstentionnistes du 1er tour ont voté au 2nd (p. 10) ;
- ils forment 7 % des votants du 2nd tour (p. 12) ;
- 6 % des électeurs de Macron et 5 % de ceux de Le Pen s'étaient abstenus au 1er tour (p. 26) ;
- leur vote : 59 % Macron, 41 % Le Pen, contre 58,5 % / 41,5 % au total (p. 24).

Ce sondage n'isole pas les votants blancs et nuls du 1er tour.

Sources :
- Résultats officiels 2022 par bureau de vote : [1er tour](https://static.data.gouv.fr/resources/election-presidentielle-des-10-et-24-avril-2022-resultats-definitifs-du-1er-tour/20220414-152542/resultats-par-niveau-burvot-t1-france-entiere.txt), [2nd tour](https://static.data.gouv.fr/resources/election-presidentielle-des-10-et-24-avril-2022-resultats-definitifs-du-2nd-tour/20220428-142237/resultats-par-niveau-burvot-t2-france-entiere.txt).
- Résultats officiels 2017 par bureau de vote : [1er tour](https://static.data.gouv.fr/resources/election-presidentielle-des-23-avril-et-7-mai-2017-resultats-definitifs-du-1er-tour-par-bureaux-de-vote/20170427-100955/PR17_BVot_T1_FE.txt), [2nd tour](https://static.data.gouv.fr/resources/election-presidentielle-des-23-avril-et-7-mai-2017-resultats-definitifs-du-2nd-tour-par-bureaux-de-vote/20170511-093541/PR17_BVot_T2_FE.txt).
- Législatives 2024 : les fichiers par circonscription cités dans `second-round-dropout.json`.
- Insee : [Insee Première n° 1670 (2017)](https://www.insee.fr/fr/statistiques/3138704), [Insee Flash Normandie n° 124 (chiffres de la métropole pour 2022)](https://www.insee.fr/fr/statistiques/6657405), [Insee Première n° 1929](https://www.insee.fr/fr/statistiques/6658143).
- [Ifop-Fiducial, jour du vote, 2nd tour 2022](https://www.ifop.com/wp-content/uploads/2022/04/118997-rapport-jdv-pre22-t2-10h-complet-25.04.pdf).

## 4. Pistes écartées (analysées, non fiables)

1. **Comparer les exprimés des deux tours au niveau national.** Cela ne donne qu'un solde, arrivées − départs : une équation pour deux inconnues. En 2017 et 2022, le solde est négatif alors que les arrivées existent (Insee). Seule 2002 a un solde positif : +2,56 M d'exprimés.
2. **Retrancher les reports mesurés des voix de chaque finaliste.** Les sondages ne publient de taux que pour 6 candidats sur 12 : 3,71 M d'électeurs n'ont pas de taux. L'arrondi des taux pèse à lui seul ±0,16 M par finaliste, et l'écart entre l'Ifop et Ipsos atteint 0,34 M pour Macron. On n'obtient qu'un minimum : au moins 1,3 à 1,5 M d'abstentionnistes du 1er tour exprimés au 2nd en 2022. Rien sur leur répartition.
3. **Analyse des 69 000 bureaux de vote** (régression sous contraintes, par département et par circonscription, 2017 et 2022). Les volumes sont stables : 1,4 à 1,7 M de nouveaux exprimés. Mais ils ne valent que la **moitié** des flux constatés par l'Insee. La répartition 2022 est instable (21 à 39 % pour Macron) et contredit l'Ifop (59 %). Les reports des candidats s'écartent aussi des sondages. C'est la limite connue de cette méthode : des résultats agrégés ne permettent pas de retrouver les trajectoires individuelles. Le script n'a pas été conservé dans le dépôt.

## 5. Source retenue : panel Cevipof, Enquête électorale française 2022, vague 11

- **Fiche** : [data.sciencespo.fr, doi:10.21410/7E4/I1Q0PI](https://data.sciencespo.fr/dataset.xhtml?persistentId=doi:10.21410/7E4/I1Q0PI). Terrain du 16 au 18/05/2022, 11 247 répondants, licence CC BY-SA 4.0.
- **Accès** : les fichiers de données sont restreints. Une demande d'accès a été faite le 15/11/2026 et **refusée par Sciences Po le 18/11/2026**. L'archive téléchargée le 15/11/2026 ne contenait que la documentation et le questionnaire. Seul un tableau agrégé, croisant le vote aux deux tours, serait utile : il ne contient aucune donnée individuelle (voir section 8). Fichiers concernés si l'accès est un jour accordé : `fr_cdsp_ddi_enef2022_v11_csv.zip` (ou `fr_cdsp_ddi_enef2022_v11.tab`).
- **Variables** (d'après la documentation publique) :
  - `X11PRES22A`, vote au 1er tour : 1 à 12 pour les candidats, 97 abstention, 98 blanc ou nul, 6666 non concerné, 9999 sans réponse.
  - `X11PRES22B`, vote au 2nd tour : 1 Macron, 2 Le Pen, 97 abstention, 98 blanc ou nul, 9999 sans réponse.
  - Poids `X11PPUB` (« poids décision », utilisé pour les rapports publiés). Autres poids disponibles : `X11PSD`, `X11PSDD`, `X11PSDP`, `X11PSDPE`.
- **Effectifs bruts** :

  | Vote | Répondants (vague 11) | Part réelle |
  |---|---|---|
  | Abstention au 1er tour | 675 (6,4 %) | 26,3 % |
  | Blanc ou nul au 1er tour | 231 (2,2 %) | — |
  | Abstention au 2nd tour | 10,8 % | 28 % |
  | Blanc ou nul au 2nd tour | 13,2 % | — |

  Le panel sous-représente fortement les abstentionnistes, d'où le recalage décrit plus bas.
- **Point à vérifier** : 756 répondants sont « non concernés » pour `X11PRES22A`. Ils avaient probablement déjà donné leur vote du 1er tour dans une vague précédente. La documentation parle d'une fusion avec la vague qui suit l'élection : leur vote du 1er tour peut se trouver dans la vague 10 (doi:10.21410/7E4/M9OMPY) ou dans l'enquête du 22/04/2022.
- **RGPD et licence** : les réponses individuelles ne doivent **jamais** entrer dans le dépôt. Les ranger hors du dépôt, ou dans un dossier ignoré par git. Seuls des taux agrégés sont publiés, avec cette citation : « Sciences Po – CEVIPOF, Enquête électorale française 2022 (ENEF 2022), vague 11, doi:10.21410/7E4/I1Q0PI, CC BY-SA 4.0 ». La licence impose de diffuser ces tableaux dérivés sous la même licence. Faire valider les conditions d'utilisation de l'entrepôt avant la mise en ligne publique.

### Autres sondages publics examinés le 18/11/2026

- **Elabe, jour du vote, 2nd tour 2022** ([rapport](https://elabe.fr/fichier-pdf/9650-comprendre-le-vote-au-2nd-tour-de-lelection-presidentielle/), 1 900 inscrits, métropole). Il compte ensemble l'abstention et le vote blanc ou nul du 1er tour.
  - Ce groupe a voté au 2nd tour à 64 % pour Macron et 36 % pour Le Pen (p. 9).
  - Il forme 12 % des électeurs de Macron et 9 % de ceux de Le Pen (p. 10), soit environ 3,45 M d'exprimés. C'est plus que les 2,6 à 2,7 M de votants que l'Insee compte parmi ceux qui n'ont voté qu'au 2nd tour. Ce volume est donc surestimé (petit échantillon, réponses déclarées).
  - L'Ifop (6 % et 5 %, abstention seule, 4 827 inscrits) est cohérent avec l'Insee.
- **Harris Interactive, jour du vote, 2nd tour 2022** ([rapport](http://harris-interactive.fr/wp-content/uploads/sites/6/2022/04/JDV-24042022.pdf)) : aucun croisement avec l'abstention ou le vote blanc ou nul du 1er tour.
- **Ipsos-Cevipof, vagues 10 et 11 (rapports publiés)** : aucune ligne pour l'abstention ou le vote blanc ou nul du 1er tour.

Conclusion au 18/11/2026 : **aucune source publique n'isole les votants blancs et nuls du 1er tour**. Pour les abstentionnistes du 1er tour, l'Ifop 2022, recoupé par l'Insee, reste la meilleure mesure.

## 6. Méthode prévue

1. **Croiser** `X11PRES22A` × `X11PRES22B`, pondéré par `X11PPUB`. On obtient 14 lignes (12 candidats, abstention, blanc ou nul) sur 4 colonnes (Macron, Le Pen, abstention, blanc ou nul). Exclure les sans-réponses et noter leur nombre. Traiter les « non concernés » selon le point à vérifier ci-dessus.
2. **Recaler le tableau** sur les marges officielles de 2022 par ajustement proportionnel itératif (méthode dite « raking »). Le panel garde la structure des reports ; les totaux deviennent exacts. Marges, en effectifs (Conseil constitutionnel, voir `src/data/reference-2022.json`) :
   - 1er tour (48 747 876 inscrits) :
     - chaque candidat ;
     - blancs et nuls : 790 760 (35 923 707 votants − 35 132 947 exprimés) ;
     - abstention : 12 824 169.
   - 2nd tour (48 752 339 inscrits) :
     - Macron 18 768 639, Le Pen 13 288 686 ;
     - blancs et nuls : 3 039 153 (2 233 904 blancs + 805 249 nuls) ;
     - abstention : 13 655 861.
   - Ramener les marges du 2nd tour au total d'inscrits du 1er tour, qui diffère de 4 463 inscrits.
3. **Indiquer l'incertitude.** Les lignes « abstention » (675 répondants) et « blanc ou nul » (231) ont une marge de quelques points. Donner un intervalle, par exemple par bootstrap sur les répondants.
4. **Valider** contre les sources indépendantes :
   - Insee : environ 25 % des abstentionnistes du 1er tour votent au 2nd ;
   - Ifop : 59 % pour Macron chez les abstentionnistes du 1er tour qui s'expriment, 6 % et 5 % des voix des finalistes.
   - Signaler tout écart.
5. **Publier** dans `src/data/second-round-dropout.json` un bloc `newVoters` validé par le schéma, avec pour chaque origine (abstention, blanc ou nul) :
   - la part qui s'exprime ;
   - la répartition observée en 2022 entre Macron et Le Pen ;
   - la part qui ne s'exprime toujours pas ;
   - l'intervalle d'incertitude.

   Ajouter les sources, la méthode et la date. Les taux sont recalculés hors de l'application, puis saisis avec leur source. Le script de calcul peut être versionné, sans les données.

## 7. Affichage prévu

- Le graphique et le tableau passent en **% des inscrits**, seule base qui permet d'afficher les abstentionnistes.
  - À gauche : chaque candidat du 1er tour, « Blancs et nuls au 1er tour », « Abstention au 1er tour ».
  - À droite : les deux finalistes et « Ne s'expriment pas (abstention, blanc, nul) ».
  - Les scores des finalistes restent en % des exprimés.
- **Volumes des nouveaux votants** : participation attendue au 1er tour (bilan de participation du modèle), multipliée par les taux mesurés en 2022 (bloc `newVoters`).
- **Répartition entre finalistes en 2027** : celle de l'ensemble des votants. C'est le repli validé par l'utilisateur, faute de mesure pour un autre duel, et il doit être affiché comme tel. La répartition de 2022 est citée dans la Méthodologie.
- **Départs des électeurs du 1er tour** : l'abandon actuel, plus un taux uniforme qui compense exactement les arrivées. Le total des exprimés et le score des finalistes restent identiques. Les électeurs des finalistes ne sont plus fidèles à 100 %.
- **Tests** :
  - score des finalistes inchangé avant et après ;
  - total des flux égal à 100 % des inscrits ;
  - nombre d'exprimés du 2nd tour conservé ;
  - mode Tableau avec les deux nouvelles lignes.
- **Méthodologie, étape 7** : le tableau de la section 3, la source Cevipof, la méthode de recalage, les hypothèses (répartition de repli) et leurs limites.

## 8. Décisions

Validées par l'utilisateur :
- Montrer les nouveaux votants : c'est une exigence de factualité, pas une option.
- Ne prendre aucune hypothèse arbitraire : chaque taux doit avoir une source fiable. Des données de la seule année 2022 suffisent.
- Répartition « comme l'ensemble des votants » uniquement en repli, à défaut de mieux.
- Méthode de travail : plan relu par l'utilisateur, exécution par un agent Sonnet, un commit par partie.

En attente :
- L'accès aux données du panel, demandé le 15/11/2026 et refusé le 18/11/2026. Piste restante : demander au Cevipof ou à l'entrepôt (CDSP) **uniquement le tableau agrégé** de `X11PRES22A` × `X11PRES22B` pondéré par `X11PPUB`, effectifs non pondérés compris. Ce tableau ne contient aucune donnée individuelle. Toute demande écrite à un tiers est relue par l'utilisateur avant envoi.
- Le traitement des votants blancs et nuls du 1er tour. Sans ce tableau, plan B : afficher leur volume, connu (790 760 en 2022, soit 1,6 % des inscrits), avec la mention « comportement au 2nd tour non mesuré », sans flux inventé. Les abstentionnistes du 1er tour sont affichés avec les mesures de l'Ifop 2022, recoupées par l'Insee.

## 9. Pour reprendre

1. Télécharger les données du panel une fois l'accès accordé. Les ranger hors du dépôt.
2. Faire le calcul de la section 6, puis présenter les résultats à l'utilisateur **avant** toute modification du site : tableau recalé, intervalles, comparaison avec l'Insee et l'Ifop.
3. Après validation, rédiger le plan d'exécution (sections 6 et 7), le faire valider, puis le confier à un agent Sonnet, en un commit.
