# Analyseur d'Investissements Bricks.co

## Description

Cet outil est un tableau de bord permettant d'analyser et de visualiser vos données d'investissement immobilier provenant de la plateforme Bricks.co. Il offre une vue d'ensemble de vos actifs, revenus, projections futures, warnings et plus encore, en récupérant vos données directement depuis l'API Bricks.co.

## Fonctionnalités Principales

*   **Chargement via API:**
    *   Récupérez vos données en temps réel depuis l'API Bricks.co, avec votre cookie de session.
    *   Collecte automatique des projets financés, en cours de financement, à venir et des warnings (highlighted updates).

*   **Tableau de Bord Complet:**
    *   **Statistiques Clés:** Investissement total, revenus mensuels nets espérés, nombre total de briques (actives), nombre de propriétés (actives), projets remboursés, projets en cours de financement/à venir.
    *   **Cumulatifs:** Total des revenus nets perçus et total des impôts (flat tax 30%) estimés depuis le début.

*   **Visualisations Graphiques:**
    *   **Évolution de l'Investissement:** Suivez la croissance de votre investissement total au fil du temps.
    *   **Répartition par Propriété:** Visualisez la distribution de votre investissement entre les différentes propriétés (graphique en donut interactif).
    *   **Treemap du Portefeuille:** Vue d'ensemble de vos propriétés actives avec taille proportionnelle à l'investissement et couleur basée sur le rendement annuel (gradient continu de rouge à vert).
    *   **Évolution des Revenus Mensuels Nets:** Observez la progression de vos revenus nets mensuels attendus.
    *   **Montant de l'Impôt Mensuel:** Suivez l'estimation de la flat tax (30%) sur vos revenus bruts mensuels.

*   **Projections de Revenus:**
    *   Affiche les revenus mensuels nets estimés pour le mois en cours et les trois prochains mois (M+1, M+2, M+3).

*   **Liste Détaillée des Propriétés:**
    *   **Informations complètes:** Adresse, briques possédées, investissement, rendement, revenus mensuels nets, date de premier versement, date de remboursement estimée.
    *   **Identification visuelle:** Projets **remboursés**, **en cours de financement**, ou **à venir**.
    *   **Cartes cliquables:** Cliquez sur une propriété pour l'ouvrir directement sur Bricks.co.
    *   **Système de warnings:** Affichage des warnings avec badge coloré (rouge pour récents, orange pour anciens), détail des dates et descriptions.

*   **Filtrage et Tri Avancés:**
    *   **Tri:** Par investissement, nombre de briques, rendement, revenus mensuels, nom, date de premier versement (croissant/décroissant).
    *   **Filtres par statut:** Toutes, actives uniquement, remboursées, en financement, à venir.
    *   **Filtres par date:** Avec/sans date de 1er versement, avec/sans date de remboursement.
    *   **Filtres par warning:** Tous, avec/sans warning, warnings du mois dernier, warnings du mois d'avant.
    *   **Préférences sauvegardées:** Vos choix de tri et filtrage sont conservés dans le localStorage.

*   **Persistance des Données:**
    *   Les données et warnings chargés sont sauvegardés dans le Local Storage de votre navigateur.
    *   Rechargement automatique au démarrage pour une consultation rapide.
    *   Logique de fusion intelligente lors de nouveaux imports API pour mettre à jour les données existantes, ajouter les nouveautés, et proposer la suppression des éléments disparus.

*   **Utilitaires:**
    *   Bouton "Scroll to Top" pour une navigation aisée.
    *   Bouton "Effacer les Données Locales" pour réinitialiser le tableau de bord.

## Comment Utiliser

**Via Docker (Recommandé):**

L'application est servie par `nginx` via Docker. **Docker est obligatoire pour le chargement
API** : c'est nginx qui relaie les appels vers `api.bricks.co` (voir « Accès à l'API »).

*   Assurez-vous d'avoir Docker et Docker Compose installés.
*   Clonez ce dépôt ou assurez-vous que tous les fichiers du projet sont dans le même répertoire.
*   Ouvrez un terminal dans ce répertoire et exécutez :
    ```bash
    docker-compose up -d --build
    ```
    `nginx.conf` est copié à la construction de l'image (voir `Dockerfile`) : toute
    modification de la configuration du proxy exige le `--build`.
