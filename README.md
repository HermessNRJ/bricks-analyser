# Analyseur d'Investissements Bricks.co

## Description

Cet outil est un tableau de bord permettant d'analyser et de visualiser vos données d'investissement immobilier provenant de la plateforme Bricks.co. Il offre une vue d'ensemble de vos actifs, revenus, projections futures, warnings et plus encore, en récupérant vos données directement depuis l'API Bricks.co.

## Fonctionnalités Principales

*   **Chargement via API:**
    *   Récupérez vos données en temps réel en utilisant l'API Bricks.co avec votre Bearer Token.
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

L'application est configurée pour être servie par `nginx` via Docker, ce qui permet d'utiliser l'API sans problème de CORS.

*   Assurez-vous d'avoir Docker et Docker Compose installés.
*   Clonez ce dépôt ou assurez-vous que tous les fichiers du projet sont dans le même répertoire.
*   Ouvrez un terminal dans ce répertoire et exécutez :
    ```bash
    docker-compose up -d
    ```
*   L'application sera accessible à l'adresse `http://localhost:8080` (port défini dans `docker-compose.yml`).

**Chargement des Données:**

1. Récupérez votre Bearer Token depuis votre compte Bricks.co (via les outils de développement de votre navigateur ou l'interface développeur de Bricks).
2. Entrez votre Bearer Token dans le champ prévu à cet effet.
3. Cliquez sur "Charger les données API".
4. L'application récupère automatiquement vos données depuis les endpoints suivants :
   * `https://api.bricks.co/projects/financed` - Projets financés
   * `https://api.bricks.co/projects` - Projets en cours de financement et à venir
   * `https://api.bricks.co/investor/portfolio/properties/highlighted-updates` - Warnings et mises à jour importantes
5. Les données sont traitées et affichées immédiatement, puis sauvegardées dans le localStorage pour les prochaines visites.

## Endpoints API Utilisés

L'application utilise les endpoints suivants de l'API Bricks.co :

* **Projets financés :** `GET /projects/financed`
* **Tous les projets :** `GET /projects` (filtre les projets ongoing/upcoming où vous détenez des parts)
* **Warnings :** `GET /investor/portfolio/properties/highlighted-updates`

Tous les appels nécessitent un Bearer Token valide dans le header `Authorization`.

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
* Le token API n'est jamais persisté : il est effacé du champ de saisie après usage.

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
