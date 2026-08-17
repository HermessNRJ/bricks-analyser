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

## Système visuel

`src/styles/main.css` s'ouvre sur deux blocs de jetons : `:root` pour le thème clair, et
un `@media (prefers-color-scheme: dark)` qui redéfinit les mêmes noms. Tout ce qui suit
vaut pour les deux — aucune règle de mise en page n'est dupliquée. Le thème suit le
réglage du système, sans bascule dans l'interface.

Chart.js dessine dans un canevas et n'accepte donc pas de variable CSS : `src/charts/
theme.js` résout les jetons au moment du tracé (`couleur('--statut-actif')`) et redessine
tout quand le système bascule. Une couleur de graphique écrite en dur ne suivrait pas le
thème — c'est le seul endroit du code où une couleur peut apparaître, sous forme de valeur
de repli pour les tests, qui tournent sans mise en page.

## Données locales

`data/` accueille les exports Bricks récupérés à la main et le portefeuille de
démonstration. Le dossier n'est pas suivi par git — `.gitignore` écarte tout `.json` hors
`package.json` — et il n'entre pas dans l'image Docker, qui ne copie que `index.html`,
`src/`, `favicon.png` et `nginx.conf`.

```bash
npm run demo    # écrit data/demo.json : 42 propriétés inventées, 26 mois d'historique
npm run serve   # puis http://127.0.0.1:8099/index.html?demo
```

`?demo` affiche ce portefeuille sans rien écrire dans le localStorage : le vôtre n'est pas
touché, et la page y revient dès que le paramètre disparaît. Un bandeau dit à l'écran que
les chiffres sont inventés.

**Sur le port 8099, pas sur 8080.** `data/` reste sur la machine et n'entre pas dans l'image
Docker — c'est délibéré, elle n'a pas à emporter vos exports Bricks, et un jeu de
démonstration figé au jour de la construction vieillirait à chaque mois qui passe. Derrière
Docker, `?demo` répond donc par un message qui le dit, et le portefeuille enregistré reste
affiché.

Ce jeu fictif sert aux captures d'écran ; il est fabriqué au format brut de l'API puis
passé par les vrais normaliseurs, donc il reste juste si ceux-ci changent. Voir
[docs/captures](captures/README.md).

## Le favori de collecte

`src/collecte/extracteur.js` ne tourne pas dans l'application : `src/ui/favori.js` l'emballe
en URL `javascript:` et le rend sous forme de lien à glisser dans la barre de favoris, d'où
il s'exécutera **dans la page `app.bricks.co`**.

Toute la raison d'être du procédé tient en une ligne : `credentials: 'include'`. Le cookie
de session est `HttpOnly`, donc illisible par un script — mais depuis une origine `bricks.co`
le navigateur le joint tout seul. Il n'y a rien à extraire, rien à coller, rien à confier.

Deux règles y sont tenues par des tests plutôt que par la discipline :

* **L'extracteur ne calcule rien.** Il appelle, il ramasse, il écrit du JSON brut. La
  normalisation vit dans `src/business/`, en un seul exemplaire — `traiterCollecte()`
  (`src/business/collecte.js`) est le point de passage commun aux deux chemins d'entrée, le
  fichier et l'appel direct. Une seconde copie dans le favori dériverait en silence, et
  personne ne s'en apercevrait avant de lire un chiffre faux.
* **Le favori ne joint que Bricks.** `tests/favori.test.js` extrait tous les hôtes de la
  source dégraissée et exige exactement `api.bricks.co` ; le smoke test refait la même
  vérification sur le lien réellement construit par la page.

`tests/extracteur.test.js` exécute la source **sans la modifier** : `new Function` reçoit
`location`, `document`, `fetch` et le reste en paramètres, si bien que le code éprouvé est
celui qui part dans la barre de favoris — garde-fou de domaine compris. Le test va jusqu'au
bout de l'aller-retour : l'enveloppe écrite par l'extracteur est repassée à
`validerEnveloppe()` puis à `traiterCollecte()`.

Le dégraissage mérite un mot. `degraisser()` ne retire que les lignes qui sont *entièrement*
du commentaire, jamais ce qui suit un `//` en milieu de ligne : un retrait naïf couperait
`'https://api.bricks.co'` en deux, et le favori mourrait sans bruit chez l'utilisateur.

### Ce que le favori ne couvre pas

Les statuts officiels. `projects.bricks.co` n'émet aucun en-tête
`Access-Control-Allow-Origin` et pose un `Cross-Origin-Resource-Policy: same-origin` — les
valeurs par défaut de Helmet, le CORS n'y est simplement pas activé. Aucune page d'une autre
origine ne peut lire ses réponses, `app.bricks.co` comprise, et `frame-ancestors 'self'`
ferme aussi la voie de l'iframe.

Ils continuent donc de passer par `location /projects-api/`. Ce proxy-là ne porte **aucun**
identifiant et n'en a pas besoin : l'API de suivi répond sans authentification.

Ce qui décide de son passage est le **User-Agent**, que nginx relaie tel quel depuis le
navigateur. C'est reproductible dans les deux sens, l'image tournant :

```bash
curl -s -H "User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36" \
  "http://127.0.0.1:8080/projects-api/api/projects/x/echeances-investors"
# {"error":"Projet non trouvé","code":"PROJECT_NOT_FOUND",…}
```

Le même appel sans en-tête `User-Agent` reçoit une page de challenge Cloudflare. En usage
réel la requête part du navigateur, donc le cas qui compte est le premier — mais qui teste
le proxy en ligne de commande sans y penser conclura à une panne qui n'existe pas.

## Linter

