/**
 * Petites tournures partagées par l'interface
 *
 * Trois fonctions d'une ligne, mais lues depuis les tuiles, le registre, les
 * fiches et le bilan des versements : les laisser dans l'un de ces modules
 * aurait fait dépendre les trois autres de lui pour une marque de pluriel.
 */

import { formatMonthName } from '../utils/formatters.js';

/**
 * Marque du pluriel : en français, zéro et un restent au singulier
 * @param {number} nombre - Quantité décrite
 * @returns {string} « s » au-delà de un, chaîne vide sinon
 */
export function pluriel(nombre) {
    return nombre > 1 ? 's' : '';
}

/**
 * Écrit un mois en incise, sans la majuscule de début de phrase
 * @param {string} mois - Mois au format YYYY-MM
 * @returns {string} Par exemple « août 2026 »
 */
export function moisEnIncise(mois) {
    const nom = formatMonthName(mois);
    return `${nom.charAt(0).toLowerCase()}${nom.slice(1)}`;
}

/**
 * Introduit un mois par « de », élidé devant avril, août et octobre
 * @param {string} mois - Mois au format YYYY-MM
 * @returns {string} Par exemple « d'août 2026 » ou « de juillet 2026 »
 */
export function deMois(mois) {
    const nom = moisEnIncise(mois);
    return /^[aeiouâéèêîôûy]/.test(nom) ? `d'${nom}` : `de ${nom}`;
}
