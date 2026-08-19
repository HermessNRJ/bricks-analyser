/**
 * Comparaison de numéros de version
 *
 * Le seul piège est le tri : « 1.10.0 » est postérieur à « 1.9.0 », mais
 * inférieur en comparaison de chaînes. Chaque numéro est donc décomposé en
 * trois entiers avant d'être comparé.
 *
 * Ce module ne connaît ni le réseau ni le DOM : il ne sait que dire, de deux
 * numéros, lequel vient après. Le reste est dans src/ui/version.js.
 */

/**
 * Décompose un numéro de version en trois entiers
 *
 * Le « v » du tag Git est toléré — l'API GitHub renvoie « v1.3.0 » là où
 * package.json porte « 1.3.0 » — mais rien d'autre ne l'est. Un numéro suivi
 * d'un suffixe (« 1.4.0-rc1 », « 1.4.0+build ») n'est pas tronqué à ses trois
 * premiers nombres : il est refusé. Tronquer ferait passer une préversion pour
 * la version finale, et annoncerait une mise à jour qui n'existe pas.
 *
 * @param {string} brut - Numéro de version, avec ou sans « v » initial
 * @returns {number[]|null} [majeur, mineur, correctif], ou null si illisible
 */
export function analyserVersion(brut) {
    if (typeof brut !== 'string') {
        return null;
    }

    const trouve = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(brut.trim());

    return trouve ? [Number(trouve[1]), Number(trouve[2]), Number(trouve[3])] : null;
}

/**
 * Compare deux numéros de version
 *
 * @param {number[]} a - Version décomposée
 * @param {number[]} b - Version décomposée
 * @returns {number} Négatif si a précède b, zéro si égales, positif sinon
 */
export function comparerVersions(a, b) {
    for (let rang = 0; rang < 3; rang += 1) {
        if (a[rang] !== b[rang]) {
            return a[rang] - b[rang];
        }
    }

    return 0;
}

/**
 * Une version publiée est-elle postérieure à celle qui tourne ?
 *
 * Faux dès qu'un doute subsiste : numéro illisible, version locale en avance —
 * ce qui est le cas normal quand on travaille sur main après un tag. Annoncer
 * une mise à jour qui n'en est pas une est plus coûteux que de se taire.
 *
 * @param {string} locale - Version de l'application qui tourne
 * @param {string} publiee - Version de la dernière release
 * @returns {boolean} Vrai s'il y a réellement plus récent
 */
export function miseAJourDisponible(locale, publiee) {
    const ici = analyserVersion(locale);
    const la = analyserVersion(publiee);

    if (!ici || !la) {
        return false;
    }

    return comparerVersions(la, ici) > 0;
}
