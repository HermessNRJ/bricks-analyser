# Accès à l'API

## Pourquoi un proxy

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

Le mode `npm run serve` (serveur Python statique) ne fournit pas ce proxy : le chargement
API n'y fonctionne pas, seules les données déjà en localStorage s'affichent.

## Endpoints utilisés

Relayés sous `/api`, avec la session :

| Endpoint | Ce qu'il apporte |
| --- | --- |
| `GET /projects/financed` | Projets financés |
| `GET /projects` | Projets ongoing/upcoming où vous détenez des parts |
| `GET /investor/portfolio/properties/highlighted-updates` | Warnings du portefeuille |
| `GET /investor/portfolio/revenue` | État de compte : revenus réellement versés |
| `GET /wallet-transactions` | Journal des mouvements, paginé, qui nomme chaque versement |

L'état de compte ventile chaque mois **par projet** (`obligationCoupons.byProperty`). Cette
ventilation est conservée telle quelle — une quarantaine de kilo-octets pour trois ans et
deux cents projets — et c'est elle qui dit, propriété par propriété, ce qui est tombé et ce
qui manque. Voir [le carnet de versements](revenus.md#carnet-de-versements).

Le journal des mouvements est le seul endroit où un remboursement de capital se distingue
d'un coupon, et le seul où l'argent venu de votre banque se distingue d'un gain — les
rechargements y portent une nature en `topup_*`, les retraits un `withdraw`, `payout` ou
`cash_out`. Ce vocabulaire n'est pas documenté par Bricks : les natures rencontrées sont
donc journalisées à chaque lecture, pour qu'un moyen de paiement inconnu se voie dans la
console plutôt que de disparaître silencieusement des apports. Le journal est paginé cent
lignes à la fois, en curseur.

Le curseur n'est pas documenté non plus, et rien ne garantit qu'il désigne exactement la
ligne suivante. Les identifiants déjà vus sont donc retenus : un lot qui recouvre le
précédent ne recompte pas ses lignes, et un lot entièrement déjà vu arrête la pagination au
lieu de relire les mêmes cent lignes jusqu'au garde-fou. Les doublons écartés sont
journalisés.

### Deux sources pour le capital rendu

Le journal nomme chaque remboursement ; l'état de compte le laisse deviner, par le
prélèvement qui manque sur la ligne de coupons. Les deux devraient s'accorder, et un contrôle
les confronte année par année à chaque calcul — au niveau `warn` quand le journal en annonce
plus du double. Voir [le numérateur du rendement](revenus.md#le-numérateur).

Pour lire le détail, il faut relever le niveau de journalisation, coupé à `warn` par défaut
parce que `info` recopie les montants et les identifiants de projets dans la console :

```js
localStorage.setItem('bricksLogLevel', 'info'); location.reload();
// puis, une fois le diagnostic fait
localStorage.removeItem('bricksLogLevel');
```

## Suivi officiel des projets

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
