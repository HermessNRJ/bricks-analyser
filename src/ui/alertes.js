/**
 * Fraîcheur des alertes d'une propriété
 *
 * Trois prédicats sur la date des alertes remontées par Bricks. Le registre
 * s'en sert pour filtrer, la fiche pour choisir entre « récente » et
 * « ancienne » : les loger dans l'un des deux aurait rendu l'autre dépendant
 * de lui, alors qu'ils ne partagent rien d'autre.
 */

import { getCurrentMonthYYYYMM, subtractMonths } from '../utils/dateHelpers.js';

/**
 * Vérifie si une propriété a une alerte datée du mois calendaire en cours
 *
 * À distinguer de hasWarningInLastMonth, qui regarde 30 jours glissants : le
 * 2 du mois, une alerte du 25 précédent entre dans les 30 jours mais pas dans
 * le mois courant. C'est bien « ce mois-ci » qui est demandé ici.
 *
 * @param {Object} property - Propriété
 * @returns {boolean}
 */
export function hasWarningInCurrentMonth(property) {
    if (!property.warnings || property.warnings.length === 0) return false;

    const moisCourant = getCurrentMonthYYYYMM();

    return property.warnings.some(w => {
        const date = new Date(w.date);
        if (Number.isNaN(date.getTime())) return false;

        const mois = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        return mois === moisCourant;
    });
}

/**
 * Vérifie si une propriété a un warning dans le dernier mois
 * @param {Object} property - Propriété
 * @returns {boolean}
 */
export function hasWarningInLastMonth(property) {
    if (!property.warnings || property.warnings.length === 0) return false;

    const oneMonthAgo = subtractMonths(new Date(), 1);

    return property.warnings.some(w => {
        const warningDate = new Date(w.date);
        return warningDate >= oneMonthAgo;
    });
}

/**
 * Vérifie si une propriété a un warning entre -2 mois et -1 mois
 * @param {Object} property - Propriété
 * @returns {boolean}
 */
export function hasWarningInMonthBefore(property) {
    if (!property.warnings || property.warnings.length === 0) return false;

    const now = new Date();
    const twoMonthsAgo = subtractMonths(now, 2);
    const oneMonthAgo = subtractMonths(now, 1);

    return property.warnings.some(w => {
        const warningDate = new Date(w.date);
        return warningDate >= twoMonthsAgo && warningDate < oneMonthAgo;
    });
}
