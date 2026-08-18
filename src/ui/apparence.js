/**
 * Bascule entre le thème clair et le thème sombre
 *
 * Le thème sombre existait déjà, mais il ne suivait que le réglage du système :
 * personne ne pouvait lire ce tableau de bord en sombre sur une machine réglée
 * en clair, ni l'inverse. Trois états, donc, et non deux — « auto » n'est pas
 * un troisième thème, c'est l'absence de choix, et c'est là que tout le monde
 * commence.
 *
 * La mécanique tient dans l'attribut `media` du <link> qui charge nuit.css :
 *
 *   auto    → (prefers-color-scheme: dark)   la feuille s'applique si le
 *                                            système est en sombre
 *   sombre  → all                            elle s'applique toujours
 *   clair   → not all                        elle ne s'applique jamais
 *
 * Rien n'est recopié, rien n'est calculé : c'est le navigateur qui tranche, et
 * il le fait dès le premier rendu, avant que ce module ne soit chargé. Un
 * utilisateur au bureau sombre n'a donc jamais de page blanche qui clignote.
 *
 * L'attribut `data-theme` posé sur <html> ne commande aucune couleur : il ne
 * sert qu'à l'interrupteur, qui doit savoir dans quelle position se dessiner.
 */

import { lirePreference, ecrirePreference } from '../core/preferences.js';
import { logger, LOG_CATEGORIES } from '../utils/logger.js';

/** Les trois positions possibles */
export const THEMES = ['auto', 'clair', 'sombre'];

/** Requête média à donner au <link> de nuit.css pour chaque thème */
const MEDIA = {
    auto: '(prefers-color-scheme: dark)',
    sombre: 'all',
    clair: 'not all'
};

const PREFERENCE_SYSTEME = '(prefers-color-scheme: dark)';

/**
 * Requête média correspondant à un thème
 * @param {string} theme - 'auto', 'clair' ou 'sombre'
 * @returns {string} Valeur de l'attribut media
 */
export function mediaPourTheme(theme) {
    return MEDIA[theme] || MEDIA.auto;
}

/**
 * Le thème réellement à l'écran, « auto » résolu
 *
 * @param {string} theme - Thème demandé
 * @param {boolean} systemeSombre - Le système préfère-t-il le sombre
 * @returns {string} 'clair' ou 'sombre'
 */
export function themeAffiche(theme, systemeSombre) {
    if (theme === 'clair' || theme === 'sombre') {
        return theme;
    }

    return systemeSombre ? 'sombre' : 'clair';
}

/**
 * Ce que donnerait un appui sur l'interrupteur
 *
 * Toujours le contraire de ce qui est affiché : depuis « auto », le premier
 * appui fixe donc explicitement l'opposé du système. Un cycle à trois temps
 * demanderait de deviner l'ordre, et l'étiquette du bouton ne dirait plus ce
 * qu'il fait.
 *
 * @param {string} theme - Thème courant
 * @param {boolean} systemeSombre - Le système préfère-t-il le sombre
 * @returns {string} Thème à appliquer
 */
export function themeSuivant(theme, systemeSombre) {
    return themeAffiche(theme, systemeSombre) === 'sombre' ? 'clair' : 'sombre';
}

/**
 * Le système préfère-t-il le sombre
 * @returns {boolean} Faux si la question ne peut pas être posée
 */
function prefereSombre() {
    if (typeof matchMedia !== 'function') {
        return false;
    }

    return matchMedia(PREFERENCE_SYSTEME).matches;
}

/**
 * Met la page au thème demandé
 *
 * @param {string} theme - 'auto', 'clair' ou 'sombre'
 */
function appliquer(theme) {
    const feuille = document.getElementById('feuilleNuit');

    if (feuille) {
        feuille.media = mediaPourTheme(theme);
    }

    const affiche = themeAffiche(theme, prefereSombre());

    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.themeAffiche = affiche;

    majInterrupteur(affiche);

    // Les canevas déjà tracés gardent leurs couleurs : c'est à charts/theme.js
    // de vider son cache et de faire redessiner. Un événement plutôt qu'un
    // appel direct : l'apparence n'a pas à connaître les graphiques.
    document.dispatchEvent(new CustomEvent('apparence:changee', { detail: { theme, affiche } }));
}

/**
 * Aligne l'interrupteur sur ce qui est affiché
 * @param {string} affiche - 'clair' ou 'sombre'
 */
function majInterrupteur(affiche) {
    const bouton = document.getElementById('basculeTheme');

    if (!bouton) {
        return;
    }

    const versSombre = affiche === 'clair';

    // aria-pressed dit l'état, le libellé dit l'action : un lecteur d'écran
    // annonce « thème sombre, non activé », ce qui se comprend dans les deux sens.
    bouton.setAttribute('aria-pressed', String(!versSombre));
    bouton.setAttribute('aria-label', versSombre ? 'Passer au thème sombre' : 'Passer au thème clair');
    bouton.title = versSombre ? 'Passer au thème sombre' : 'Passer au thème clair';
}

/**
 * Bascule le thème, en passant par une transition de vue si le navigateur sait
 *
 * L'effet est un rideau circulaire parti du bouton : il donne à voir d'où vient
 * le changement, ce qu'un basculement instantané de toute la page ne dit pas.
 * Là où l'API manque — ou quand l'utilisateur a demandé moins d'animations —
 * la page change d'un coup, ce qui a toujours été un résultat acceptable.
 */
function basculer() {
    const courant = lirePreference('theme');
    const suivant = themeSuivant(courant, prefereSombre());

    ecrirePreference('theme', suivant);

    logger.info(LOG_CATEGORIES.UI, 'Theme switched', { de: courant, vers: suivant });

    const anime = typeof document.startViewTransition === 'function'
        && !matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!anime) {
        appliquer(suivant);
        return;
    }

    poserOrigineDuRideau();
    document.startViewTransition(() => appliquer(suivant));
}

/**
 * Note où se trouve le bouton, pour que le rideau en parte
 *
 * La position est écrite en variables CSS parce que l'animation vit dans la
 * feuille de style : le JavaScript dit d'où, la CSS dit comment.
 */
function poserOrigineDuRideau() {
    const bouton = document.getElementById('basculeTheme');

    if (!bouton) {
        return;
    }

    const cadre = bouton.getBoundingClientRect();
    const style = document.documentElement.style;

    style.setProperty('--rideau-x', `${Math.round(cadre.left + cadre.width / 2)}px`);
    style.setProperty('--rideau-y', `${Math.round(cadre.top + cadre.height / 2)}px`);
}

/**
 * Installe l'interrupteur et applique le thème retenu
 */
export function initApparence() {
    appliquer(lirePreference('theme'));

    const bouton = document.getElementById('basculeTheme');

    if (bouton) {
        bouton.addEventListener('click', basculer);
    } else {
        logger.warn(LOG_CATEGORIES.UI, 'Theme switch not found');
    }

    // En « auto », un bureau qui bascule doit entraîner la page. Le <link> le
    // fait tout seul pour les couleurs ; l'événement reste nécessaire pour les
    // canevas et pour l'état de l'interrupteur.
    if (typeof matchMedia === 'function') {
        matchMedia(PREFERENCE_SYSTEME).addEventListener('change', () => {
            if (lirePreference('theme') === 'auto') {
                appliquer('auto');
            }
        });
    }

    logger.debug(LOG_CATEGORIES.UI, 'Appearance configured');
}
