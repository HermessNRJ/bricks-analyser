/**
 * Pagination du registre
 *
 * Les onglets portent la plage de fiches qu'ils ouvrent, non un numéro de page :
 * le registre est trié, et « 3 » ne dit rien de ce qu'on y trouvera là où
 * « 49–72 » situe dans l'ordre choisi.
 */

import { TAILLES_PAGE } from '../../core/preferences.js';

/**
 * Nombre de pages affichées de part et d'autre de la page courante
 * Au-delà, un signe de troncature remplace la suite.
 */
const PAGES_VOISINES = 1;

/** En deçà, toutes les pages tiennent sans troncature */
const PAGES_SANS_TRONCATURE = 9;

/**
 * Choisit les pages à montrer, et où couper
 *
 * Vingt-quatre onglets alignés ne se lisent plus : la première, la dernière et
 * les voisines de la courante suffisent à situer où l'on est et à revenir aux
 * extrémités. Le reste se parcourt par « Précédent » et « Suivant ».
 *
 * @param {number} nbPages - Nombre total de pages
 * @param {number} courante - Page affichée
 * @returns {Array<number|null>} Numéros de page, null pour une coupure
 */
export function pagesAffichees(nbPages, courante) {
    if (nbPages <= PAGES_SANS_TRONCATURE) {
        return Array.from({ length: nbPages }, (_, i) => i + 1);
    }

    const retenues = new Set([1, nbPages]);

    for (let p = courante - PAGES_VOISINES; p <= courante + PAGES_VOISINES; p++) {
        if (p >= 1 && p <= nbPages) {
            retenues.add(p);
        }
    }

    const triees = [...retenues].sort((a, b) => a - b);
    const avecCoupures = [];

    triees.forEach((page, rang) => {
        // Une coupure ne vaut que pour au moins deux pages sautées : mise pour
        // une seule, elle occuperait la place de la page qu'elle cache.
        if (rang > 0 && page - triees[rang - 1] > 1) {
            avecCoupures.push(null);
        }
        avecCoupures.push(page);
    });

    return avecCoupures;
}

/**
 * Affiche la pagination
 *
 * Les onglets portent la PLAGE de fiches qu'ils ouvrent, non un numéro de page.
 * Le registre est trié — par investissement, par nom, par rendement — et « 3 »
 * ne dit alors rien de ce qu'on y trouvera, quand « 49–72 » situe d'emblée dans
 * l'ordre choisi. C'est aussi ce que l'indicateur disait déjà en toutes lettres.
 *
 * @param {number} total - Nombre de propriétés filtrées
 * @param {number} nbPages - Nombre de pages
 * @param {Object} vue - Où en est le registre
 * @param {number} vue.page - Page ouverte
 * @param {number} vue.taille - Fiches par page, Infinity si tout est affiché
 */
export function renderPagination(total, nbPages, { page: currentPage, taille: taillePage }) {
    const nav = document.getElementById('pagination');
    const onglets = document.getElementById('pageTabs');
    const precedent = document.getElementById('prevPage');
    const suivant = document.getElementById('nextPage');

    if (!nav || !onglets || !precedent || !suivant) {
        return;
    }

    // Une seule page, mais le choix de la taille doit rester atteignable :
    // sans lui, un registre réglé sur « Tout » n'aurait plus de quoi revenir.
    if (nbPages <= 1 && taillePage >= total) {
        nav.classList.toggle('hidden', total <= TAILLES_PAGE[0]);
        onglets.innerHTML = '';
        precedent.disabled = true;
        suivant.disabled = true;
        return;
    }

    nav.classList.remove('hidden');
    precedent.disabled = currentPage <= 1;
    suivant.disabled = currentPage >= nbPages;

    onglets.innerHTML = pagesAffichees(nbPages, currentPage).map(page => {
        if (page === null) {
            return '<span class="pagination-coupure" aria-hidden="true">…</span>';
        }

        const premier = (page - 1) * taillePage + 1;
        const dernier = Math.min(page * taillePage, total);
        const plage = premier === dernier ? `${premier}` : `${premier}–${dernier}`;
        const courante = page === currentPage;

        return `<button type="button" class="pagination-onglet" data-page="${page}"
            ${courante ? 'aria-current="page"' : ''}
            aria-label="Propriétés ${plage}">${plage}</button>`;
    }).join('');
}
