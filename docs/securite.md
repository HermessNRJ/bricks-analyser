# Sécurité

## Le cookie de session

Ce cookie donne un **accès complet au compte Bricks** : solde, IBAN, état civil. Le traiter
comme un mot de passe — ne jamais le committer, ni le coller dans un ticket ou un export
HAR partagé.

L'application ne le persiste jamais : il est effacé du champ de saisie après usage, et
n'est écrit ni dans le localStorage ni dans les logs.

Le proxy `/api/` ne transporte que la session fournie par l'appelant : il ne détient aucun
identifiant. Exposer le port 8080 hors de la machine reste toutefois déconseillé.

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

## Journalisation

`CONFIG.DEBUG` et `CONFIG.LOG_LEVEL` sont réglés pour la production. Aux niveaux `debug` et
`info`, les journaux recopient identifiants de projets et montants dans la console, et
`DEBUG` expose `window.__appState__` — soit tout le portefeuille.
