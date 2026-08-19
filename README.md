# Analyseur d'investissements Bricks.co

Tableau de bord local pour lire son portefeuille [Bricks.co](https://app.bricks.co) : ce
qui est investi, ce qui a réellement été versé, ce qui manque à l'appel, et ce que ça
donnerait sous d'autres hypothèses. Les données sont récupérées depuis l'API Bricks et ne
quittent pas votre machine.

> Outil indépendant, sans lien avec Bricks.co : ni affilié, ni approuvé, ni soutenu par
> eux. Il lit une API non documentée, qui peut changer sans préavis. Aucun chiffre affiché
> ne fait foi — seul votre relevé Bricks compte — et rien ici n'est un conseil en
> investissement.

![Le tableau de bord : le mur des propriétés, les huit chiffres clés, le rendement annualisé sur cinq fenêtres et le suivi des incidents](docs/captures/vue-ensemble.png)

## Démarrer

### 1. Lancer l'application

Une image prête à l'emploi est publiée à chaque version. Rien d'autre à installer : le
proxy vers l'API Bricks est dans l'image.

```bash
docker run -d -p 8080:80 --name bricks ghcr.io/hermessnrj/bricks-analyser:latest
```

L'application répond sur <http://localhost:8080>.
([Toutes les versions](https://github.com/HermessNRJ/bricks-analyser/releases))

<details>
<summary>Ou depuis le dépôt cloné, pour modifier le code</summary>

```bash
docker compose up -d --build
```

Docker reste **obligatoire** : c'est nginx qui relaie les appels vers `api.bricks.co`, que
le navigateur ne peut pas joindre directement ([pourquoi](docs/api.md)).

`src/` est monté en direct — le JavaScript et la CSS se rechargent sans reconstruire. Le
`--build` n'est nécessaire qu'après une modification de `nginx.conf` ou d'`index.html`,
tous deux copiés dans l'image.

</details>

### 2. Récupérer ses données

Trois gestes, et rien à copier :

1. Sur la page d'accueil, **glissez le lien « Collecter mes données Bricks »** dans votre
   barre de favoris.
2. Ouvrez `app.bricks.co`, connectez-vous, puis **cliquez ce favori**. Il lit vos données
   sur place et écrit un fichier `bricks-AAAA-MM-JJ-HHMM.json`.
3. **Déposez ce fichier** sur l'analyseur.

Les données s'affichent et sont conservées dans le localStorage pour les visites suivantes.

Pourquoi ce détour plutôt qu'un mot de passe : le cookie de session Bricks donne un accès
complet au compte — solde, IBAN, état civil. Le favori s'exécute sur `bricks.co`, où le
navigateur joint la session de lui-même, et n'a donc rien à extraire. Votre session ne
quitte jamais l'onglet qui la détenait, et l'analyseur ne la voit à aucun moment.
→ [Ce que chaque voie demande comme confiance](docs/securite.md)

<details>
<summary>Ou coller le cookie de session, comme avant</summary>

1. Connectez-vous sur `app.bricks.co`.
2. Outils de développement → onglet **Réseau** → cliquez sur une requête vers
   `api.bricks.co` → dans les en-têtes de requête, copiez la valeur de `Cookie`. Elle
   contient `cf_clearance` et `__Secure-better-auth.session_token`, tous deux nécessaires.
3. Collez-la dans le champ prévu, puis **Charger les données**.

> Ce cookie donne un accès complet au compte. Le traiter comme un mot de passe : ne jamais
> le committer ni le coller dans un ticket ou un export HAR partagé. L'application ne le
> persiste jamais. [Détails](docs/securite.md)

Cette voie reste pleinement soutenue : elle charge tout en une fois, et elle est le repli
si l'API change de forme avant qu'un favori ancien n'ait été reposé.

</details>

### 3. Tenir à jour

Le bouton **Vérifier les statuts** interroge le suivi officiel de chaque projet. La date de
récupération est affichée en permanence et signalée au-delà de deux semaines : un filtre
« alerte ce mois-ci » à zéro peut n'être que le reflet de données périmées.

Un nouveau chargement fusionne plutôt qu'il n'écrase : les projets connus sont mis à jour,
les nouveaux ajoutés, et ceux qui ont disparu de l'API vous sont soumis avant suppression.
**Effacer les données locales** remet le tableau de bord à zéro.

L'application, elle, affiche sa version en pied de page et signale une version plus
récente — c'est le seul appel qu'elle passe d'elle-même, une fois par jour, vers GitHub et
non vers Bricks ([ce qu'il expose](docs/securite.md#le-seul-appel-que-lapplication-passe-delle-même)).
Cliquer le numéro revérifie sur-le-champ. Pour installer la nouvelle version, en une
commande — le portefeuille vit dans le navigateur, rien n'est perdu à remplacer le
conteneur :

```bash
docker pull ghcr.io/hermessnrj/bricks-analyser:latest \
  && docker rm -f bricks \
  && docker run -d -p 8080:80 --name bricks ghcr.io/hermessnrj/bricks-analyser:latest
```

Depuis un dépôt cloné, c'est `git pull` puis `docker compose up -d --build`.

## Ce que ça montre

* **Chiffres clés** — investissement, briques et propriétés actives, net perçu et impôt
  prélevé depuis le début.
* **Perçu contre attendu** — ce qui est réellement tombé, face à ce que le portefeuille
  aurait dû verser. L'écart est le manque à gagner.
* **Rendement annualisé** — sur 1, 3, 6, 12 mois et depuis le début. Un taux constaté, non
  le taux promis.
* **Carnet de versements** — qui a versé ce mois-ci, qui s'est tu, et depuis quand.
* **Suivi des incidents** — défaut, impayé, contentieux, capital exposé, d'après le statut
  officiel de chaque projet.
* **Revenus par année** — coupons, impôt prélevé et impôt encore dû, parrainage, solde
  boosté, capital remboursé et versements personnels.
* **Ce qui ne vous est pas parvenu** — coupons non versés et pénalités de retard, cumulés
  mois par mois. Une échéance rattrapée quitte la courbe.
* **Géographie** — départements couverts, capital par région, carte de France teintée par
  département, détail par localisation. Déduit du code postal ; ce qui n'a pas pu être
  situé est compté et dit, jamais rangé au hasard.
* **Registre des propriétés** — adresse, briques, rendement, alertes datées, avec recherche
  libre, tri, filtres et pagination.
* **Simulateur** — apport, horizon, rendement, impayés, réinvestissement. Une calculette,
  pas une prévision.
* **Clair ou sombre** — la page suit le système ; l'interrupteur le contredit et s'en
  souvient.

Le détail des calculs, et ce que chaque écran montre exactement, sont dans
[Lire les chiffres](docs/revenus.md).

## Aller plus loin

| Document | Contenu |
| --- | --- |
| [Lire les chiffres](docs/revenus.md) | Perçu et attendu, carnet de versements, fiscalité, graphiques, géographie |
| [Accès à l'API](docs/api.md) | Le proxy nginx, les endpoints, le suivi officiel des projets |
| [Sécurité](docs/securite.md) | Cookie de session, CSP, le seul appel sortant, intégrité des dépendances |
| [Développement](docs/developpement.md) | Tests, pile technique, architecture, publication d'une version |
| [Captures d'écran](docs/captures/README.md) | Le portefeuille de démonstration, cadrages et emplacements |

## Licence

[GNU AGPL-3.0](LICENSE) — Copyright © 2025-2026 Rémi BOIDET.

Libre d'usage, de modification et de redistribution, à une condition : toute version
modifiée reste sous la même licence, **y compris si elle est seulement mise à disposition
sur un réseau** plutôt que distribuée.

Cette clause n'est pas une formalité ici. La sûreté de l'outil tient à ce qu'il tourne sur
votre machine et que le cookie de session n'aille nulle part ailleurs. Une version hébergée
par un tiers renverse ce modèle : on lui confierait un accès complet à son compte Bricks.
L'AGPL ne l'interdit pas, mais elle oblige qui le ferait à publier son code — donc à rester
vérifiable.

Le tracé des départements (`src/carte/departements.svg`) est dérivé d'ADMIN EXPRESS COG de
l'**IGN**, sous [Licence ouverte](https://www.etalab.gouv.fr/licence-ouverte-open-licence/)
(Etalab), via la conversion GeoJSON de Grégoire David. Il est régénéré par
`node tools/carte.mjs`.

Le programme est fourni sans aucune garantie, dans la mesure permise par la loi.