*   L'application sera accessible à l'adresse `http://localhost:8080` (port défini dans `docker-compose.yml`).

**Chargement des Données:**

L'authentification Bricks se fait par **cookie de session** (better-auth, posé après le SSO
Google) — il n'y a plus de Bearer token. Voir « Accès à l'API » plus bas pour le détail.

1. Connectez-vous sur `app.bricks.co`.
2. Ouvrez les outils de développement → onglet **Réseau** → cliquez sur une requête vers
   `api.bricks.co` → dans les en-têtes de requête, copiez la valeur de `Cookie`.
   Elle contient `cf_clearance` (Cloudflare) et `__Secure-better-auth.session_token`,
   tous deux nécessaires.
3. Collez-la dans le champ prévu à cet effet. Le préfixe `Cookie:` et les espaces autour
   sont tolérés.
4. Cliquez sur "Charger les données API" (ou appuyez sur Entrée).
5. Les données sont traitées et affichées immédiatement, puis sauvegardées dans le
   localStorage pour les prochaines visites.

La session Bricks dure environ 30 jours : une fois collée, elle reste valable jusqu'à
expiration ou déconnexion. **Se déconnecter de Bricks invalide immédiatement le cookie**,
il faudra alors en recopier un nouveau.

## Accès à l'API

`api.bricks.co` ne peut pas être appelée directement depuis le navigateur :

* Les réponses portent `Access-Control-Allow-Origin: https://app.bricks.co` — une origine
  unique, pas `*` — avec `Access-Control-Allow-Credentials: true`. Une page servie depuis
  `localhost` ne peut donc pas lire ces réponses.
* Cloudflare renvoie `403` + `cf-mitigated: challenge` à toute requête dont l'origine et
  l'empreinte client ne correspondent pas à celles de l'application officielle.

`nginx.conf` définit donc un **proxy inverse** sur `/api/` qui relaie vers `api.bricks.co`
en réécrivant `Host`, `Origin` et `Referer` vers `app.bricks.co`. Côté navigateur tout est
same-origin, et la question du CORS disparaît.

Le cookie ne pouvant pas être posé sur `bricks.co` depuis `localhost`, le client l'envoie
dans l'en-tête `X-Bricks-Session`, que le proxy réinjecte en `Cookie` vers l'amont.
`CONFIG.API_BASE_URL` vaut donc `/api` et non l'URL absolue.

**Vérifié :** avec `Origin`/`Referer` réécrits et le `User-Agent` du navigateur relayé tel
quel, Cloudflare laisse passer le proxy — une requête portant une session bidon reçoit un
`401 session_expired` de l'API, et non un `403 cf-mitigated: challenge`. Un appel direct
depuis `localhost`, lui, est bien challengé en `403`.

**Limite possible :** `cf_clearance` reste lié à l'adresse IP. Si le proxy tourne ailleurs
que sur le réseau depuis lequel le cookie a été obtenu, Cloudflare peut redemander un
challenge ; il faut alors recopier une valeur fraîche.

Endpoints utilisés (relayés sous `/api`) :

* **Projets financés :** `GET /projects/financed`
* **Tous les projets :** `GET /projects` (filtre les projets ongoing/upcoming où vous détenez des parts)
* **Warnings :** `GET /investor/portfolio/properties/highlighted-updates`

Le mode `npm run serve` (serveur Python statique) ne fournit pas ce proxy : le chargement
API n'y fonctionne pas, seules les données déjà en localStorage s'affichent.

## Tests

Les tests couvrent la logique métier (calculs financiers, fusion des données, filtres, tri,
persistance, client API) sans nécessiter de token ni de données personnelles.

```bash
npm install          # une seule fois
npm test             # ~200 tests unitaires (Vitest + jsdom)
npm run test:watch   # mode watch pendant le développement
npm run test:coverage
```

**Smoke test de bout en bout** (optionnel) : ouvre `index.html` dans un vrai Chromium avec un
jeu de données injecté dans le localStorage, et vérifie le rendu, les filtres, le tri et le
non-exécution du HTML venant de l'API.

