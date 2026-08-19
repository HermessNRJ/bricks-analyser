/**
 * Sommaire de la page : surligne l'ancre de la section à l'écran
 *
 * Les liens fonctionnent sans JavaScript — ce sont de simples <a href="#...">.
 * Ce module n'ajoute que le repère visuel de la section courante pendant le
 * défilement, pour qu'on sache où on est sans avoir à relire les titres.
 *
 * Le repère se calcule à partir des positions, à chaque image, et non depuis
 * un IntersectionObserver posé sur une bande étroite au milieu de l'écran.
 * Cette bande-là ne voyait passer un titre que si le défilement s'arrêtait
 * dedans : une molette avance de deux à trois cents pixels d'un coup, le
 * titre entrait et sortait entre deux images, et le sommaire restait figé sur
 * la section précédente pour tout le reste de la page. Un clic sur une ancre
 * était pire encore : le titre visé s'arrête sous le sommaire, très au-dessus
 * de la bande, si bien que la puce allumée était celle d'une autre section
 * que celle qu'on venait de demander.
 */

import { logger, LOG_CATEGORIES } from '../utils/logger.js';

/**
 * Distance entre le bas du sommaire et la ligne de lecture, en pixels
 *
 * Un titre est « atteint » dès qu'il passe sous le sommaire. La marge évite
 * qu'il bascule au pixel près, et surtout elle place la ligne sous le point
 * d'arrêt d'un clic d'ancre (scroll-margin-top) : le titre demandé est donc
 * toujours du bon côté quand le défilement se termine.
 */
const MARGE_LECTURE = 24;

/**
 * Indice de la section en cours de lecture
 *
 * @param {number[]} hauts - Position du haut de chaque section dans la fenêtre
 * @param {number} ligne - Ordonnée de la ligne de lecture
 * @param {boolean} enBasDePage - Le défilement a atteint le bas
 * @returns {number} Indice de la section courante, 0 si aucune n'est atteinte
 */
export function sectionCourante(hauts, ligne, enBasDePage) {
    if (hauts.length === 0) {
        return -1;
    }

    // Arrivé en bas, la dernière section est à l'écran quoi qu'en disent les
    // positions : une section courte n'amène jamais son titre sous la ligne,
    // et elle ne s'allumerait sinon jamais.
    if (enBasDePage) {
        return hauts.length - 1;
    }

    let courante = 0;

    hauts.forEach((haut, index) => {
        if (haut <= ligne) {
            courante = index;
        }
    });

    return courante;
}

/**
 * Fait défiler le sommaire pour amener une puce dans son champ visible
 *
 * Sur téléphone les huit libellés ne tiennent pas sur la largeur : sans cela
 * le repère serait hors champ précisément quand il sert.
 *
 * @param {HTMLElement} nav - Le sommaire, défilable horizontalement
 * @param {HTMLElement} lien - La puce à rendre visible
 */
function suivrePuce(nav, lien) {
    const cadre = nav.getBoundingClientRect();
    const puce = lien.getBoundingClientRect();

    if (puce.left < cadre.left) {
        nav.scrollLeft -= cadre.left - puce.left + 12;
    } else if (puce.right > cadre.right) {
        nav.scrollLeft += puce.right - cadre.right + 12;
    }
}

/**
 * Suit le défilement et marque la puce de la section lue
 */
export function setupSommaire() {
    const nav = document.querySelector('.sommaire');

    if (!nav) {
        return;
    }

    const sections = Array.from(nav.querySelectorAll('a'))
        .map(lien => ({ lien, cible: document.getElementById(lien.getAttribute('href')?.slice(1) || '') }))
        .filter(section => section.cible);

    if (sections.length === 0) {
        return;
    }

    let marquee = -1;

    const marquer = (index) => {
        if (index === marquee || index < 0) {
            return;
        }

        if (marquee >= 0) {
            sections[marquee].lien.classList.remove('sommaire-actif');
            sections[marquee].lien.removeAttribute('aria-current');
        }

        marquee = index;
        sections[index].lien.classList.add('sommaire-actif');
        sections[index].lien.setAttribute('aria-current', 'true');
        suivrePuce(nav, sections[index].lien);
    };

    let planifie = false;

    const relever = () => {
        planifie = false;

        // Le bas du sommaire, et non une hauteur fixe : épinglé il vaut son
        // épaisseur, mais tant que la page est en haut il est encore dans le
        // flux, et un titre situé au-dessus de lui n'est pas atteint.
        const cadre = nav.getBoundingClientRect();

        // Sa hauteur sert aussi en CSS, pour décaler ce qui s'épingle sous lui.
        if (cadre.height > 0) {
            document.documentElement.style.setProperty('--hauteur-sommaire', `${Math.round(cadre.height)}px`);
        }

        const restant = document.documentElement.scrollHeight - window.scrollY - window.innerHeight;
        const hauts = sections.map(section => section.cible.getBoundingClientRect().top);

        marquer(sectionCourante(hauts, cadre.bottom + MARGE_LECTURE, restant <= 2));
    };

    const demander = () => {
        if (!planifie) {
            planifie = true;
            requestAnimationFrame(relever);
        }
    };

    window.addEventListener('scroll', demander, { passive: true });
    window.addEventListener('resize', demander);

    // Le tableau de bord grandit sans qu'on défile : les résultats s'affichent,
    // la géographie se déplie, un filtre vide la liste des propriétés. Tout
    // cela déplace les titres sous une ligne de lecture restée en place.
    if (typeof ResizeObserver === 'function') {
        new ResizeObserver(demander).observe(document.body);
    }

    demander();

    logger.debug(LOG_CATEGORIES.EVENT, 'Sommaire handler configured', { sections: sections.length });
}
