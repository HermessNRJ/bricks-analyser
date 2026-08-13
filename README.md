# Analyseur d'Investissements Bricks.co

## Description

Cet outil est un tableau de bord permettant d'analyser et de visualiser vos données d'investissement immobilier provenant de la plateforme Bricks.co. Il offre une vue d'ensemble de vos actifs, revenus, projections futures, warnings et plus encore, en récupérant vos données directement depuis l'API Bricks.co.

## Fonctionnalités Principales

*   **Chargement via API:**
    *   Récupérez vos données en temps réel depuis l'API Bricks.co, avec votre cookie de session.
    *   Collecte automatique des projets financés, en cours de financement, à venir, des warnings (highlighted updates), de l'**état de compte** (`/investor/portfolio/revenue`) et du **journal des mouvements** (`/wallet-transactions`, paginé), qui nomme chaque versement.
    *   L'état de compte ventile chaque mois par projet : cette ventilation est conservée telle quelle (une quarantaine de kilo-octets pour trois ans et deux cents projets), et c'est elle qui dit, propriété par propriété, ce qui est tombé et ce qui manque.

*   **Tableau de Bord Complet:**
    *   **Statistiques Clés:** Investissement total, revenus mensuels nets attendus (avec, en regard, ce qui a réellement été perçu le dernier mois complet), nombre total de briques (actives), nombre de propriétés (actives), projets remboursés, projets en cours de financement/à venir.
    *   **Cumulatifs:** Net perçu et prélèvement retenu depuis le début, lus sur l'état de compte Bricks.

*   **Attendu et perçu:** deux chiffres différents, à ne pas confondre.
    *   L'**attendu** se déduit des taux affichés : chaque projet détenu est supposé verser son coupon. C'est une espérance, utile pour les mois à venir.
    *   Le **perçu** vient de l'état de compte. Il en diffère pour de bonnes raisons : les échéances impayées n'y figurent pas, les projets remboursés y ont laissé leur historique, le parrainage et le solde boosté s'y ajoutent, et le prélèvement réellement retenu n'est pas le taux forfaitaire — un remboursement de capital glissé dans un coupon n'étant pas imposable.
    *   Faute d'état de compte (import de fichier, cache d'une version antérieure), l'application retombe sur l'estimation et le dit à l'écran.
    *   **Bilan des versements:** En tête du registre, le mois jugé et le décompte des propriétés versées, muettes et pas encore dues. Bricks règle autour du 8 : sur un relevé récupéré plus tôt, les versements absents sont peut-être encore en route, et la réserve est écrite à l'écran.
    *   **Suivi des incidents:** Répartition des propriétés détenues entre défaut avec échéances dues, impayé, suivi à jour et sans signalement, avec le capital exposé. Les niveaux proviennent du **suivi officiel de chaque projet** (`projects.bricks.co`), qui porte le statut déclaré et le décompte des échéances impayées ; à défaut, ils retombent sur une lecture du texte des alertes, nettement moins fiable. Cliquer sur une tuile filtre le registre sur les fiches concernées.

*   **Période des courbes:**
    *   Un réglage unique gouverne les trois graphiques datés — investissement, revenus, impôt. Raccourcis (3, 6, 12, 24 derniers mois, tout l'historique) ou mois de début et de fin au choix.
    *   Un sélecteur par graphique aurait laissé les lire sur des fenêtres différentes, ce qui rend la comparaison trompeuse. Les bornes se calculent sur une référence commune, arrêtée au mois courant : sans cela, « les trois derniers mois » auraient désigné une fenêtre entièrement future pour la série estimée, qui se prolonge de trois mois.
    *   La répartition par propriété et le portefeuille en surface sont des états d'aujourd'hui : aucun axe temporel, donc aucune période à leur appliquer.

*   **Visualisations Graphiques:**
    *   **Évolution de l'Investissement:** Suivez la croissance de votre investissement total au fil du temps.
    *   **Répartition par Propriété:** Visualisez la distribution de votre investissement entre les différentes propriétés (graphique en donut interactif).
    *   **Treemap du Portefeuille:** Vue d'ensemble de vos propriétés actives avec taille proportionnelle à l'investissement et couleur basée sur le rendement annuel (gradient continu de rouge à vert).
    *   **Évolution des Revenus Mensuels Nets:** Deux courbes. En trait plein, ce qui a réellement été encaissé, mois par mois. En pointillé, ce que le portefeuille aurait dû verser au taux affiché — l'écart entre les deux, c'est le manque à gagner, chiffré au survol et sous le graphique. Le mois en cours, forcément incomplet, est tracé avec un point creux.
        *   La comparaison ne couvre que les **douze derniers mois**. Plus tôt, l'attendu sous-estimerait : il se calcule sur les projets encore détenus, et ceux remboursés depuis n'y figurent plus alors qu'ils versaient à l'époque. En décembre 2024 il annonçait 13,59 € contre 36,41 € réellement perçus, soit une comparaison qui se lit à l'envers de la vérité.
    *   **Montant de l'Impôt Mensuel:** Le prélèvement effectivement retenu par Bricks. À défaut d'état de compte, l'estimation au taux en vigueur (30 % jusqu'en décembre 2025, 31,4 % ensuite, chaque mois au taux de son époque).
    *   **Le mur:** Une brique par propriété, largeur proportionnelle à l'investissement et couleur selon le statut. Cliquer sur une brique amène à la fiche correspondante.

