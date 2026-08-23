/**
 * Export du tableau de bord en un fichier HTML autonome
 *
 * Ce que produit ce module est un instantané, pas une copie de l'application :
 * la page telle qu'elle est au moment du clic, figée, lisible sur une machine
 * qui n'a ni Docker, ni le dépôt, ni même une connexion. Un double-clic sur le
 * fichier suffit.
 *
 * D'où le parti pris : aucun JavaScript dans le fichier produit. Les modules ES
 * ne se chargent pas depuis « file:// » — l'origine y est opaque et le
 * navigateur refuse —, et les embarquer sous forme de textes instanciés en
 * « blob: » reviendrait à écrire un empaqueteur à la main, dans un projet qui a
 * fait le choix de s'en passer. Les graphiques deviennent donc des images, les
 * commandes disparaissent ou se figent en texte, et ce qui reste est un
 * document : il ne calcule plus rien, il montre ce qui avait été calculé.
 *
 * Ce que ce fichier contient, il faut le dire clairement : le portefeuille en
 * clair, adresses et montants compris, sans protection d'aucune sorte. C'est
 * l'inverse de la posture du reste de l'outil, où les données ne bougent pas —
 * et c'est le but même d'un export. Le nom porte donc la date, et docs/securite.md
 * dit ce qu'on emporte en emportant ce fichier.
 */

import { CONFIG } from '../core/config.js';
import { logger, LOG_CATEGORIES } from '../utils/logger.js';
import {
    setTaillePage, taillePageCourante, allerALaPage, pageCourante
} from '../ui/uiUpdater.js';

/** Galerie d'où viennent les photos de propriétés */
const GALERIE = 'https://documents.bricks.co/property-photo-gallery/';

/** Relais de même origine vers cette galerie, ouvert par nginx.conf */
const RELAIS = '/vignette/';

/**
 * Noms de fichiers acceptés par le relais
 *
 * Le même motif que la « location » de nginx.conf, et il doit le rester : ce
 * qui passe ici sans passer là-bas donne une image manquante, ce qui passerait
 * là-bas sans passer ici ne serait jamais demandé.
 *
 * Le sous-dossier « opti » est la seule barre oblique tolérée — la galerie y
 * range une partie de ses photos —, et la casse est libre : on y trouve des
 * « .JPG ».
 */
const NOM_VIGNETTE = /^(?:opti\/)?[A-Za-z0-9][A-Za-z0-9._-]{0,120}\.(?:webp|png|jpe?g)$/i;

/**
 * Largeur à laquelle les photos sont réencodées
 *
 * Les fiches ne dépassent jamais 320 px de large à l'écran ; 480 laisse de quoi
 * voir sur un écran dense sans porter quarante photos en pleine résolution. À
 * l'origine, une seule pesait 90 Ko.
 */
const LARGEUR_VIGNETTE = 480;

/** Compression des photos réencodées */
const QUALITE_VIGNETTE = 0.72;

/** Photos chargées de front : assez pour ne pas traîner, pas de quoi noyer */
const VIGNETTES_DE_FRONT = 6;

/** Délai laissé au tracé des départements, 109 Ko lus une seule fois */
const ATTENTE_CARTE = 5000;

/** Intervalle entre deux vérifications de l'arrivée du tracé */
const PAS_ATTENTE = 100;

/**
 * Ce qui n'a plus de sens une fois le document figé
 *
 * Un contrôle mort est pire qu'un contrôle absent : on clique, rien ne se
 * passe, et c'est le document entier qui passe pour cassé.
 */
const A_RETIRER = [
    '.properties-controls',   // recherche, tris et filtres du registre
    '#pagination',            // tout est déplié, il n'y a plus de pages
    '.champ-recherche',       // le filtre du tableau des localisations
    '#periodeBornes',         // les bornes de période saisies à la main
    '#geoCarteBulle',         // l'infobulle que le survol remplissait
    '.pilotage',              // « cliquez ceci », « modifiez cela »
    '.hidden'                 // ce que la page ne montrait pas déjà
];

/**
 * Boutons qui ne sont que des commandes
 *
 * Tous les <button> ne se valent pas ici. Ceux-là ne portent qu'un ordre —
 * réinitialiser, retirer un filtre — et disparaissent avec lui. Les autres
 * portent une donnée : une brique du mur est un bouton, une commune du tableau
 * des localisations aussi, et les effacer viderait le mur et une colonne
 * entière. Ils deviennent du texte, avec leurs classes et donc leur allure.
 */
