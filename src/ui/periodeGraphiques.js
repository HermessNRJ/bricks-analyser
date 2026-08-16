/**
 * Fenêtre temporelle commune aux graphiques datés
 *
 * Un seul réglage gouverne tous les graphiques datés plutôt qu'un par
 * graphique : l'intérêt de restreindre la période est justement de lire
 * l'investissement, les revenus, l'impôt, l'origine des fonds et les arriérés
 * sur la même fenêtre. Cinq sélecteurs à accorder à la main auraient rendu la
 * comparaison pénible et, le plus souvent, fausse.
 *
 * Le donut et la treemap n'ont pas d'axe temporel : ce sont des états du
 * portefeuille aujourd'hui, et aucune période ne s'y applique.
 */

import { logger, LOG_CATEGORIES } from '../utils/logger.js';

/** Raccourcis proposés, en nombre de mois affichés */
export const PERIODES = {
    '3': 3,
    '6': 6,
    '12': 12,
    '24': 24,
    'all': Infinity
};

/** Valeur du sélecteur ouvrant la saisie de bornes */
export const PERIODE_PERSONNALISEE = 'custom';

const DEFAUT = 'all';
const CLE_PREFERENCE = 'periodeGraphiques';

let selection = { preset: DEFAUT, debut: null, fin: null };
let auChangement = null;

/**
 * Traduit la sélection en bornes de mois
 *
 * Les bornes se calculent sur une référence commune plutôt que sur chaque
 * série : la courbe des revenus estimés se prolonge de trois mois dans
 * l'avenir, celle de l'investissement s'arrête aujourd'hui. Découper « les six
 * derniers mois » série par série les décalait l'une de l'autre, ce qui ôtait
 * tout intérêt à un réglage commun.
 *
 * @param {Array<string>} moisReference - Mois servant de référence, triés
 * @param {Object} [fenetre] - Sélection à appliquer ; la courante par défaut
 * @returns {{debut: string|null, fin: string|null}} Bornes incluses
 */
export function bornesPeriode(moisReference, fenetre = selection) {
    if (fenetre.preset === PERIODE_PERSONNALISEE) {
        return { debut: fenetre.debut || null, fin: fenetre.fin || null };
    }

    const nombre = PERIODES[fenetre.preset] ?? PERIODES[DEFAUT];

    if (!Number.isFinite(nombre) || moisReference.length === 0) {
        return { debut: null, fin: null };
    }

    const retenus = moisReference.slice(-nombre);

    return { debut: retenus[0], fin: null };
}

/**
 * Restreint une série datée à la fenêtre choisie
 *
 * Les séries cumulées supportent d'être tronquées au début : chaque point
 * reste le cumul depuis l'origine, seule la fenêtre de lecture change.
 *
 * @param {Object} serie - Série { 'YYYY-MM': valeur }
 * @param {Object} [fenetre] - Sélection à appliquer ; la courante par défaut
 * @param {Array<string>} [moisReference] - Référence des raccourcis ; à défaut,
 *   les mois de la série elle-même
 * @returns {Object} Série restreinte, dans l'ordre chronologique
 */
export function filtrerPeriode(serie, fenetre = selection, moisReference = null) {
    const mois = Object.keys(serie || {}).sort();

    if (mois.length === 0) {
        return {};
    }

    const { debut, fin } = bornesPeriode(moisReference || mois, fenetre);
    const filtree = {};

    mois.filter(m => (!debut || m >= debut) && (!fin || m <= fin))
        .forEach(m => { filtree[m] = serie[m]; });

    return filtree;
}

/**
 * Renvoie la sélection courante
 * @returns {Object} { preset, debut, fin }
 */
export function periodeCourante() {
    return { ...selection };
}

/**
 * Configure le sélecteur de période
 * @param {Function} redessiner - Appelé à chaque changement de fenêtre
 */
export function initPeriodeGraphiques(redessiner) {
    const select = document.getElementById('periodeGraphiques');
    const debut = document.getElementById('periodeDebut');
    const fin = document.getElementById('periodeFin');

    if (!select || !debut || !fin) {
        return;
    }

    auChangement = redessiner;
    selection = lirePreference();

    select.value = selection.preset;
    debut.value = selection.debut || '';
    fin.value = selection.fin || '';
    majVisibiliteBornes();

    select.addEventListener('change', () => {
        selection.preset = select.value;
        majVisibiliteBornes();
        appliquer();
    });

    [debut, fin].forEach(champ => {
        champ.addEventListener('change', () => {
            selection.debut = debut.value || null;
            selection.fin = fin.value || null;

            // Saisir une borne signifie vouloir des bornes : inutile de
            // demander en plus de basculer le sélecteur.
            if (selection.preset !== PERIODE_PERSONNALISEE) {
                selection.preset = PERIODE_PERSONNALISEE;
                select.value = PERIODE_PERSONNALISEE;
                majVisibiliteBornes();
            }

            appliquer();
        });
    });

    logger.debug(LOG_CATEGORIES.EVENT, 'Chart period control configured', selection);
}

/**
 * Cale les bornes saisissables sur l'historique réellement disponible
 * Proposer un calendrier ouvert laisserait choisir des mois sans données.
 * @param {Array<string>} mois - Mois couverts par les données, triés
 */
export function bornerAuxDonnees(mois) {
    const debut = document.getElementById('periodeDebut');
    const fin = document.getElementById('periodeFin');

    if (!debut || !fin || mois.length === 0) {
        return;
    }

    const premier = mois[0];
    const dernier = mois[mois.length - 1];

    [debut, fin].forEach(champ => {
        champ.min = premier;
        champ.max = dernier;
    });

    if (!debut.value) debut.value = premier;
    if (!fin.value) fin.value = dernier;
}

/**
 * Enregistre la sélection et redessine
 */
function appliquer() {
    try {
        localStorage.setItem(CLE_PREFERENCE, JSON.stringify(selection));
    } catch {
        // Préférence d'affichage : son échec ne doit rien interrompre
    }

    logger.debug(LOG_CATEGORIES.CHART, 'Chart period changed', selection);

    if (typeof auChangement === 'function') {
        auChangement();
    }
}

/**
 * Montre les bornes uniquement en mode personnalisé
 */
function majVisibiliteBornes() {
    const bornes = document.getElementById('periodeBornes');

    if (bornes) {
        bornes.classList.toggle('hidden', selection.preset !== PERIODE_PERSONNALISEE);
    }
}

/**
 * Relit la sélection enregistrée
 * @returns {Object} Sélection valide, celle par défaut sinon
 */
function lirePreference() {
    try {
        const brut = JSON.parse(localStorage.getItem(CLE_PREFERENCE) || 'null');

        if (!brut || typeof brut !== 'object') {
            return { preset: DEFAUT, debut: null, fin: null };
        }

        const preset = brut.preset in PERIODES || brut.preset === PERIODE_PERSONNALISEE
            ? brut.preset
            : DEFAUT;

        return {
            preset,
            debut: typeof brut.debut === 'string' ? brut.debut : null,
            fin: typeof brut.fin === 'string' ? brut.fin : null
        };
    } catch {
        return { preset: DEFAUT, debut: null, fin: null };
    }
}