*   **Revenus par année:**
    *   Ventilation par année civile : coupons versés, prélèvement retenu, parrainage et solde boosté.
    *   Bricks ne prélève **que sur les coupons**. Le parrainage et le solde boosté — ces centimes crédités jour après jour — arrivent bruts, sans retenue à la source, et restent donc à déclarer. Vérifié sur tout l'historique : mois après mois, `taxedTotal` vaut exactement `coupons − prélèvement + parrainage + solde boosté`.
    *   La colonne des coupons mêle intérêts et remboursements de capital, d'où un prélèvement effectif inférieur au barème (22 % en 2024, 25 % en 2026 pour un barème à 30 puis 31,4 %). Elle ne vaut donc pas montant imposable : l'IFU transmis par Bricks reste la référence.
    *   Le **capital rendu** a sa propre colonne, lue dans le journal des mouvements. C'est la mise qui revient, pas un gain — et l'état de compte la range pourtant avec les coupons : en juin 2026, Villa Gypsea y figure pour 34,67 € quand son coupon mensuel vaut 4,33 €. La colonne reste masquée tant que le journal n'a pas été lu, une colonne de zéros se lisant à tort comme « aucun remboursement ».

*   **Projections de Revenus:**
    *   Affiche les revenus mensuels nets estimés jusqu'au dernier mois où le montant change réellement — répéter un montant identique n'apprend rien.

*   **Simulateur:**
    *   Déroule mois par mois vos hypothèses d'apport, d'horizon, de rendement et d'impayés, avec ou sans réinvestissement. Les valeurs de départ sont celles de votre propre portefeuille. C'est une calculette, pas une prévision.

*   **Liste Détaillée des Propriétés:**
    *   **Informations complètes:** Adresse, briques possédées, investissement, rendement, revenus mensuels nets, date de premier versement, date de remboursement estimée.
    *   **Identification visuelle:** Projets **remboursés**, **en cours de financement**, ou **à venir**.
    *   **Cartes cliquables:** Cliquez sur une propriété pour l'ouvrir directement sur Bricks.co.
    *   **Système de warnings:** Affichage des warnings avec badge coloré (rouge pour récents, orange pour anciens), détail des dates et descriptions.
    *   **Carnet de versements:** Chaque fiche dit ce que le projet a versé sur le dernier mois de l'état de compte — **Versé** (avec le montant), **Rien reçu**, **Pas encore**, ou **Soldé** pour un projet remboursé — suivi d'une marque par mois sur treize mois, pleine quand l'argent est tombé. C'est le rythme qui rend le rouge lisible : douze mois pleins suivis d'un blanc ne se lisent pas comme un silence d'un an. Rien ne s'affiche sans état de compte : une pastille posée sans relevé serait une accusation sans pièce au dossier.
    *   Un projet muet mais sans date de versement annoncée ni versement passé reste en **Pas encore** : rien ne prouve qu'un coupon était dû.

*   **Filtrage et Tri Avancés:**
    *   **Tri:** Par investissement, nombre de briques, rendement, revenus mensuels, nom, date de premier versement (croissant/décroissant).
    *   **Filtres par statut:** Toutes, actives uniquement, remboursées, en financement, à venir.
    *   **Recherche libre:** Par nom ou adresse.
    *   **Filtre par versement:** Versé, rien reçu, pas encore dû. Masqué tant que l'état de compte n'a pas été lu, et neutralisé s'il disparaît — un filtre mémorisé viderait sinon le registre sans laisser de quoi le rouvrir.
    *   **Filtres par warning:** Alerte du mois en cours, avec/sans alerte, en procédure, impayé ou retard, alerte sous 30 jours, alerte du mois d'avant.
    *   **Filtres actifs rappelés:** Chaque filtre en vigueur s'affiche en puce, avec une remise à zéro — un compteur amputé ne reste jamais inexpliqué.
    *   **Pagination:** 24 fiches par page.
    *   **Préférences sauvegardées:** Vos choix de tri et filtrage sont conservés dans le localStorage.

