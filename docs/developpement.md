# Développement

## Pile technique

* **Frontend :** HTML5, CSS3, JavaScript ES6 (modules natifs, sans bundler)
* **Visualisation :** Chart.js 3.9.1 avec le plugin chartjs-chart-treemap 2.3.0
* **Stockage :** localStorage
* **Serveur :** nginx (via Docker)
* **Tests :** Vitest + jsdom (unitaires), Playwright (smoke test)

Node 22.12 ou plus est requis (voir le champ `engines` de `package.json`). La borne n'est
pas ronde parce qu'elle vient de deux besoins précis : Vitest 4 s'appuie sur Rolldown, dont
npm refuse d'installer le binaire natif en deçà, et jsdom 30 charge un module ESM depuis du
CommonJS — ce que `require()` ne sait faire que depuis 22.12.

## Données locales

`data/` accueille les exports Bricks récupérés à la main et le portefeuille de
démonstration. Le dossier n'est pas suivi par git — `.gitignore` écarte tout `.json` hors
`package.json` — et il n'entre pas dans l'image Docker, qui ne copie que `index.html`,
`src/`, `favicon.png` et `nginx.conf`.

```bash
npm run demo    # écrit data/demo.json : 42 propriétés inventées, 26 mois d'historique
```

Ce jeu fictif sert aux captures d'écran ; il est fabriqué au format brut de l'API puis
passé par les vrais normaliseurs, donc il reste juste si ceux-ci changent. Voir
[docs/captures](captures/README.md).

## Tests

Les tests couvrent la logique métier — calculs financiers, fusion des données, filtres,
tri, persistance, client API — sans nécessiter de session ni de données personnelles.

```bash
npm install          # une seule fois
npm test             # ~500 tests unitaires (Vitest + jsdom)
npm run test:watch   # mode watch pendant le développement
npm run test:coverage
```

**Smoke test de bout en bout** : ouvre `index.html` dans un vrai Chromium avec un jeu de
données injecté dans le localStorage, et vérifie le rendu, les filtres, le tri, les
pastilles de versement et la non-exécution du HTML venant de l'API.

```bash
npx playwright install chromium   # une seule fois
npm run serve                     # dans un autre terminal (port 8099)
npm run test:e2e
```

Variables d'environnement du smoke test : `BASE_URL` (défaut `http://127.0.0.1:8099`),
`CHROMIUM_PATH` (Chromium déjà installé sur la machine), `SCREENSHOT` (chemin de capture).

Chaque poussée et chaque pull request déclenchent la CI (`.github/workflows/tests.yml`) :
tests unitaires sur la borne basse de `engines` et sur node 22 courant, smoke test dans un
Chromium, et `npm audit`. Une montée de dépendance exigeant un node plus récent échoue donc
là, et non sur la machine de quelqu'un après la fusion. Quand le smoke test échoue en CI,
la capture de la page au moment de l'échec est publiée en artefact du job.

**Ce qui n'est pas couvert par les tests unitaires :** les gestionnaires d'événements du
DOM (`src/events/`), les modales et la configuration Chart.js (`src/charts/`). C'est le
smoke test qui les tient — d'où sa présence en CI et non plus en option.

## Architecture

Architecture modulaire ES6 avec séparation des responsabilités.

```
src/
├── business/         # Logique métier
│   ├── apports.js           # Ce qui vient de votre poche, et non de Bricks
│   ├── calculations.js      # Calculs financiers et statistiques
│   ├── dataProcessor.js     # Fusion et traitement des données
│   ├── fiscalite.js         # Ce que Bricks n'a pas prélevé, et qu'il faudra payer
│   ├── forecast.js          # Simulateur
│   ├── processor.js         # Orchestration du traitement
│   ├── rendement.js         # Rendement constaté, annualisé par fenêtre
│   ├── revenueHistory.js    # État de compte : revenus réellement versés
│   ├── riskAnalysis.js      # Niveaux de risque par propriété
│   ├── versements.js        # Qui a versé ce mois-ci, qui s'est tu
│   └── walletHistory.js     # Journal des mouvements : capital remboursé
├── charts/           # Gestion des graphiques
│   ├── arrieresChart.js     # Coupons manqués et pénalités, cumulés
│   ├── chartManager.js      # Gestionnaire principal
│   ├── distributionChart.js # Donut de répartition
│   ├── forecastChart.js     # Projection du simulateur
│   ├── investmentChart.js   # Évolution de l'investissement
│   ├── origineFondsChart.js # Versements, parrainage et solde boosté
│   ├── revenueChart.js      # Revenus perçus et attendus
│   ├── taxChart.js          # Impôt prélevé
│   └── treemapChart.js      # Portefeuille en surface
├── core/
│   ├── config.js            # Configuration globale, barème d'imposition
│   └── state.js             # État centralisé
├── data/
│   ├── apiClient.js         # Appels à api.bricks.co
│   ├── fileParser.js        # Lecture d'un export local
│   ├── projectStatusClient.js # Suivi officiel (projects.bricks.co)
│   └── storage.js           # localStorage
├── events/           # Gestionnaires d'événements
├── ui/               # Rendu de l'interface
├── utils/            # Formatage, dates, échappement, journalisation
└── styles/main.css

tests/                # Tests unitaires (Vitest)
└── e2e/smoke.mjs     # Smoke test navigateur (Playwright)
```
