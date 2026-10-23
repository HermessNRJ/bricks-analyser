#!/usr/bin/env node
/**
 * Assemble la vitrine, la démonstration publiée sur GitHub Pages
 *
 * Le tableau de bord ne montre que le portefeuille de celui qui le consulte :
 * on ne peut donc pas en donner un aperçu sans publier ses propres montants.
 * « npm run demo » fabrique déjà 42 propriétés inventées pour les captures
 * d'écran ; la vitrine les sert derrière l'application elle-même, pour qu'on
 * puisse regarder l'outil tourner avant de décider de l'installer.
 *
 * Ce qui est publié n'est PAS l'outil, et ne peut pas l'être. GitHub Pages ne
 * sert que des fichiers : les quatre relais de nginx.conf n'y existent pas, et
 * sans eux ni l'API Bricks, ni le suivi des projets, ni les photos ne sont
 * joignables. Ce n'est pas une limite qu'on pourrait lever côté navigateur —
 * api.bricks.co ne renvoie ses en-têtes CORS que pour app.bricks.co, et
 * Cloudflare challenge tout le reste. Voir docs/api.md.
 *
 * La règle de découpe tient en une phrase : la vitrine garde tout ce qui lit
 * les chiffres, et perd tout ce qui les charge, les enregistre ou les emporte.
 * D'où la section d'accueil réécrite plus bas — le favori, le champ de session,
 * l'export et l'effacement des données locales n'ont rien à faire sur une page
 * publique servie par un tiers.
 *
 * Cette découpe a une conséquence qui vaut d'être dite : la vitrine n'écrit
 * aucun portefeuille dans le localStorage de github.io. C'est important, parce
 * que cette origine est partagée par tous les dépôts publiés du compte — un
 * autre projet Pages y lirait ce que celui-ci y aurait laissé. « ?demo » charge
 * sans persister, et plus rien d'autre ne charge.
 *
 *   npm run vitrine
 *
 * Le dossier produit se regarde derrière « npm run serve » comme le dépôt
 * lui-même. Le job « Vitrine » de .github/workflows/publication.yml le
 * construit et le publie, sur un tag ou sur demande explicite.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SORTIE = path.join(RACINE, 'vitrine');

/** Ce qui part sur Pages, et rien d'autre. Le reste du dépôt n'a pas à y être. */
const COPIES = ['src', 'favicon.png'];

/**
 * Section d'accueil de la vitrine
 *
 * Elle remplace « Charger vos données », qui n'a plus rien à charger. Il en
 * reste trois choses.
 *
 * L'identifiant « uploadSection » : src/ui/uiUpdater.js le replie une fois les
 * résultats à l'écran, et src/events/fichierHandler.js s'en sert de zone de
 * dépôt — ce dernier renonce de lui-même, faute de champ de fichier.
 *
 * Le div « error » : c'est le seul endroit où src/ui/modals.js sait écrire.
 * Rien ne devrait s'y afficher ici, mais un portefeuille de démonstration
 * introuvable doit pouvoir le dire ailleurs que dans la console.
 *
 * Un mot, enfin, sur le vrai outil. Il ne redit pas que les chiffres sont
 * inventés : le bandeau de démonstration, deux lignes plus bas, le dit déjà et
 * le dit mieux.
 *
 * « note » et non « aide » : le repli masque les « aide », et cette phrase-là
 * doit rester lisible une fois le tableau affiché — c'est le seul lien vers
 * l'outil réel. Le titre passe en « sr-only » pour la raison inverse : il
 * n'apporte rien à l'œil, et son apparition puis sa disparition au chargement
 * de la démonstration ne feraient que sautiller.
 */
const ACCUEIL = `        <section class="upload-section" id="uploadSection" aria-labelledby="titreSession">
            <h2 id="titreSession" class="sr-only">Démonstration</h2>

            <div id="error" class="error hidden" role="alert"></div>

            <p class="note">
                L'analyseur s'installe chez vous et lit votre vrai portefeuille. Vos chiffres
                restent sur votre machine.
                <a href="https://github.com/HermessNRJ/bricks-analyser">Le code, et comment
                l'installer</a>.
            </p>
        </section>
`;

/**
 * La section à remplacer, bornée à sa propre balise fermante
 *
 * Non gourmand : « upload-section » ne contient aujourd'hui aucune autre
 * section, et assemblerVitrine() le vérifie plutôt que de le supposer.
 */
const SECTION_ACCUEIL = /^ {8}<section class="upload-section"[\s\S]*?^ {8}<\/section>\n/m;

/** L'ancre où glisser l'amorce, juste avant le module principal */
const ANCRE_MODULE = '    <!-- Main Application Module (ES6) -->';

/**
 * Ce qui met la vitrine dans son unique mode
 *
 * src/events/appInitializer.js lit « ?demo » au chargement. Le poser ici plutôt
 * que de publier un lien à rallonge évite qu'une adresse recopiée sans sa
 * requête n'ouvre une page vide — et la barre d'adresse continue de dire ce qui
 * est affiché, ce qu'une redirection cachée ne ferait pas.
 *
 * Le script n'est pas différé, contrairement au module qui le suit : il
 * s'exécute donc avant lui. Le fragment est reconduit, sinon un lien vers une
 * section du sommaire perdrait son ancre en chemin.
 */
const AMORCE = `    <!-- La vitrine n'a qu'un mode : voir tools/vitrine.mjs. -->
    <script>
        if (!new URLSearchParams(location.search).has('demo')) {
            history.replaceState(null, '', location.pathname + '?demo' + location.hash);
        }
    </script>

`;