*   **Persistance des Données:**
    *   Les données et warnings chargés sont sauvegardés dans le Local Storage de votre navigateur.
    *   Rechargement automatique au démarrage pour une consultation rapide.
    *   La date de récupération est affichée, et signalée au-delà de deux semaines : un filtre « alerte ce mois-ci » à zéro peut simplement traduire des données périmées.
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

### Suivi officiel des projets

`projects.bricks.co` expose l'état qui fait foi, là où les warnings ci-dessus ne livrent
que du texte libre :

* `GET /api/projects/{id}/echeances-investors` — statut du projet (`defaulted`, `active`),
  détail des échéances (`unpaid`, `paid`, `regularized`), pénalités et étapes de procédure.
  Un `404 PAGE_NOT_AVAILABLE` signifie qu'aucun incident n'est ouvert : c'est une réponse
  utile, pas une erreur.
* `GET /api/project-activities/public/{id}?limit=3` — actualités du projet, bien plus
  circonstanciées que les alertes du portefeuille. Seules les trois dernières sont
  conservées, tronquées à 600 caractères : le flux complet sur 138 projets dépasserait
  la capacité du localStorage.
* `GET /api/projects/{id}/contentieux-investors` — `has_active_contentieux`, le stade le
  plus avancé d'une procédure. Il prime sur tout autre signal.

La récupération se fait en trois phases, chacune restreinte aux projets concernés : les
échéances pour tous, les actualités pour ceux qui ont un dossier de suivi, le contentieux
pour les seuls projets en défaut — il ne survient pas ailleurs.

Cet hôte est relayé sous `/projects-api`, avec le même traitement Cloudflare. Ces appels
**n'exigent aucune authentification** : seule la protection Cloudflare impose le proxy.

L'API n'offrant pas de vue d'ensemble, il faut une requête par projet détenu. Elles sont
donc lancées cinq à la fois, avec un compteur de progression, et le résultat est conservé
dans le localStorage : un simple rechargement de page ne relance pas la série. Le bouton
« Vérifier les statuts » la rejoue à la demande.

Le mode `npm run serve` (serveur Python statique) ne fournit pas ce proxy : le chargement
API n'y fonctionne pas, seules les données déjà en localStorage s'affichent.

## Tests

Les tests couvrent la logique métier (calculs financiers, fusion des données, filtres, tri,
persistance, client API) sans nécessiter de token ni de données personnelles.

Node 22 ou plus est requis (voir le champ `engines` de `package.json`).

```bash
npm install          # une seule fois
npm test             # ~400 tests unitaires (Vitest + jsdom)
npm run test:watch   # mode watch pendant le développement
npm run test:coverage
```

**Smoke test de bout en bout** (optionnel) : ouvre `index.html` dans un vrai Chromium avec un
jeu de données injecté dans le localStorage, et vérifie le rendu, les filtres, le tri, les
pastilles de versement et le non-exécution du HTML venant de l'API.

```bash
npx playwright install chromium   # une seule fois
npm run serve                     # dans un autre terminal (port 8099)
npm run test:e2e
```

Chaque poussée et chaque pull request déclenchent la CI (`.github/workflows/tests.yml`) :
tests unitaires sur la borne basse de `engines` et sur node 22 courant, plus un
`npm audit`. Une montée de dépendance exigeant un node plus récent échoue donc là,
et non sur la machine de quelqu'un après la fusion.

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
* Les scripts Chart.js sont chargés depuis un CDN avec une empreinte `integrity` :
  le navigateur refuse le script si son contenu change. À régénérer après toute
  montée de version, puis à reporter dans `index.html` :
  ```bash
  curl -sfL <url-du-script> | openssl dgst -sha384 -binary | openssl base64 -A
  ```
* `CONFIG.DEBUG` et `CONFIG.LOG_LEVEL` sont réglés pour la production : aux niveaux
  `debug` et `info`, les journaux recopient identifiants de projets et montants dans
  la console, et `DEBUG` expose `window.__appState__`.
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
│   ├── revenueHistory.js    # État de compte : revenus réellement versés
│   ├── versements.js        # Qui a versé ce mois-ci, qui s'est tu
│   ├── walletHistory.js     # Journal des mouvements : capital remboursé
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
│   ├── dataAge.js           # Âge des données affichées
│   ├── modals.js            # Modales et erreurs
│   ├── periodeGraphiques.js # Fenêtre temporelle commune aux courbes
│   ├── revenuAnnuel.js      # Tableau des revenus par année
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