const BOUTONS_COMMANDES = '.bouton, [data-clear], [data-action]';

/**
 * Chemin de même origine pour une photo de propriété
 *
 * Une URL qui ne vient pas de la galerie attendue n'est pas relayée : elle
 * restera telle quelle dans le fichier, distante et donc absente hors ligne.
 * Mieux vaut ça que d'ouvrir le relais à ce qu'on n'a pas prévu.
 *
 * @param {string} url - Adresse affichée par la fiche
 * @returns {string} Chemin relayé, ou '' si l'URL n'est pas relayable
 */
export function cheminVignette(url) {
    if (typeof url !== 'string' || !url.startsWith(GALERIE)) {
        return '';
    }

    const fichier = url.slice(GALERIE.length);

    return NOM_VIGNETTE.test(fichier) ? RELAIS + fichier : '';
}

/**
 * Nom du fichier produit
 *
 * Daté, parce qu'un instantané sans date ne vaut rien, et distinct du
 * « bricks-AAAA-MM-JJ-HHMM.json » de la collecte : ces deux fichiers vivent
 * dans le même dossier de téléchargements et ne se rechargent pas pareil.
 *
 * @param {Date} date - Moment de l'export
 * @returns {string} Nom de fichier
 */
export function nomFichier(date) {
    const jour = [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, '0'),
        String(date.getDate()).padStart(2, '0')
    ].join('-');

    return `bricks-tableau-${jour}.html`;
}

/**
 * Remplace les graphiques par leur image
 *
 * Un canvas cloné est vide : le clone copie la balise, pas ce qui a été dessiné
 * dedans. Les pixels sont donc relus sur les canvas vivants, et appariés par
 * identifiant.
 *
 * Les dimensions sont reprises telles qu'affichées, pas telles que tracées :
 * Chart.js dessine à la densité de l'écran, et une image de 1086 px de large
 * posée sans consigne s'afficherait deux fois trop grande sur un écran dense.
 *
 * @param {Element} source - Le tableau de bord vivant
 * @param {Element} clone - Sa copie, à retoucher
 */
export function figerGraphiques(source, clone) {
    source.querySelectorAll('canvas[id]').forEach((toile) => {
        const cible = clone.querySelector(`canvas[id="${toile.id}"]`);

        if (!cible) {
            return;
        }

        const cadre = toile.getBoundingClientRect();
        const image = document.createElement('img');

        try {
            image.src = toile.toDataURL('image/png');
        } catch (err) {
            logger.warn(LOG_CATEGORIES.CHART, 'Chart could not be frozen', { id: toile.id, err: err.message });
            cible.remove();
            return;
        }

        image.alt = '';
        image.className = 'graphique-fige';

        // Les dimensions passent par les attributs, non par le style : le
        // navigateur en tire le rapport d'aspect et réserve la place avant même
        // d'avoir décodé l'image, et la CSS peut encore la rétrécir sur un
        // écran étroit sans l'écraser.
        if (cadre.width > 0) {
            image.width = Math.round(cadre.width);
            image.height = Math.round(cadre.height);
        }

        cible.replaceWith(image);
    });
}

/**
 * Remplace un élément par un autre, en gardant ce qu'il portait
 *
 * @param {Element} origine - Élément à remplacer
 * @param {string} balise - Nom de la balise de remplacement
 */
function changerDeBalise(origine, balise) {
    const fige = document.createElement(balise);

    [...origine.attributes].forEach((attribut) => {
        if (attribut.name !== 'type') {
            fige.setAttribute(attribut.name, attribut.value);
        }
    });

    fige.append(...origine.childNodes);
    origine.replaceWith(fige);
}

/**
 * Fige un contrôle en le remplaçant par la valeur qu'il portait
 *
 * @param {Element} controle - Champ de saisie ou menu déroulant
 * @param {string} texte - Ce qu'il affichait
 */
function figerEnTexte(controle, texte) {
    const fige = document.createElement('span');
    fige.className = 'valeur-figee';
    fige.textContent = texte;
    controle.replaceWith(fige);
}

