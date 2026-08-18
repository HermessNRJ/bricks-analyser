/**
 * La carte des départements
 *
 * Une seconde lecture des mêmes chiffres que le tableau des localisations, et
 * la seule qui montre le GROUPEMENT : les barres classent les régions, elles ne
 * disent pas que tout longe une côte ou évite une diagonale.
 *
 * Le tracé n'est pas dans le HTML. C'est un fichier de 109 Ko produit par
 * tools/carte.mjs depuis les contours de l'IGN, chargé au premier dépliage de
 * la section et jamais avant : une carte qu'on n'ouvre pas ne doit rien coûter.
 *
 * ELLE EST CACHÉE AUX LECTEURS D'ÉCRAN, volontairement. Cent un chemins SVG ne
 * se lisent pas à la voix, et tout ce qu'ils portent est déjà dans le tableau
 * juste au-dessus, sous une forme qui s'énonce. La rendre « accessible » en y
 * posant des étiquettes reviendrait à faire réciter cent une valeurs déjà lues.
 * Le clic vers le registre a lui aussi son équivalent au clavier : le menu
 * Département de la barre de filtres.
 */

import { agregerParDepartement, palier } from '../business/geographie.js';
import { formatCurrency, formatNumber, formatPercentage } from '../utils/formatters.js';
import { escapeHtml } from '../utils/html.js';
import { logger, LOG_CATEGORIES } from '../utils/logger.js';
import { pluriel } from './libelles.js';
import { updatePropertySortAndFilter } from './registre.js';

const CHEMIN_TRACE = './src/carte/departements.svg';

/** Le tracé, une fois lu : il ne change pas d'un portefeuille à l'autre */
let tracePromis = null;

/** Ce que chaque département porte, pour l'infobulle et le clic */
let parDepartement = new Map();

/**
 * Lit le tracé, une seule fois pour toute la vie de la page
 * @returns {Promise<string|null>} Le SVG, null s'il est introuvable
 */
function lireTrace() {
    if (!tracePromis) {
        tracePromis = fetch(CHEMIN_TRACE)
            .then(reponse => {
                if (!reponse.ok) {
                    throw new Error(`HTTP ${reponse.status}`);
                }
                return reponse.text();
            })
            .catch(err => {
                // Une carte manquante n'empêche pas de lire le tableau : la
                // section continue sans elle plutôt que de tomber en panne.
                logger.warn(LOG_CATEGORIES.UI, 'Map outline unavailable', { err: err.message });
                return null;
            });
    }

    return tracePromis;
}

/**
 * Dessine la carte pour un portefeuille
 * @param {Array} properties - Propriétés annotées par annoterGeographie
 * @returns {Promise<void>}
 */
export async function dessinerCarte(properties) {
    const bloc = document.getElementById('geoCarte');

    if (!bloc) {
        return;
    }

    const departements = agregerParDepartement(properties);

    parDepartement = new Map(departements.map(d => [d.code, d]));

    // Aucun bien situé : une carte de France entièrement vide n'apprendrait
    // rien que la note sur les localisations imprécises ne dise déjà.
    if (departements.length === 0) {
        bloc.classList.add('hidden');
        return;
    }

    const trace = await lireTrace();

    if (!trace) {
        bloc.classList.add('hidden');
        return;
    }

    const cadre = document.getElementById('geoCarteTrace');

    if (cadre && !cadre.querySelector('svg')) {
        // Le tracé vient d'un fichier du dépôt, servi par la même origine que
        // la page : il n'y a pas de données d'API là-dedans.
        cadre.innerHTML = trace;
        installerSurvol(cadre);
    }

    bloc.classList.remove('hidden');

    teinter(cadre, departements);
    ecrireLegende(departements);
}

/**
 * Pose un palier sur chaque département, et rien sur les autres
 * @param {HTMLElement} cadre - Conteneur du SVG
 * @param {Array} departements - Sortie de agregerParDepartement
 */
function teinter(cadre, departements) {
    const maximum = departements[0]?.capital || 0;

    cadre?.querySelectorAll('path[data-code]').forEach(chemin => {
        const departement = parDepartement.get(chemin.dataset.code);
        const rang = palier(departement?.capital || 0, maximum);

        // L'attribut plutôt qu'une classe : la CSS choisit la teinte, et un
        // département qui repasse à zéro entre deux chargements perd la sienne
        // sans qu'on ait à retirer une classe posée au tracé d'avant.
        if (rang > 0) {
            chemin.dataset.palier = String(rang);
        } else {
            delete chemin.dataset.palier;
        }
    });
}

