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

L'application répond sur <http://localhost:8080>. Le `--build` est nécessaire à chaque
modification de `nginx.conf`, qui est copié dans l'image.

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
  prélèvement retenu depuis le début, lus sur l'état de compte Bricks.
* **Perçu contre attendu** — ce qui est réellement tombé, face à ce que le portefeuille
  aurait dû verser. L'écart est le manque à gagner. → [Lire les chiffres](docs/revenus.md)
* **Carnet de versements** — qui a versé ce mois-ci, qui s'est tu, et depuis quand. Une
  marque par mois sur treize mois, par propriété.
* **Suivi des incidents** — défaut, impayé, contentieux, capital exposé, d'après le statut
  officiel de chaque projet. Cliquer sur une tuile filtre le registre.
* **Revenus par année** — coupons, prélèvement, parrainage, solde boosté et capital rendu,
  ventilés par année civile pour la déclaration.
* **Graphiques** — investissement, revenus, impôt, répartition, portefeuille en surface,
  avec une période réglable commune aux trois courbes datées.
* **Registre des propriétés** — adresse, briques, rendement, alertes datées, fiche
  cliquable vers Bricks. 24 par page, avec recherche libre, tri, et filtres par statut,
  alerte, pays et versement, rappelés en puces et remisables à zéro.
* **Simulateur** — apport, horizon, rendement, impayés, réinvestissement. Une calculette,
  pas une prévision.

## Captures d'écran

À venir. Les images se déposent dans `docs/captures/` et se référencent ici ; les lignes
sont prêtes, il suffit de les décommenter. Une capture pleine largeur a sa place tout en
haut du fichier, au-dessus de « Démarrer ».

<!--
![Vue d'ensemble](docs/captures/vue-ensemble.png)
![Registre des propriétés](docs/captures/registre.png)
![Revenus perçus et attendus](docs/captures/revenus.png)
-->

## Aller plus loin

| Document | Contenu |
| --- | --- |
| [Lire les chiffres](docs/revenus.md) | Perçu et attendu, carnet de versements, fiscalité, graphiques |
| [Accès à l'API](docs/api.md) | Le proxy nginx, les endpoints, le suivi officiel des projets |
| [Sécurité](docs/securite.md) | Cookie de session, CSP, intégrité des dépendances |
| [Développement](docs/developpement.md) | Tests, pile technique, architecture du code |
