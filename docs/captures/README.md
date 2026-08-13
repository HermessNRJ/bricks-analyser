# Captures d'écran

Les images référencées par le README et les autres documents vivent ici.

**Ne jamais y déposer une capture de son propre portefeuille.** Adresses, montants,
impayés : tout y figure en clair, et une image committée reste dans l'historique même
après suppression. Un jeu de données fictif est fourni pour cela.

## 1. Charger le portefeuille de démonstration

```bash
npm run demo       # écrit data/demo.json — 42 propriétés inventées, 26 mois d'historique
npm run serve      # sert le dépôt sur http://127.0.0.1:8099
```

Ouvrez <http://127.0.0.1:8099/index.html>, puis dans la console du navigateur :

```js
fetch('/data/demo.json').then(r => r.json()).then(d => {
  localStorage.setItem('bricksInvestmentData', JSON.stringify(d));
  location.reload();
});
```

Le portefeuille est tiré d'une graine fixe : deux exécutions le même mois donnent le même
résultat. L'historique se cale en revanche sur le mois courant, pour que les courbes et le
carnet de versements aient l'air d'aujourd'hui.

Les vignettes pointent vers `picsum.photos` : elles demandent un accès réseau, et n'ont
d'autre rôle que de remplir les fiches sur les captures.

Quand vous avez fini : `localStorage.clear()` dans la console, et le tableau de bord
redevient vierge.

## 2. Les captures à prendre

Fenêtre à **1360 px de large**, en clair. Les trois premières sont les plus utiles ; les
autres viennent en complément si vous voulez étoffer la documentation.

| Fichier | Cadrage | Où l'insérer |
| --- | --- | --- |
| `vue-ensemble.png` | Du titre jusqu'au bas des tuiles de suivi des incidents — le mur, les huit chiffres clés, la répartition du risque | En tête du **README**, juste au-dessus de « Démarrer » |
| `registre.png` | Le registre : bilan des versements, barre de filtres, deux rangées de fiches avec leurs pastilles et leurs carnets | **README**, section « Ce que ça montre » — et [revenus.md](../revenus.md#carnet-de-versements) |
| `revenus.png` | Le graphique « Évolution des revenus nets », les deux courbes et la note d'écart en dessous | [revenus.md](../revenus.md#attendu-et-perçu) |
| `revenus-annuels.png` | Le tableau des revenus par année, avec les colonnes brutes et le capital rendu | [revenus.md](../revenus.md#revenus-par-année) |
| `periode.png` | Le sélecteur de période et les trois courbes datées en dessous | [revenus.md](../revenus.md#période-des-courbes) |
| `simulateur.png` | Le formulaire d'hypothèses et sa courbe | [revenus.md](../revenus.md#simulateur) |

Pour le registre, réglez le filtre **Versement** sur « Rien reçu » avant la capture si vous
voulez montrer ce que la fonctionnalité sert à trouver ; sinon laissez « Tous », qui donne
un mélange plus représentatif de pastilles.

## 3. Insérer une image

Dans le README, les lignes sont déjà écrites en commentaire dans la section « Captures
d'écran » : il suffit de les décommenter. Le chemin y est `docs/captures/registre.png`.

Depuis un document de `docs/`, par exemple `revenus.md`, le chemin est relatif à ce
dossier :

```markdown
![Le registre des propriétés, avec le carnet de versements de chacune](captures/registre.png)
```

Le texte alternatif décrit ce que l'image montre : il est lu à voix haute par les lecteurs
d'écran, et s'affiche si l'image ne charge pas.
