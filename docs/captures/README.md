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

Le tableau de bord est centré et sa largeur plafonnée : au-delà de 1360 px, la capture
gagne des marges vides qui écrasent le contenu une fois l'image réduite à la largeur du
README. Recadrez-les, par exemple avec `sips --cropOffset 0 <gauche> -c <hauteur>
<largeur> fichier.png`.

Une capture d'écran sort deux à trois fois plus lourde qu'elle n'a besoin de l'être.
Compressez-la avant de la committer — c'est sans perte, l'image reste pixel pour pixel la
même, et elle restera dans l'historique pour toujours :

```bash
oxipng -o max --zopfli --strip safe docs/captures/*.png
```

| Fichier | Cadrage | Où l'insérer |
| --- | --- | --- |
| `vue-ensemble.png` | Du titre jusqu'au bas des tuiles de suivi des incidents — le mur, les huit chiffres clés, la bande de rendement, la répartition du risque | En tête du **README**, juste au-dessus de « Démarrer » |
| `rendement.png` | La seule bande « Rendement annualisé », des cinq fenêtres à la note. Environ 1 130 × 220 px | [revenus.md](../revenus.md#rendement-annualisé) |
| `registre.png` | La section « Registre des propriétés » : le titre, le bilan des versements, la barre de filtres, le compteur, puis **deux rangées de fiches** — pas plus, les 24 de la page feraient 5 900 px de haut. Compter environ 1 150 × 1 800 px | **README**, section « Ce que ça montre » — et [revenus.md](../revenus.md#carnet-de-versements) |
| `revenus.png` | Le graphique « Évolution des revenus nets », les deux courbes et la note d'écart en dessous | [revenus.md](../revenus.md#attendu-et-perçu) |
| `revenus-annuels.png` | Le tableau des revenus par année, avec les colonnes brutes et le capital remboursé | [revenus.md](../revenus.md#revenus-par-année) |
| `origine-fonds.png` | Le graphique « D'où vient l'argent », sa légende et sa note. Environ 560 × 550 px | [revenus.md](../revenus.md#doù-vient-largent) |
| `periode.png` | Le sélecteur de période et les trois courbes datées en dessous | [revenus.md](../revenus.md#période-des-courbes) |
| `simulateur.png` | Le formulaire d'hypothèses et sa courbe | [revenus.md](../revenus.md#simulateur) |

Pour le registre, laissez les filtres sur « Tous » et le tri par défaut : les six premières
fiches donnent cinq **Versé** et un **Rien reçu**, ce qui est exactement ce que la
fonctionnalité montre — la plupart paient, un ne paie pas. Régler le filtre **Versement**
sur « Rien reçu » donnerait une grille entièrement rouge, plus spectaculaire mais moins
juste.

## 3. Insérer une image

Depuis le README, à la racine, le chemin passe par `docs/` :

```markdown
![Le registre des propriétés, avec le carnet de versements de chacune](docs/captures/registre.png)
```

Depuis un document de `docs/`, par exemple `revenus.md`, le chemin est relatif à ce
dossier :

```markdown
![Le registre des propriétés, avec le carnet de versements de chacune](captures/registre.png)
```

Le texte alternatif décrit ce que l'image montre : il est lu à voix haute par les lecteurs
d'écran, et s'affiche si l'image ne charge pas.