/**
 * Retire ou fige tout ce qui attendait un clic
 *
 * Les hypothèses du simulateur et la période des courbes ne sont pas des
 * commandes comme les autres : elles disent sous quelles conditions le
 * graphique d'à côté a été tracé. Les effacer rendrait la figure illisible,
 * les laisser vivantes ferait croire qu'on peut encore les changer. Elles
 * deviennent donc du texte.
 *
 * @param {Element} racine - Copie détachée du tableau de bord
 */
export function nettoyerInstantane(racine) {
    racine.querySelectorAll(A_RETIRER.join(',')).forEach((mort) => mort.remove());

    racine.querySelectorAll('select').forEach((menu) => {
        figerEnTexte(menu, menu.selectedOptions[0]?.textContent?.trim() || '');
    });

    racine.querySelectorAll('input[type="checkbox"]').forEach((coche) => {
        const etiquette = coche.closest('label');
        const texte = (etiquette?.textContent || '').trim();

        figerEnTexte(etiquette || coche, `${coche.checked ? '☑' : '☐'} ${texte}`.trim());
    });

    // Un champ numérique porte « 9.8 » : c'est la forme que le navigateur
    // impose à sa valeur, pas celle qu'on écrit en français. Elle passait telle
    // quelle au milieu de montants séparés par des virgules.
    racine.querySelectorAll('input').forEach((champ) => figerEnTexte(
        champ,
        champ.type === 'number' ? champ.value.replace('.', ',') : champ.value
    ));

    racine.querySelectorAll('button').forEach((bouton) => {
        if (bouton.matches(BOUTONS_COMMANDES)) {
            bouton.remove();
            return;
        }

        changerDeBalise(bouton, 'span');
    });

    // Une étiquette qui ne désigne plus rien : garder le « for » ferait
    // chercher au navigateur un champ qui n'existe plus.
    racine.querySelectorAll('label[for]').forEach((etiquette) => etiquette.removeAttribute('for'));

    // Les fiches s'ouvraient sur Bricks au clic. Sans le script qui l'écoutait,
    // elles ne doivent plus s'annoncer comme des liens.
    racine.querySelectorAll('.property-card').forEach((fiche) => {
        fiche.removeAttribute('role');
        fiche.removeAttribute('tabindex');
        fiche.removeAttribute('data-project-url');
    });

    // La pastille du sommaire suivait le défilement ; figée sur une section au
    // hasard, elle désignerait le mauvais endroit tout du long. Les ancres,
    // elles, fonctionnent sans script.
    racine.querySelectorAll('.sommaire-actif').forEach((lien) => lien.classList.remove('sommaire-actif'));

    // Un document ne cache rien : ce qui était replié s'ouvre.
    racine.querySelectorAll('details').forEach((repli) => { repli.open = true; });

    // La marque du document figé. Elle ne sert qu'aux quelques règles de
    // main.css qui retirent ce qui invitait à cliquer — un curseur en main sur
    // ce qui ne répond plus est une promesse en trop.
    racine.classList.add('instantane');
}

/**
 * Ouvre la géographie et attend que la carte soit tracée
 *
 * Le tracé des départements n'est lu qu'au dépliage de la section, et un clone
 * pris pendant qu'elle est repliée emporte un cadre vide : forcer « open » sur
 * la copie n'y changerait rien, il n'y a rien à ouvrir. La section est donc
 * dépliée pour de bon, le temps de la capture, puis refermée si elle l'était.
 *
 * Une carte qui ne vient pas n'arrête personne : l'export se fait sans elle,
 * comme la page elle-même quand le tracé manque.
 *
 * @returns {Promise<Function>} De quoi remettre la section comme elle était
 */
async function deplierGeographie() {
    const section = document.getElementById('geographieSection');

    if (!section || section.classList.contains('hidden') || section.open) {
        return () => {};
    }

    section.open = true;

    for (let essai = 0; essai < ATTENTE_CARTE / PAS_ATTENTE; essai += 1) {
        if (document.querySelector('#geoCarteTrace svg')) {
            break;
        }

        await new Promise((suite) => { setTimeout(suite, PAS_ATTENTE); });
    }

    return () => { section.open = false; };
}

/**
 * Charge une image et attend qu'elle soit prête
 * @param {string} src - Adresse à charger
 * @returns {Promise<HTMLImageElement>} L'image chargée
 */
function chargerImage(src) {
    return new Promise((resolve, reject) => {
        const image = new Image();

        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('image illisible'));
        image.src = src;
    });
}