/**
 * Le relais de version, et ce qui le remplace
 *
 * /version-api est un « location » de nginx : sur Pages il répond 404, et le
 * pied de page dirait « vérification impossible » à qui clique le numéro. Or
 * api.github.com renvoie « Access-Control-Allow-Origin: * » et l'appel ne porte
 * qu'un « Accept » — en-tête sur liste blanche, donc sans requête préalable.
 * Rien ne s'oppose à ce que la vitrine le demande directement.
 *
 * Ce que le relais protégeait ne se perd pas ici : il existe pour tenir
 * « connect-src 'self' » sur la page qui manipule le cookie de session Bricks.
 * La vitrine n'en manipule aucun.
 */
const RELAIS_VERSION = "VERSION_ENDPOINT: '/version-api'";
const APPEL_DIRECT = "VERSION_ENDPOINT: 'https://api.github.com/repos/HermessNRJ/bricks-analyser/releases/latest'";

/**
 * Remplace, ou échoue en nommant ce qui manque
 *
 * Une substitution qui ne trouve pas son ancre ne doit pas passer en silence :
 * elle publierait une vitrine amputée d'une transformation, et le défaut ne se
 * verrait qu'à l'écran, une fois en ligne.
 *
 * Le remplacement est passé en fonction : en chaîne, « $& » et ses semblables
 * seraient interprétés.
 *
 * @param {string} texte - Contenu à transformer
 * @param {string|RegExp} motif - Ce qu'on cherche
 * @param {string} par - Ce qu'on met à la place
 * @param {string} quoi - Nom de l'ancre, pour le message d'erreur
 * @returns {string} Contenu transformé
 */
function remplacer(texte, motif, par, quoi) {
    const trouve = typeof motif === 'string' ? texte.includes(motif) : motif.test(texte);

    if (!trouve) {
        throw new Error(`Vitrine : ${quoi} introuvable. La source a changé,`
            + ' tools/vitrine.mjs doit suivre.');
    }

    return texte.replace(motif, () => par);
}

/**
 * Transforme index.html en page de vitrine
 *
 * @param {string} html - Le index.html du dépôt
 * @returns {string} La page à publier
 */
export function pageVitrine(html) {
    const section = html.match(SECTION_ACCUEIL);

    // La borne de la section est sa première balise fermante : une section
    // imbriquée couperait donc au mauvais endroit, en laissant une fermante
    // orpheline dans la page. Personne n'en a ajouté ; on le vérifie quand même,
    // parce que le résultat serait un HTML cassé qu'aucun test ne regarde.
    if (section && /<section[\s>]/.test(section[0].slice(section[0].indexOf('>')))) {
        throw new Error('Vitrine : la section d\'accueil en contient une autre.'
            + ' La découpe de tools/vitrine.mjs ne tient plus.');
    }

    return remplacer(
        remplacer(html, SECTION_ACCUEIL, ACCUEIL, 'la section « Charger vos données »'),
        ANCRE_MODULE,
        AMORCE + ANCRE_MODULE,
        'le commentaire du module principal'
    );
}

/**
 * Fait viser à la vérification de version l'API GitHub plutôt que le relais
 *
 * @param {string} js - Le src/core/config.js du dépôt
 * @returns {string} La configuration de la vitrine
 */
export function configVitrine(js) {
    return remplacer(js, RELAIS_VERSION, APPEL_DIRECT, 'le point d\'accès de version');
}

/**
 * Écrit le dossier à publier
 *
 * Le portefeuille est un paramètre pour que les tests puissent assembler une
 * vitrine sans dépendre de data/demo.json, qui est ignoré par git et n'existe
 * qu'après un « npm run demo ».
 *
 * @param {string} sortie - Dossier de destination, recréé de zéro
 * @param {string} demo - Portefeuille de démonstration à publier
 */
export function assemblerVitrine(sortie, demo = path.join(RACINE, 'data', 'demo.json')) {
    if (!fs.existsSync(demo)) {
        throw new Error('Vitrine : data/demo.json manque. Le fabriquer avec « npm run demo ».');
    }

    // De zéro : un fichier retiré du dépôt continuerait sinon d'être publié.
    fs.rmSync(sortie, { recursive: true, force: true });
    fs.mkdirSync(sortie, { recursive: true });

    for (const nom of COPIES) {
        fs.cpSync(path.join(RACINE, nom), path.join(sortie, nom), { recursive: true });
    }

    // Le chemin est celui qu'attend src/events/appInitializer.js, relatif comme
    // tous les autres : la vitrine tient donc aussi bien à la racine d'un
    // domaine que dans le sous-chemin d'un site de projet.
    fs.mkdirSync(path.join(sortie, 'data'), { recursive: true });
    fs.copyFileSync(demo, path.join(sortie, 'data', 'demo.json'));

    fs.writeFileSync(
        path.join(sortie, 'index.html'),
        pageVitrine(fs.readFileSync(path.join(RACINE, 'index.html'), 'utf8'))
    );

    const config = path.join(sortie, 'src', 'core', 'config.js');
    fs.writeFileSync(config, configVitrine(fs.readFileSync(config, 'utf8')));
}

// Importé par les tests, exécuté par « npm run vitrine » : seule la seconde
// façon doit écrire quelque chose sur le disque.
if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
    assemblerVitrine(SORTIE);
    console.log(`Vitrine assemblée dans ${path.relative(process.cwd(), SORTIE)}/`);
}
