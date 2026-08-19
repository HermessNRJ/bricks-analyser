# Sécurité

## Le cookie de session

Ce cookie donne un **accès complet au compte Bricks** : solde, IBAN, état civil. Le traiter
comme un mot de passe — ne jamais le committer, ni le coller dans un ticket ou un export
HAR partagé.

### La voie qui ne le manipule pas

Le favori de collecte a été fait pour n'avoir jamais à le toucher. Le cookie est `HttpOnly`,
donc illisible par un script — mais depuis une page de `bricks.co`, le navigateur le joint
lui-même à chaque requête. Le favori s'exécute là-bas et n'a rien à extraire : la session ne
quitte pas l'onglet qui la détenait, et l'analyseur ne la voit à aucun moment.

Ce qui traverse est alors un fichier de données : le portefeuille en clair, qui ne donne
accès à rien et qui s'efface. Le compromis a changé de nature — d'une clé confiée à un
tiers, on passe à une copie de ce que la clé ouvrait.

Deux propriétés du favori sont tenues par des tests, parce que la promesse ne vaut que si
elles le restent : sa source ne contient jamais `document.cookie`, et elle ne joint aucun
hôte en dehors de `api.bricks.co`. Le smoke test refait la vérification sur le lien
réellement construit par la page, emballage compris.

Le code installé vient de `src/collecte/extracteur.js`, lu sur votre machine au moment où
vous posez le lien. Il ne se recharge pas à l'exécution : un favori posé aujourd'hui
contient le code de la version que vous faites tourner, et ne changera pas sous vos pieds.
C'est la différence qui compte avec un chargeur distant — un favori qui va chercher son
script sur un serveur à chaque clic donne à ce serveur un accès complet au compte, en
permanence, sans version à épingler et sans relecture possible.

### La voie qui le manipule

Coller le cookie reste soutenu, et le restera : c'est le chargement en une fois, sans
fichier intermédiaire, et le repli quand l'API change de forme avant qu'un favori ancien
n'ait été reposé.

Sur ce chemin, l'application ne persiste jamais le cookie : il est effacé du champ de
saisie après usage, et n'est écrit ni dans le localStorage ni dans les logs. Le proxy
`/api/` ne transporte que la session fournie par l'appelant et ne détient aucun
identifiant.

Les deux voies ne demandent pas la même confiance, et c'est le seul point à retenir pour
choisir : le favori ne fait passer que des données, celle-ci fait passer la clé.

Le proxy `/projects-api/`, lui, ne porte **aucun** identifiant : l'API de suivi de projet
répond sans authentification. Il n'existe que parce qu'elle n'active pas le CORS et que
Cloudflare la garde.

Exposer le port 8080 hors de la machine reste déconseillé dans tous les cas.

## Le seul appel que l'application passe d'elle-même

Le proxy `/version-api` demande à GitHub la dernière version publiée, au plus une fois par
jour, pour signaler en pied de page qu'une version plus récente existe.

Ce qui part : l'URL fixe de la release, sans paramètre. Rien du portefeuille — l'appel n'a
accès à aucune donnée et n'en transporte aucune, et le proxy ne relaie ni cookie, ni
`Origin`, ni `Referer`, ni le `User-Agent` du navigateur, remplacé par une chaîne fixe.

Ce que GitHub apprend : l'adresse IP d'où l'outil tourne, une fois par jour, et le fait
qu'il tourne. C'est peu, mais ce n'est pas rien, et c'est le seul endroit où l'application
s'adresse à quelqu'un d'autre que Bricks sans qu'on le lui demande. Qui n'en veut pas peut
retirer la `location` de `nginx.conf` : l'appel échoue alors en silence et le pied de page
continue d'afficher la version qui tourne.

Pourquoi un proxy plutôt qu'un appel direct : `api.github.com` renvoie pourtant
`Access-Control-Allow-Origin: *`, le CORS ne l'impose donc pas. C'est la CSP. Élargir
`connect-src` à `api.github.com` ouvrirait un canal sortant sur la page même où le cookie
de session est saisi ; le relais permet de garder `connect-src 'self'`.

Ce qui revient ne fait qu'un aller-retour très court dans le code : seul `tag_name` est lu,
et il est rejeté s'il ne ressemble pas à un numéro de version. Le lien affiché est écrit en
dur — aucune URL reçue du réseau ne devient un lien cliquable.

## Rendu et injection

* Toutes les données provenant de l'API sont échappées avant injection dans le DOM
  (`src/utils/html.js`), et les URLs de miniatures sont restreintes à `http(s)`.
* `nginx.conf` envoie une `Content-Security-Policy` qui limite les scripts au domaine
  de l'application et aux deux CDN de Chart.js.

## Dépendances externes

Les scripts Chart.js sont chargés depuis un CDN avec une empreinte `integrity` : le
navigateur refuse le script si son contenu change. À régénérer après toute montée de
version, puis à reporter dans `index.html` :

```bash
curl -sfL <url-du-script> | openssl dgst -sha384 -binary | openssl base64 -A
```

L'image de base du `Dockerfile` est épinglée de la même façon, à son digest et non au tag
flottant `nginx:alpine` : c'est elle qui sert la page où le cookie de session est saisi.
Pour monter de version :

```bash
docker image inspect nginx:<version>-alpine --format '{{index .RepoDigests 0}}'
```

## Journalisation

`CONFIG.DEBUG` et `CONFIG.LOG_LEVEL` sont réglés pour la production. Aux niveaux `debug` et
`info`, les journaux recopient identifiants de projets et montants dans la console, et
`DEBUG` expose `window.__appState__` — soit tout le portefeuille.