/**
 * Réencode une image, plus petite, en donnée intégrable
 *
 * WebP d'abord, JPEG si le navigateur ne sait pas l'écrire : toDataURL rend
 * alors du PNG sans prévenir, et un PNG photographique pèse plusieurs fois le
 * JPEG correspondant. Le préfixe du résultat est la seule façon de savoir ce
 * qui a réellement été produit.
 *
 * @param {HTMLImageElement} image - Image chargée, de même origine
 * @returns {string} URL de données
 */
function reencoder(image) {
    const echelle = Math.min(1, LARGEUR_VIGNETTE / image.naturalWidth);
    const toile = document.createElement('canvas');

    toile.width = Math.max(1, Math.round(image.naturalWidth * echelle));
    toile.height = Math.max(1, Math.round(image.naturalHeight * echelle));
    toile.getContext('2d').drawImage(image, 0, 0, toile.width, toile.height);

    const webp = toile.toDataURL('image/webp', QUALITE_VIGNETTE);

    return webp.startsWith('data:image/webp') ? webp : toile.toDataURL('image/jpeg', QUALITE_VIGNETTE);
}

/**
 * Intègre les photos des fiches dans le document
 *
 * Une photo qui ne se charge pas garde son adresse d'origine : le fichier reste
 * juste, il lui manque seulement une image hors ligne. Un export sans photos
 * vaut mieux qu'un export qui échoue.
 *
 * @param {Element} racine - Copie détachée du tableau de bord
 * @returns {Promise<{integrees: number, distantes: number}>} Ce qui a été fait
 */
export async function integrerVignettes(racine) {
    const photos = [...racine.querySelectorAll('img.property-thumbnail')];
    const cache = new Map();
    let integrees = 0;

    for (let debut = 0; debut < photos.length; debut += VIGNETTES_DE_FRONT) {
        const lot = photos.slice(debut, debut + VIGNETTES_DE_FRONT);

        await Promise.all(lot.map(async (photo) => {
            const chemin = cheminVignette(photo.getAttribute('src'));

            if (!chemin) {
                return;
            }

            if (!cache.has(chemin)) {
                cache.set(chemin, chargerImage(chemin).then(reencoder).catch(() => ''));
            }

            const donnee = await cache.get(chemin);

            if (donnee) {
                photo.setAttribute('src', donnee);
                photo.removeAttribute('loading');
                integrees += 1;
            }
        }));
    }

    return { integrees, distantes: photos.length - integrees };
}

/**
 * Relit les feuilles de style qui s'appliquent en ce moment
 *
 * Le thème de l'export est celui qu'avait l'écran, et il ne bougera plus. On
 * pourrait pourtant faire mieux en apparence : reprendre l'attribut « media »
 * du <link> de nuit.css tel quel — c'est lui seul que src/ui/apparence.js
 * retouche — donnerait un fichier qui suit le réglage de la machine qui
 * l'ouvre.
 *
 * Ce serait une erreur, parce que les graphiques n'y arrivent pas. Ce sont des
 * images, tracées dans la palette du moment : un lecteur en thème sombre
 * obtiendrait une page sombre portant huit figures claires. Mieux vaut un
 * document cohérent dans un thème qu'un document qui en suit un et en montre un
 * autre.
 *
 * Les feuilles qui ne s'appliquent pas ne sont donc pas emportées, et celles
 * qui s'appliquent le sont sans condition.
 *
 * @returns {Promise<string[]>} Les feuilles lues, dans l'ordre
 */
async function lireStyles() {
    const liens = [...document.querySelectorAll('link[rel="stylesheet"]')]
        .filter((lien) => window.matchMedia(lien.media || 'all').matches);

    return Promise.all(liens.map(async (lien) => (await fetch(lien.href)).text()));
}

/**
 * Échappe un texte destiné au document produit
 * @param {string} texte - Texte brut
 * @returns {string} Texte sûr en contenu comme en attribut
 */
