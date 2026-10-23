# La vitrine

L'analyseur ne montre que le portefeuille de celui qui le consulte. On ne peut donc pas en
donner un aperçu sans publier ses propres montants — ni décider de l'installer sans avoir
vu ce qu'il donne.

La **vitrine** répond aux deux : c'est l'application elle-même, servie par GitHub Pages sur
les 42 propriétés inventées de `npm run demo`.

<https://hermessnrj.github.io/bricks-analyser/>

## Ce n'est pas l'outil, et ça ne peut pas l'être

GitHub Pages ne sert que des fichiers. Les quatre relais de `nginx.conf` n'y existent pas,
et sans eux :

| Relais | Ce qu'il porte | Sans lui |
| --- | --- | --- |
| `/api/` | L'API Bricks, avec la session | Aucun chargement possible |
| `/projects-api/` | Le statut officiel des projets | Aucun statut, aucun impayé |
| `/vignette/` | Les photos, pour l'export | Le canvas se souille, l'export les perd |
| `/version-api` | La dernière version publiée | Remplacé, voir plus bas |

Ce n'est pas une limite qu'on pourrait lever côté navigateur. `api.bricks.co` ne renvoie
ses en-têtes CORS que pour `https://app.bricks.co`, et Cloudflare challenge en `403` tout
ce qui vient d'ailleurs ; `projects.bricks.co` n'émet aucun `Access-Control-Allow-Origin`
et pose un `Cross-Origin-Resource-Policy: same-origin`. Voir [Accès à l'API](api.md).

## La règle de découpe

**La vitrine garde tout ce qui lit les chiffres, et perd tout ce qui les charge, les
enregistre ou les emporte.**

`tools/vitrine.mjs` remplace donc la section « Charger vos données » par une phrase et un
lien. Disparaissent avec elle le favori de collecte, le champ de session, le dépôt de
fichier, la vérification des statuts, l'export et l'effacement des données locales.

Rien ne casse en partant : chaque gestionnaire de `src/events/` renonce de lui-même quand
son élément n'est pas là. Trois choses restent, et pour de bonnes raisons :

* `#uploadSection` — `src/ui/uiUpdater.js` la replie une fois les résultats à l'écran ;
* `#error` — c'est le seul endroit où `src/ui/modals.js` sait écrire ;
* le lien vers les sources, dans le pied de page — l'AGPL le demande à toute instance
  servie à distance, et une vitrine en est une.

## Deux transformations, et pas une de plus

**L'unique mode.** Un script non différé, inséré avant le module principal, pose `?demo`
dans l'adresse si elle ne l'a pas. `src/events/appInitializer.js` le lit ensuite comme il
lirait un lien tapé à la main. La barre d'adresse continue donc de dire ce qui est
affiché — ce qu'une redirection cachée ne ferait pas — et le fragment est reconduit, sinon
un lien vers une section du sommaire perdrait son ancre en chemin.

**Le point d'accès de version.** `/version-api` répondrait `404` sur Pages, et le pied de
page dirait « vérification impossible » à qui clique le numéro. `CONFIG.VERSION_ENDPOINT`
vise donc directement `api.github.com`, qui renvoie `Access-Control-Allow-Origin: *` et
n'exige aucune requête préalable — l'appel ne porte qu'un `Accept`, en-tête sur liste
blanche. Ce que le relais protégeait ne se perd pas : il existe pour tenir
`connect-src 'self'` sur la page qui manipule le cookie de session Bricks, et la vitrine
n'en manipule aucun.

Les deux échouent bruyamment si leur ancre a bougé dans la source. C'est délibéré : une
substitution muette publierait une vitrine amputée, et le défaut ne se verrait qu'en ligne.
`tests/vitrine.test.js` passe le vrai `index.html` et le vrai `config.js` à l'assembleur,
et ce sont ces deux vérifications-là qui échouent le jour où la page change sans que
l'assembleur suive.

## Ce que la vitrine n'écrit pas

`hermessnrj.github.io` est **une seule origine** pour tous les dépôts publiés du compte. Le
`localStorage` n'y est pas cloisonné par chemin : ce qu'un projet y laisse, un autre peut
le lire.

La découpe ci-dessus a donc une conséquence qui vaut d'être dite. `?demo` charge sans
persister — `finalizeProcessing` reçoit `persister: false` — et plus rien d'autre ne
charge. Aucun portefeuille ne peut être écrit dans le `localStorage` de cette origine,
puisque la vitrine n'a plus aucun moyen d'en obtenir un.

Seules y vivent les préférences d'affichage : thème, tri, filtres, taille de page.

## Publication

Sur un tag, comme l'image et la release. La vitrine montre alors la version que l'on peut
installer, et non un `main` en cours de route. Le job `Vitrine` de
`.github/workflows/publication.yml` attend `image`, donc le garde-fou qui vérifie que le
tag et le code annoncent la même version : une vitrine qui affiche un numéro faux vaut
moins que pas de vitrine du tout.

Et sur demande explicite, depuis l'onglet **Actions** du dépôt. Ce n'est pas une entorse à
la règle « rien ne se publie depuis une branche » : celle-ci vise ce qui s'installe, et une
vitrine ne s'installe pas. Sans cette porte, corriger une coquille en ligne — ou mettre la
vitrine en ligne la première fois — demanderait de sortir une version. Depuis une branche,
le pied de page annonce le numéro que le code déclare, pas celui de la dernière release.

Pour la regarder avant de publier, comme le dépôt lui-même :

```bash
npm run demo && npm run vitrine && npm run serve
```

puis <http://127.0.0.1:8099/vitrine/>. L'adresse est un sous-chemin, et c'est voulu : elle
vérifie au passage que tous les chemins de la page sont relatifs, comme ils doivent l'être
pour un site de projet.

## Le côté GitHub

Une seule chose à régler à la main, une fois : dans **Settings → Pages**, la source doit
être **GitHub Actions** et non une branche. Sans cela, `actions/deploy-pages` échoue.
