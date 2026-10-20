// Extrait réduit de la liste des sondages de Wikipedia, avec ses particularités : colonne PS double
// (colspan) avec remplaçant, colonne « Autres » à plusieurs candidats, attributs produits par un modèle,
// valeurs en {{blanc|…}}, lignes de couleurs et d'événement, deux blocs pour un même sondage, total aberrant,
// période plus ancienne, section « Autres » (vote blanc compté comme exprimé) et duels de 2nd tour.

export const NOTICE = 'https://www.commission-des-sondages.fr/notices/files/notices/2026/octobre'

export const HEADER = `! rowspan=3 | Sondeur
! rowspan=3 | Date
! rowspan=3 | Échantillon
! [[Fichier:Melenchon.jpg|50x50px]]
! colspan=2 | [[Fichier:Glucksmann.jpg|50x50px]]
! [[Fichier:Philippe.jpg|50x50px]]
! [[Fichier:Le Pen.jpg|50x50px]]
! rowspan="2" | Autres
|-
! [[Jean-Luc Mélenchon|Mélenchon]]<br><small>([[La France insoumise|LFI]])</small>
! colspan=2 | [[Raphaël Glucksmann|Glucksmann]]<ref group="alpha" name="SaufPrécision">Sauf précision contraire.</ref>
! [[Édouard Philippe|Philippe]]<br><small>([[Horizons|HOR]])</small>
! [[Marine Le Pen|Le Pen]]<br><small>([[Rassemblement national|RN]])</small>
|- style="line-height:5px;"
| {{Infobox Parti politique français/couleurs|LFI}} |
| colspan=2 {{Infobox Parti politique français/couleurs|PP}} |
| {{Infobox Parti politique français/couleurs|HOR}} |
| {{Infobox Parti politique français/couleurs|RN}} |
| {{Infobox Parti politique français/couleurs|DIV}} |`

export const row = (firm: string, dates: string, sample: string, cells: string[]) =>
  ['|-', `| ${firm}`, `| ${dates}`, `| ${sample}`, ...cells.map((c) => `|${c}`)].join('\n')

export const WIKITEXT = `
== Sondages concernant le premier tour ==
=== Année 2026 ===
==== Second semestre 2026 ====
===== Octobre-décembre 2026 =====
{| class="wikitable"
${HEADER}
|-
| colspan="9" bgcolor="#cecece" |<small>'''[[Allocution présidentielle]] du {{date|18|10|2026}}.'''</small>
|-
| rowspan="2" style="{{Sondeur|YouGov}}" |[${NOTICE}/10323-pres-iv-yougov-le-huffpost-18-octobre.pdf YouGov]
| rowspan="2" | 12-15 octobre
| rowspan="2" | {{formatnum:1094}}
| {{Infobox Parti politique français/couleurs|LFI}} | '''{{blanc|20}}'''
|colspan=2 |15,5
|20
| {{Infobox Parti politique français/couleurs|RN}} | '''{{blanc|40}}'''
|4<br><small>'''[[David Lisnard|Lisnard]]'''</small><hr><1<br><small>'''[[Karim Bouamrane|Bouamrane]]'''</small>
|-
|21
|colspan=2 |9<br><small>'''[[François Hollande|Hollande]] ([[Parti socialiste (France)|PS]])'''</small>
|25
|'''{{blanc|45}}'''
|—
${row(`[${NOTICE}/10319-pres-iv-opinionway-cnews-15-octobre.pdf OpinionWay]`, '13-14 octobre', '{{formatnum:1043}}', ['20', 'colspan=2 |15', '25', '40', '—'])}
${row(`[${NOTICE}/10318-pres-presitrack-v3-opinionway-15-octobre.pdf OpinionWay]`, '13-14 octobre', '{{formatnum:1043}}', ['22', 'colspan=2 |14', '24', '40', '—'])}
${row('[https://example.org OpinionWay]', '6-7 octobre', '1 001', ['20', 'colspan=2 |15', '25', '40', '—'])}
${row('[https://www.odoxa.fr/sondage Odoxa]', '24 septembre - 7 octobre', '{{formatnum:12005}}', ['18', 'colspan=2 |12', '25', '45', '—'])}
${row('[https://example.org Elabe]', '10-11 octobre', '1 500', ['30', 'colspan=2 |20', '30', '40', '—'])}
${row('[https://example.org Ifop]', '12-14 octobre', '1 390', ['20', '12', "4<br><small>'''[[Olivier Faure|Faure]] ([[Parti socialiste (France)|PS]])'''</small>", '24', '40', '—'])}
|}
===== Juillet-septembre 2026 =====
{| class="wikitable"
${HEADER}
${row('[https://example.org Cluster17]', '15-16 septembre', '1 943', ['20', 'colspan=2 |15', '25', '40', '—'])}
|}
=== Autres ===
{| class="wikitable"
${HEADER}
${row('[https://example.org Ifop]', '1-2 novembre', '1 000', ['20', 'colspan=2 |15', '25', '40', '—'])}
|}

== Sondages concernant le second tour ==
=== Sondages impliquant des candidats déclarés ou pressentis ===
==== Hypothèse Philippe – Le Pen ====
{| class="wikitable"
|- bgcolor=lightgray
! scope=col rowspan="3" | Sondeur
! scope=col rowspan="3" | Dates
! scope=col rowspan="3" | Échantillon
! [[Fichier:Philippe.jpg|95x95px]]
! [[Fichier:Le Pen.jpg|95x95px]]
|-
! [[Édouard Philippe|Philippe]]<br><small>([[Horizons|HOR]])</small>
! [[Marine Le Pen|Le Pen]]<br><small>([[Rassemblement national|RN]])</small>
|-
| {{Infobox Parti politique français/couleurs|HOR}} |
| {{Infobox Parti politique français/couleurs|RN}} |
|-
| style="{{Sondeur|YouGov}}" |[${NOTICE}/10323-pres-iv-yougov-le-huffpost-18-octobre.pdf YouGov]
|12-15 octobre 2026
|{{formatnum:1094}}
|48
| {{Infobox Parti politique français/couleurs|RN}} |'''{{blanc|52}}'''
|-
| [https://example.org YouGov]
|17-21 septembre 2026
|{{formatnum:1103}}
|45
|55
|}
=== Sondages impliquant des candidats absents au premier tour ===
==== Hypothèse Philippe – Bardella ====
{| class="wikitable"
! rowspan="2" | Sondeur
! rowspan="2" | Dates
! rowspan="2" | Échantillon
! [[Édouard Philippe|Philippe]]
! [[Jordan Bardella|Bardella]]
|-
! HOR !! RN
|-
| [https://example.org Elabe] || 14-16 octobre 2026 || 1 701 || 40 || 60
|}
`
