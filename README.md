# Analyseur d'Investissements Bricks.co

## Description

Cet outil est un tableau de bord permettant d'analyser et de visualiser vos données d'investissement immobilier provenant de la plateforme Bricks.co. Il offre une vue d'ensemble de vos actifs, revenus, projections futures et plus encore, en important des données via un fichier JSON ou directement depuis l'API Bricks.co.

## Fonctionnalités Principales

*   **Importation de Données Flexibles:**
    *   Chargez vos données via un fichier JSON exporté depuis Bricks.co.
    *   Récupérez vos données en temps réel en utilisant l'API Bricks.co avec un Bearer Token (pour les projets financés, en cours de financement et à venir).
*   **Tableau de Bord Complet:**
    *   **Statistiques Clés:** Investissement total, revenus mensuels nets espérés, nombre total de briques (actives), nombre de propriétés (actives), projets remboursés, projets en cours de financement/à venir.
    *   **Cumulatifs:** Total des revenus nets perçus et total des impôts (flat tax 30%) estimés depuis le début.
*   **Visualisations Graphiques:**
    *   **Évolution de l'Investissement:** Suivez la croissance de votre investissement total au fil du temps.
    *   **Répartition par Propriété:** Visualisez la distribution de votre investissement entre les différentes propriétés (graphique en donut).
    *   **Évolution des Revenus Mensuels Nets:** Observez la progression de vos revenus nets mensuels attendus.
    *   **Montant de l'Impôt Mensuel:** Suivez l'estimation de la flat tax (30%) sur vos revenus bruts mensuels.
*   **Projections de Revenus:**
    *   Affiche les revenus mensuels nets estimés pour le mois en cours et les trois prochains mois (M+1, M+2, M+3).
*   **Liste Détaillée des Propriétés:**
    *   Consultez toutes vos propriétés avec leurs détails (adresse, briques possédées, investissement, rendement, revenus mensuels nets).
    *   Identification visuelle des projets **remboursés**, **en cours de financement**, ou **à venir**.
*   **Persistance des Données:**
    *   Les données chargées sont sauvegardées dans le Local Storage de votre navigateur, vous permettant de reprendre votre analyse lors de visites ultérieures.
    *   Logique de fusion intelligente lors de nouveaux imports (fichier ou API) pour mettre à jour les données existantes, ajouter les nouveautés, et proposer la suppression des éléments disparus.
*   **Utilitaires:**
    *   Bouton "Scroll to Top" pour une navigation aisée.
    *   Bouton "Effacer les Données Locales" pour réinitialiser le tableau de bord (avec confirmation).

## Comment Utiliser

Il y a plusieurs façons de lancer cette application :

**1. Directement dans le Navigateur (le plus simple pour les fichiers JSON):**

*   Téléchargez le fichier `index.html`.
*   Ouvrez ce fichier directement avec votre navigateur web préféré (Chrome, Firefox, Edge, Safari). Vous pouvez généralement double-cliquer sur le fichier.
*   Utilisez la section "Importez votre fichier de données" pour charger votre JSON Bricks.
*   **Note pour l'API :** L'utilisation de la fonctionnalité API depuis une URL `file:///` peut être bloquée par les politiques de sécurité CORS de votre navigateur. Pour tester l'API, préférez une des méthodes ci-dessous.

**2. Via Docker (Recommandé pour une utilisation complète, y compris API):**

L'application est configurée pour être servie par `nginx` via Docker.
*   Assurez-vous d'avoir Docker et Docker Compose installés.
*   Clonez ce dépôt (si applicable) ou assurez-vous que les fichiers `index.html`, `docker-compose.yml`, et `nginx.conf` sont dans le même répertoire.
*   Ouvrez un terminal dans ce répertoire et exécutez :
    ```bash
    docker-compose up -d
    ```
*   L'application sera accessible à l'adresse `http://localhost:8088` (ou le port que vous avez configuré).

**3. Utilisation de l'API Bricks.co:**

*   Dans la section "Alternative: Charger via API":
    *   Entrez votre Bearer Token personnel (obtenu depuis votre compte Bricks.co ou via leurs outils de développement).
    *   Cliquez sur "Charger les données API".
*   L'application contactera les endpoints suivants :
    *   `https://api.bricks.co/projects/financed` (pour vos projets financés)
    *   `https://api.bricks.co/projects` (pour les projets en cours de financement ou à venir où vous détenez des parts)
*   Les données récupérées seront ensuite traitées et affichées.

## Format des Données (JSON)

L'application s'attend à un format JSON similaire à celui exporté par Bricks.co, contenant un tableau d'objets mensuels, chacun avec une liste de projets et leurs détails (ID, nom, `ownedBricks`, `brickPrice`, `yearlyTotalRentabilityPercentage`, `funding.revenueStartDate`, etc.).

## Licence

Ce projet n'a pas de licence définie pour l'instant. Vous pouvez en ajouter une si vous le souhaitez (par exemple, MIT License).