function echapper(texte) {
    return String(texte)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * Empêche une feuille de style de refermer son propre <style>
 *
 * Le contenu d'un <style> est du texte brut : le navigateur y cherche
 * « </style » et rien d'autre. La séquence n'a rien à faire dans de la CSS, mais
 * un commentaire ou une chaîne pourrait la porter, et tout ce qui suit
 * basculerait alors du côté du document. La barre oblique est donc échappée —
 * ce qui est valide dans une chaîne CSS, sans effet dans un commentaire, et de
 * toute façon inapplicable ailleurs puisque la séquence y serait déjà une
 * erreur de syntaxe.
 *
 * @param {string} css - Feuille de style à intégrer
 * @returns {string} La même, sans séquence de fermeture
 */
function neutraliserFermeture(css) {
    return css.replace(/<\/(style)/gi, '<\\/$1');
}

/**
 * Assemble le document final
 *
 * @param {Object} pieces - Ce qu'il faut y mettre
 * @param {string} pieces.corps - Le tableau de bord nettoyé, en HTML
 * @param {string[]} pieces.styles - Feuilles à intégrer, déjà filtrées
 * @param {string} pieces.titre - Titre de la page et de l'onglet
 * @param {string} pieces.date - Date de l'export, en toutes lettres
 * @param {string} pieces.provenance - Ce que la page disait de l'âge des données
 * @returns {string} Document HTML complet
 */
export function assemblerDocument({ corps, styles, titre, date, provenance }) {
    const feuilles = styles
        .map((texte) => `<style>\n${neutraliserFermeture(texte)}\n</style>`)
        .join('\n');

    const origine = provenance ? `<p>${echapper(provenance)}</p>` : '';

    return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="generator" content="Analyseur d'investissements Bricks ${echapper(CONFIG.VERSION)}">
<title>${echapper(titre)}</title>
${feuilles}
</head>
<body>
<div class="container">
<header class="header">
<div class="header-titre">
<h1>${echapper(titre)}</h1>
<p>Instantané du ${echapper(date)}. Les chiffres ne bougeront plus.</p>
</div>
</header>
${corps}
<footer class="pied">
<p>
Exporté depuis l'<a href="https://github.com/HermessNRJ/bricks-analyser">analyseur d'investissements Bricks</a>
${echapper(CONFIG.VERSION)}, outil indépendant sans lien avec Bricks.co&nbsp;— ni affilié, ni approuvé par eux.
Aucun chiffre affiché ici ne fait foi&nbsp;: seul votre relevé Bricks compte.
</p>
${origine}
<p>Ce fichier porte le portefeuille en clair. Le partager, c'est le partager en entier.</p>
</footer>
</div>
</body>
</html>
`;
}

/**
 * Construit l'instantané complet du tableau de bord
 *
 * Le registre est déplié le temps de la capture : il s'affiche par pages de
 * vingt-quatre, et n'exporter que la page ouverte donnerait un document qui
 * ment par omission. La vue est ensuite reposée là où elle était.
 *
 * @param {Object} [options] - Réglages
 * @param {Function} [options.avancement] - Appelée à chaque étape franchie
 * @returns {Promise<{html: string, vignettes: Object}>} Le document et son bilan
 */
export async function construireInstantane({ avancement = () => {} } = {}) {
    const resultats = document.getElementById('results');

    if (!resultats) {
        throw new Error('Aucun tableau de bord à exporter');
    }

    avancement('carte');

    const refermerGeographie = await deplierGeographie();

    avancement('registre');

    const tailleAvant = taillePageCourante();
    const pageAvant = pageCourante();
    let clone;

    try {
        if (tailleAvant !== Infinity) {
            setTaillePage(Infinity);
        }

        clone = resultats.cloneNode(true);
        figerGraphiques(resultats, clone);
        nettoyerInstantane(clone);
    } finally {
        if (tailleAvant !== Infinity) {
            setTaillePage(tailleAvant);
            allerALaPage(pageAvant, { defiler: false });
        }

        refermerGeographie();
    }

    avancement('vignettes');

    const vignettes = await integrerVignettes(clone);

    avancement('styles');

    const styles = await lireStyles();
    const maintenant = new Date();
    const date = maintenant.toLocaleDateString('fr-FR', {
        day: 'numeric', month: 'long', year: 'numeric'
    });

    const html = assemblerDocument({
        corps: clone.outerHTML,
        styles,
        titre: `Portefeuille Bricks au ${date}`,
        date,
        provenance: document.getElementById('dataAge')?.textContent?.trim() || ''
    });

    logger.info(LOG_CATEGORIES.UI, 'Dashboard snapshot built', {
        octets: html.length,
        vignettesIntegrees: vignettes.integrees,
        vignettesDistantes: vignettes.distantes
    });

    return { html, vignettes, nom: nomFichier(maintenant) };
}
