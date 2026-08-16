# Analyseur d'investissements Bricks.co

Tableau de bord local pour lire son portefeuille [Bricks.co](https://app.bricks.co) : ce
qui est investi, ce qui a réellement été versé, ce qui manque à l'appel, et ce que ça
donnerait sous d'autres hypothèses. Les données sont récupérées depuis l'API Bricks et ne
quittent pas votre machine.

## Démarrer

### 1. Lancer l'application

Docker est **obligatoire** : c'est nginx qui relaie les appels vers `api.bricks.co`, que le
navigateur ne peut pas joindre directement ([pourquoi](docs/api.md)).

```bash
docker-compose up -d --build
```

L'application répond sur <http://localhost:8080>. Le `--build` est nécessaire après toute
modification de `nginx.conf` ou d'`index.html`, tous deux copiés dans l'image. `src/` est
monté en direct : le JavaScript et la CSS se rechargent sans reconstruire.

### 2. Récupérer sa session Bricks

L'authentification se fait par cookie de session (better-auth, posé après le SSO Google) —
il n'y a plus de Bearer token.

1. Connectez-vous sur `app.bricks.co`.
2. Outils de développement → onglet **Réseau** → cliquez sur une requête vers
   `api.bricks.co` → dans les en-têtes de requête, copiez la valeur de `Cookie`. Elle
   contient `cf_clearance` et `__Secure-better-auth.session_token`, tous deux nécessaires.
3. Collez-la dans le champ prévu. Le préfixe `Cookie:` et les espaces sont tolérés.
4. **Charger les données API** (ou Entrée).

Les données s'affichent immédiatement et sont conservées dans le localStorage pour les
visites suivantes. La session dure environ 30 jours ; se déconnecter de Bricks l'invalide
aussitôt.

> Ce cookie donne un accès complet au compte — solde, IBAN, état civil. Le traiter comme un
> mot de passe : ne jamais le committer ni le coller dans un ticket ou un export HAR
> partagé. L'application ne le persiste jamais. [Détails](docs/securite.md)

### 3. Tenir les données à jour

Le bouton **Vérifier les statuts** interroge le suivi officiel de chaque projet. La date de
récupération est affichée en permanence et signalée au-delà de deux semaines : un filtre
« alerte ce mois-ci » à zéro peut n'être que le reflet de données périmées.

Un nouveau chargement fusionne plutôt qu'il n'écrase : les projets connus sont mis à jour,
les nouveaux ajoutés, et ceux qui ont disparu de l'API vous sont soumis avant suppression.
**Effacer les données locales** remet le tableau de bord à zéro.

## Ce que ça montre

* **Chiffres clés** — investissement, briques et propriétés actives, net perçu et
  impôt prélevé depuis le début, lus sur l'état de compte Bricks.
* **Perçu contre attendu** — ce qui est réellement tombé, face à ce que le portefeuille
  aurait dû verser. L'écart est le manque à gagner. → [Lire les chiffres](docs/revenus.md)
* **Rendement annualisé** — ce que le capital rapporte vraiment, sur 1, 3, 6, 12 mois et
  depuis le début. Un taux constaté, non le taux promis.
* **Carnet de versements** — qui a versé ce mois-ci, qui s'est tu, et depuis quand. Une
  marque par mois sur treize mois, par propriété.
* **Suivi des incidents** — défaut, impayé, contentieux, capital exposé, d'après le statut
  officiel de chaque projet. Cliquer sur une tuile filtre le registre.
* **Revenus par année** — coupons, impôt prélevé, impôt encore dû sur ce qui a été versé
  brut, parrainage, solde boosté, capital remboursé et versements personnels, par année civile.
* **Origine des fonds** — ce que vous avez déposé, ce que le parrainage et le solde boosté
  ont ajouté, et la part du portefeuille qui vient de votre poche.
* **Ce qui ne vous est pas parvenu** — les coupons que les échéances impayées n'ont pas
  versés et les pénalités de retard, cumulés mois par mois. Une échéance rattrapée quitte
  la courbe. → [Lire les chiffres](docs/revenus.md#ce-qui-ne-vous-est-pas-parvenu)
* **Graphiques** — investissement, revenus, arriérés, impôt, répartition, portefeuille en
  surface, avec une période réglable commune aux courbes datées.
* **Registre des propriétés** — adresse, briques, rendement, alertes datées, fiche
  cliquable vers Bricks. 24, 48, 96 fiches par page ou tout d'un bloc, avec recherche
  libre, tri, et filtres par statut,
  alerte, pays et versement, rappelés en puces et remisables à zéro.
* **Simulateur** — apport, horizon, rendement, impayés, réinvestissement. Une calculette,
  pas une prévision.

## Captures d'écran

À venir. `npm run demo` fabrique un portefeuille fictif de 42 propriétés à photographier —
inutile de publier le vôtre. Mode d'emploi, liste des captures utiles et emplacement de
chacune : [docs/captures](docs/captures/README.md).

Les lignes ci-dessous n'attendent que d'être décommentées ; la première a sa place tout en
haut du fichier, au-dessus de « Démarrer ».

<!--
![Vue d'ensemble du tableau de bord](docs/captures/vue-ensemble.png)
![Le registre des propriétés et leurs carnets de versements](docs/captures/registre.png)
-->

## Aller plus loin

| Document | Contenu |
| --- | --- |
| [Lire les chiffres](docs/revenus.md) | Perçu et attendu, carnet de versements, fiscalité, graphiques |
| [Accès à l'API](docs/api.md) | Le proxy nginx, les endpoints, le suivi officiel des projets |
| [Sécurité](docs/securite.md) | Cookie de session, CSP, intégrité des dépendances |
| [Développement](docs/developpement.md) | Tests, pile technique, architecture du code |