```bash
npx playwright install chromium   # une seule fois
npm run serve                     # dans un autre terminal (port 8099)
npm run test:e2e
```

Variables d'environnement du smoke test : `BASE_URL` (défaut `http://127.0.0.1:8099`),
`CHROMIUM_PATH` (Chromium déjà installé sur la machine), `SCREENSHOT` (chemin de capture).

Ce qui n'est pas couvert par les tests automatisés : les gestionnaires d'événements du DOM
(`src/events/`), les modales et la configuration Chart.js (`src/charts/`), qui restent
vérifiés par le smoke test et à la main.

## Technologies Utilisées

* **Frontend :** HTML5, CSS3, JavaScript ES6 (Modules)
* **Visualisation :** Chart.js 3.9.1 avec plugin chartjs-chart-treemap 2.3.0
* **Architecture :** Modulaire avec séparation des responsabilités (API, Business Logic, UI, Events)
* **Stockage :** LocalStorage pour la persistance des données
* **Serveur :** Nginx (via Docker)
* **Tests :** Vitest + jsdom (unitaires), Playwright (smoke test)

### Sécurité

* Toutes les données provenant de l'API sont échappées avant injection dans le DOM
  (`src/utils/html.js`), et les URLs de miniatures sont restreintes à `http(s)`.
* `nginx.conf` envoie une `Content-Security-Policy` qui limite les scripts au domaine
  de l'application et aux deux CDN de Chart.js.
* Les scripts Chart.js sont chargés depuis un CDN sans `integrity`. Pour ajouter les
  hachages SRI :
  ```bash
  curl -s <url-du-script> | openssl dgst -sha384 -binary | openssl base64 -A
  ```
  puis reporter le résultat dans `index.html` via `integrity="sha384-..." crossorigin="anonymous"`.
* Le cookie de session n'est jamais persisté : il est effacé du champ de saisie après usage,
  et n'est écrit ni dans le localStorage ni dans les logs.
* Le proxy `/api/` ne transporte que la session fournie par l'appelant : il ne détient aucun
  identifiant. Exposer le port 8080 hors de la machine reste toutefois déconseillé.
* Ce cookie donne un accès complet au compte Bricks (solde, IBAN, état civil). Le traiter
  comme un mot de passe : ne jamais le committer, ni le coller dans un ticket ou un export
  HAR partagé.

## Architecture du Code

L'application suit une architecture modulaire ES6 avec séparation des responsabilités :

```
src/
├── business/         # Logique métier
│   ├── calculations.js      # Calculs financiers et statistiques
│   ├── dataProcessor.js     # Fusion et traitement des données
│   └── processor.js         # Orchestration du traitement
├── charts/           # Gestion des graphiques
│   ├── chartManager.js      # Gestionnaire principal
│   ├── distributionChart.js # Graphique en donut
│   ├── investmentChart.js   # Évolution investissement
│   ├── revenueChart.js      # Évolution revenus
│   ├── taxChart.js          # Évolution taxes
│   └── treemapChart.js      # Vue portefeuille treemap
├── core/             # Configuration et état
│   ├── config.js            # Configuration globale
│   └── state.js             # Gestion d'état centralisée
├── data/             # Gestion des données
│   ├── apiClient.js         # Appels API Bricks.co
│   └── storage.js           # LocalStorage
├── events/           # Gestionnaires d'événements
│   ├── apiHandler.js        # Chargement via API
│   ├── appInitializer.js    # Point d'entrée
│   ├── cacheHandler.js      # Réinitialisation cache
│   └── scrollHandler.js     # Scroll to top
├── ui/               # Interface utilisateur
│   ├── modals.js            # Modales et erreurs
│   └── uiUpdater.js         # Mise à jour de l'interface
├── utils/            # Utilitaires
│   ├── countryHelpers.js    # Détection du pays (drapeaux)
│   ├── dateHelpers.js       # Manipulation de dates
│   ├── formatters.js        # Formatage des valeurs
│   ├── html.js              # Échappement HTML / validation d'URL
│   └── logger.js            # Logging catégorisé
└── styles/
    └── main.css             # Styles globaux

tests/                # Tests unitaires (Vitest)
└── e2e/smoke.mjs     # Smoke test navigateur (Playwright)
```
