/**
 * Couleurs des graphiques, lues dans la feuille de style
 *
 * Chart.js dessine dans un canevas : aucune de ses couleurs ne peut être une
 * variable CSS, il lui faut des valeurs résolues. Les écrire en dur dans les
 * modules de graphiques revenait à tenir deux palettes en parallèle — et la
 * seconde ne suivait pas le thème sombre, si bien que les courbes restaient
 * calées sur un fond clair qui n'était plus là.
 *
 * Ce module résout les jetons de `:root` au moment du tracé. La feuille de
 * style reste la seule source, et un thème qui change n'a qu'à provoquer un
 * nouveau tracé.
 */

import { logger, LOG_CATEGORIES } from '../utils/logger.js';

/**
 * Valeurs de repli, si la feuille de style n'est pas encore appliquée
 *
 * jsdom ne résout pas les variables CSS : sans ce filet, les tests unitaires
 * recevraient des chaînes vides, que Chart.js interpréterait comme du noir.
 */
const REPLIS = {
    '--ink': '#16202b',
    '--ink-muted': '#5c6b77',
    '--ink-faint': '#8797a3',
    '--surface': '#ffffff',
    '--rule': '#d7dee4',
    '--statut-actif': '#1f6f4a',
    '--statut-financement': '#1d5fb0',
    '--statut-avenir': '#a97400',
    '--statut-rembourse': '#8b94a0',
    '--alerte': '#b3341f',
    '--alerte-faible': '#a97400',
    '--graph-revenus': '#4bc0c0',
    '--graph-revenus-fond': 'rgba(75, 192, 192, 0.1)',
    '--graph-attendu': '#8a94a6',
    '--graph-impot': '#ff6384',
    '--graph-impot-fond': 'rgba(255, 99, 132, 0.2)',
    '--graph-autres': '#95a5a6',
    '--graph-investissement-fond': 'rgba(29, 95, 176, 0.08)',
    '--graph-parrainage-fond': 'rgba(31, 111, 74, 0.08)',
    '--graph-etiquette-fond': 'rgba(255, 255, 255, 0.88)',
    '--graph-infobulle': 'rgba(22, 32, 43, 0.94)'
};

// Résoudre un jeton force un recalcul de style : on ne le fait qu'une fois par
// tracé, et le cache est vidé quand le thème change.
let cache = new Map();

/**
 * Résout un jeton de couleur en valeur utilisable par Chart.js
 * @param {string} nom - Nom de la variable CSS, tiret-tiret compris
 * @returns {string} Couleur résolue, valeur de repli sinon
 */
export function couleur(nom) {
    if (cache.has(nom)) {
        return cache.get(nom);
    }

    let valeur = '';

    try {
        valeur = getComputedStyle(document.documentElement)
            .getPropertyValue(nom)
            .trim();
    } catch {
        // Environnement sans mise en page : on tombe sur le repli
    }

    const resolue = valeur || REPLIS[nom] || '#000000';
    cache.set(nom, resolue);

    return resolue;
}

/**
 * Oublie les couleurs résolues
 * À appeler quand le thème change : les jetons ont de nouvelles valeurs.
 */
export function oublierCouleurs() {
    cache = new Map();
}

/**
 * Prévient quand le thème du système bascule
 *
 * Les canevas déjà tracés gardent leurs couleurs : il faut les redessiner,
 * ce dont l'appelant se charge.
 *
 * @param {Function} auChangement - Appelée après vidage du cache
 */
export function surChangementDeTheme(auChangement) {
    if (typeof matchMedia !== 'function') {
        return;
    }

    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        oublierCouleurs();
        logger.debug(LOG_CATEGORIES.CHART, 'Color scheme changed', { sombre: e.matches });
        auChangement();
    });
}