```bash
npm run lint         # ESLint sur src/, tests/ et tools/
npm run lint:fix     # corrige ce qui se corrige tout seul
```

Le projet n'a pas de bundler : rien ne relit le code avant que le navigateur ne l'exécute.
Un import mort ou une variable oubliée ne se voyait donc qu'à l'ouverture de la page, et
seulement si le chemin fautif était emprunté.

La configuration (`eslint.config.js`) ne norme pas le style : indentation, guillemets et
points-virgules restent l'affaire de l'auteur. Les règles ajoutées à `recommended` ne visent
que ce qui est faux ou mort — `no-unused-vars`, `no-var`, `prefer-const`, `eqeqeq`,
`require-atomic-updates` — plus `no-console`, le module `logger` étant la seule sortie
prévue. Deux exceptions sont marquées dans le code, chacune avec sa raison.

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
tests unitaires sur la borne basse de `engines` et sur node 22 courant, linter, smoke test
dans un Chromium, et `npm audit`. Une montée de dépendance exigeant un node plus récent
échoue donc là, et non sur la machine de quelqu'un après la fusion. Quand le smoke test
échoue en CI, la capture de la page au moment de l'échec est publiée en artefact du job.

**Ce qui n'est pas couvert par les tests unitaires :** les gestionnaires d'événements du
DOM (`src/events/`), les modales et la configuration Chart.js (`src/charts/`). C'est le
smoke test qui les tient — d'où sa présence en CI et non plus en option.

## Image de prévisualisation sociale

Celle que GitHub affiche quand le lien est partagé — 1280 × 640, rendue en 2× pour rester
nette là où les réseaux l'agrandissent.

```bash
npm run demo && npm run apercu   # écrit docs/apercu-social.png
```

Elle n'est pas dessinée à part : `tools/apercu-social.mjs` compose une page avec
`src/styles/main.css` et la photographie dans Chromium. Les couleurs, la sérif du titre et
la chasse fixe des montants sont donc celles de l'écran, et une refonte du système visuel
se répercute en régénérant. Les proportions du mur et les trois projets en défaut viennent
du portefeuille de démonstration, jamais du vôtre.

Elle se téléverse à la main : dépôt → **Settings** → **Social preview**. GitHub ne la lit
pas depuis le dépôt.

## Publier une version

Les versions suivent [SemVer](https://semver.org) : `MAJEUR.MINEUR.CORRECTIF`. Ici, ce qui
compte pour la personne qui met à jour — un chiffre affiché qui change de sens, une donnée
locale à recharger, une borne Node qui monte — relève du majeur ; une fonctionnalité, du
mineur ; une correction, du correctif.

Le tag est la source de vérité, et il déclenche tout :

```bash
git tag -a v1.1.0 -m "Thème sombre, chargement de la démo par ?demo"
git push origin v1.1.0
```

`.github/workflows/publication.yml` construit alors l'image pour `linux/amd64` et
`linux/arm64`, la pousse sur GHCR sous quatre tags — `1.1.0`, `1.1`, `1` et `latest` — puis
crée la release avec les notes générées depuis les commits. Rien ne se publie depuis une
branche : une version publiée correspond toujours à un point nommé de l'historique.

Le champ `version` de `package.json` n'entre pas dans ce circuit — le paquet n'est pas
publié sur npm (`"private": true`). Le tenir à jour avant de poser le tag reste une
politesse pour qui lit le dépôt.

Les pull requests qui touchent au `Dockerfile`, à `nginx.conf`, à `index.html` ou à `src/`
construisent l'image **sans la pousser**, puis la démarrent et vérifient que nginx sert bien
la page et la feuille de style. Une base épinglée retirée du registre, ou un chemin de
`COPY` cassé, se voient donc avant la fusion.

## Architecture

Architecture modulaire ES6 avec séparation des responsabilités.

```
src/
├── business/         # Logique métier
│   ├── apports.js           # Ce qui vient de votre poche, et non de Bricks
│   ├── calculations.js      # Calculs financiers et statistiques
│   ├── collecte.js          # Brut → normalisé → écran, commun aux deux entrées
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
├── collecte/
│   └── extracteur.js        # Tourne sur app.bricks.co, pas ici (voir plus haut)
├── core/
│   ├── config.js            # Configuration globale, barème d'imposition
│   └── state.js             # État centralisé
├── data/
│   ├── apiClient.js         # Appels à api.bricks.co
│   ├── fileParser.js        # Lecture d'un export local
│   ├── projectStatusClient.js # Suivi officiel (projects.bricks.co)
│   └── storage.js           # localStorage
├── events/           # Gestionnaires d'événements
├── ui/
│   ├── favori.js            # Emballe l'extracteur en lien à glisser
│   ├── uiUpdater.js         # Point d'entrée du rendu, mur, bilan, projections
│   ├── tuiles.js            # Chiffres clés, rendement annualisé, incidents
│   ├── registre.js          # État de la liste : tri, filtres, pages
│   ├── fiche.js             # Le HTML d'une carte de propriété
│   ├── alertes.js           # Fraîcheur des alertes, partagée liste/fiche
│   ├── libelles.js          # Pluriels et mois en incise
│   ├── revenuAnnuel.js      # Tableau des revenus par année
│   ├── periodeGraphiques.js # Fenêtre commune aux graphiques datés
│   ├── dataAge.js           # Âge des données affichées
│   └── modals.js            # Modale de suppression, bandeau d'erreur
├── utils/            # Formatage, dates, échappement, journalisation
└── styles/main.css

tests/                # Tests unitaires (Vitest)
└── e2e/smoke.mjs     # Smoke test navigateur (Playwright)
```