/**
 * Écrit ce que la légende annonce sous la carte
 * @param {Array} departements - Sortie de agregerParDepartement, triée
 */
function ecrireLegende(departements) {
    const note = document.getElementById('geoCarteNote');

    if (!note) {
        return;
    }

    const tete = departements[0];

    note.textContent = `${formatNumber(departements.length)} département${pluriel(departements.length)}`
        + ` couvert${pluriel(departements.length)}. Le plus chargé est`
        + ` ${tete.nom} (${tete.code}), avec ${formatCurrency(tete.capital, 0)}`
        + ` — les cinq teintes s'échelonnent par rapport à lui.`;
}

/**
 * Installe l'infobulle et le renvoi au registre
 *
 * Par délégation sur le conteneur : cent une écoutes posées une à une seraient
 * cent une écoutes à retirer, et le tracé n'est injecté qu'une fois.
 *
 * @param {HTMLElement} cadre - Conteneur du SVG
 */
function installerSurvol(cadre) {
    const bulle = document.getElementById('geoCarteBulle');

    cadre.addEventListener('mousemove', (evenement) => {
        const chemin = evenement.target.closest('path[data-code]');

        if (!chemin || !bulle) {
            if (bulle) bulle.classList.add('hidden');
            return;
        }

        bulle.innerHTML = contenuBulle(chemin);
        bulle.classList.remove('hidden');
        placerBulle(bulle, evenement);
    });

    cadre.addEventListener('mouseleave', () => bulle?.classList.add('hidden'));

    cadre.addEventListener('click', (evenement) => {
        const chemin = evenement.target.closest('path[data-code]');
        const departement = chemin && parDepartement.get(chemin.dataset.code);

        // Un département vide n'ouvre rien : le registre filtré dessus serait
        // vide, et un clic qui ne répond pas se comprend mieux qu'un écran blanc.
        if (!departement) {
            return;
        }

        updatePropertySortAndFilter({ departementFilter: departement.code });
        bulle?.classList.add('hidden');

        document.querySelector('.properties-list')?.scrollIntoView({ behavior: 'smooth', block: 'start' });

        logger.info(LOG_CATEGORIES.UI, 'Registry filtered from map', { departement: departement.code });
    });
}

/**
 * Le texte de l'infobulle pour un département
 * @param {SVGPathElement} chemin - Département survolé
 * @returns {string} HTML de l'infobulle
 */
function contenuBulle(chemin) {
    const code = chemin.dataset.code;
    const nom = chemin.dataset.nom || code;
    const departement = parDepartement.get(code);

    const titre = `<strong>${escapeHtml(nom)}</strong> <span class="bulle-code">${escapeHtml(code)}</span>`;

    if (!departement) {
        return `${titre}<span class="bulle-vide">Aucun bien</span>`;
    }

    return titre
        + `<span class="bulle-montant montant">${formatCurrency(departement.capital, 0)}</span>`
        + `<span class="bulle-detail">${formatNumber(departement.projets)}`
        + ` bien${pluriel(departement.projets)} · ${formatPercentage(departement.part, 1)}`
        + ' du capital engagé</span>';
}

/**
 * Place l'infobulle à côté du curseur, sans sortir du bloc
 *
 * Les coordonnées se prennent sur l'ANCÊTRE POSITIONNÉ, et non sur le cadre du
 * tracé : celui-ci est centré dans le bloc, et mesurer sur lui décalait
 * l'infobulle de sa marge — elle se posait à gauche du curseur, sur la carte.
 *
 * @param {HTMLElement} bulle - L'infobulle
 * @param {MouseEvent} evenement - Le survol en cours
 */
function placerBulle(bulle, evenement) {
    const ancre = bulle.offsetParent || bulle.parentElement;

    if (!ancre) {
        return;
    }

    const boite = ancre.getBoundingClientRect();
    const taille = bulle.getBoundingClientRect();

    const x = evenement.clientX - boite.left + 14;
    const y = evenement.clientY - boite.top + 14;

    // Basculée de l'autre côté du curseur quand elle déborderait : au bord
    // droit d'un écran étroit, elle sortait du cadre et se faisait rogner.
    const debordeX = x + taille.width > boite.width;
    const debordeY = y + taille.height > boite.height;

    bulle.style.left = `${debordeX ? Math.max(0, x - taille.width - 28) : x}px`;
    bulle.style.top = `${debordeY ? Math.max(0, y - taille.height - 28) : y}px`;
}
