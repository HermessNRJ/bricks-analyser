# Lire les chiffres

Le tableau de bord affiche deux natures de chiffres qu'il ne faut pas confondre, et
plusieurs lectures fiscales qui méritent une explication. Tout est ici.

## Attendu et perçu

L'**attendu** se déduit des taux affichés : chaque projet détenu est supposé verser son
coupon. C'est une espérance, utile pour les mois à venir.

Le **perçu** vient de l'état de compte Bricks (`/investor/portfolio/revenue`). Il diffère
de l'attendu pour de bonnes raisons :

* les échéances impayées n'y figurent pas ;
* les projets remboursés y ont laissé leur historique ;
* le parrainage et le solde boosté s'y ajoutent ;
* le prélèvement réellement retenu n'est pas le taux forfaitaire — un remboursement de
  capital glissé dans un coupon n'étant pas imposable.

Faute d'état de compte (cache d'une version antérieure), l'application retombe sur
l'estimation et le dit à l'écran.

## Bilan des versements

En tête du registre : le mois jugé, et le décompte des propriétés versées, muettes et pas
encore dues.

Bricks règle autour du 8. Sur un relevé récupéré plus tôt dans le mois, les versements
absents sont peut-être encore en route plutôt qu'en défaut — la réserve est écrite à
l'écran.

## Carnet de versements

Chaque fiche dit ce que le projet a versé sur le dernier mois de l'état de compte :
**Versé** (avec le montant), **Rien reçu** (avec le mois du dernier versement),
**Pas encore** (projet en financement ou premier versement annoncé plus tard), **Soldé**
pour un projet remboursé — le rougir tous les mois suivants noierait les vrais impayés.

Suit une marque par mois sur treize mois, pleine quand l'argent est tombé. C'est le rythme
qui rend le rouge lisible : douze mois pleins suivis d'un blanc ne se lisent pas comme un
silence d'un an. Un mois dû et non versé garde sa case, vide.

Deux règles de prudence :

* Rien ne s'affiche sans état de compte. Une pastille posée sans relevé serait une
  accusation sans pièce au dossier.
* Un projet muet mais sans date de versement annoncée ni versement passé reste en
  **Pas encore** : rien ne prouve qu'un coupon était dû.

Le mois jugé est le dernier du relevé, pas celui de l'horloge — sans quoi un cache de trois
semaines mettrait tout le portefeuille en défaut d'un coup.

## Revenus par année

Ventilation par année civile : coupons versés, prélèvement retenu, parrainage et solde
boosté.

Bricks ne prélève **que sur les coupons**. Le parrainage et le solde boosté — ces centimes
crédités jour après jour — arrivent bruts, sans retenue à la source, et restent donc à
déclarer. Vérifié sur tout l'historique : mois après mois, `taxedTotal` vaut exactement
`coupons − prélèvement + parrainage + solde boosté`.

La colonne des coupons mêle intérêts et remboursements de capital, d'où un prélèvement
effectif inférieur au barème (22 % en 2024, 25 % en 2026 pour un barème à 30 puis 31,4 %).
Elle ne vaut donc pas montant imposable : **l'IFU transmis par Bricks reste la référence**.

Le **capital rendu** a sa propre colonne, lue dans le journal des mouvements
(`/wallet-transactions`). C'est la mise qui revient, pas un gain — et l'état de compte la
range pourtant avec les coupons : en juin 2026, Villa Gypsea y figure pour 34,67 € quand
son coupon mensuel vaut 4,33 €. La colonne reste masquée tant que le journal n'a pas été
lu, une colonne de zéros se lisant à tort comme « aucun remboursement ».

## Les graphiques

* **Évolution de l'investissement** — la croissance du capital engagé au fil du temps.
* **Évolution des revenus nets** — deux courbes. En trait plein, ce qui a réellement été
  encaissé. En pointillé, ce que le portefeuille aurait dû verser au taux affiché ; l'écart
  est le manque à gagner, chiffré au survol et sous le graphique. Le mois en cours,
  forcément incomplet, est tracé avec un point creux.
* **Impôt mensuel prélevé** — le prélèvement effectivement retenu par Bricks. À défaut
  d'état de compte, l'estimation au taux en vigueur (30 % jusqu'en décembre 2025, 31,4 %
  ensuite, chaque mois au taux de son époque).
* **Répartition par propriété** — donut interactif.
* **Portefeuille en surface** — treemap des propriétés actives, taille proportionnelle à
  l'investissement, couleur selon le rendement.
* **Le mur** — une brique par propriété, largeur proportionnelle à l'investissement.
  Cliquer sur une brique amène à sa fiche.

### Pourquoi la comparaison s'arrête à douze mois

L'attendu se calcule sur les projets **encore détenus**. Plus on remonte, plus il
sous-estime : les projets remboursés depuis n'y figurent plus alors qu'ils versaient à
l'époque. En décembre 2024, il annonçait 13,59 € contre 36,41 € réellement perçus — la
comparaison se lirait à l'envers de la vérité. Au-delà de la fenêtre, la courbe pointillée
s'arrête plutôt que de mentir.

### Période des courbes

Un réglage unique gouverne les trois graphiques datés — investissement, revenus, impôt.
Raccourcis (3, 6, 12, 24 derniers mois, tout l'historique) ou mois de début et de fin au
choix.

Un sélecteur par graphique aurait laissé les lire sur des fenêtres différentes, ce qui rend
la comparaison trompeuse. Les bornes se calculent sur une référence commune, arrêtée au
mois courant : sans cela, « les trois derniers mois » auraient désigné une fenêtre
entièrement future pour la série estimée, qui se prolonge de trois mois.

La répartition par propriété et le portefeuille en surface sont des états d'aujourd'hui :
aucun axe temporel, donc aucune période à leur appliquer.

## Suivi des incidents

Répartition des propriétés détenues entre défaut avec échéances dues, impayé, suivi à jour
et sans signalement, avec le capital exposé. Cliquer sur une tuile filtre le registre sur
les fiches concernées.

Les niveaux proviennent du [suivi officiel de chaque projet](api.md#suivi-officiel-des-projets),
qui porte le statut déclaré et le décompte des échéances impayées. À défaut, ils retombent
sur une lecture du texte des alertes, nettement moins fiable.

## Projections

Les revenus mensuels nets estimés sont affichés jusqu'au dernier mois où le montant change
réellement. Au-delà, aucun projet ne commence à verser : répéter trois fois le même montant
n'apprendrait rien, et la note dit à partir de quand il est stable.

## Simulateur

Déroule mois par mois vos hypothèses d'apport, d'horizon, de rendement et d'impayés, avec
ou sans réinvestissement. Les valeurs de départ sont celles de votre propre portefeuille.
C'est une calculette, pas une prévision.
