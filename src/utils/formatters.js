/**
 * Fonctions de formatage pour nombres et devises
 */

/**
 * Formate un nombre en devise (euros)
 * @param {number} value - Valeur à formater
 * @param {number} decimals - Nombre de décimales (défaut: 2)
 * @returns {string} Valeur formatée (ex: "1 234,56€")
 */
export function formatCurrency(value, decimals = 2) {
    if (value === null || value === undefined || isNaN(value)) {
        return '0€';
    }

    return value.toLocaleString('fr-FR', {
        style: 'currency',
        currency: 'EUR',
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    });
}

/**
 * Formate un nombre avec séparateurs de milliers
 * @param {number} value - Valeur à formater
 * @param {number} decimals - Nombre de décimales (défaut: 0)
 * @returns {string} Valeur formatée (ex: "1 234")
 */
export function formatNumber(value, decimals = 0) {
    if (value === null || value === undefined || isNaN(value)) {
        return '0';
    }

    return value.toLocaleString('fr-FR', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    });
}

/**
 * Formate un pourcentage
 * @param {number} value - Valeur à formater (ex: 5.67 pour 5.67%)
 * @param {number} decimals - Nombre de décimales (défaut: 1)
 * @returns {string} Pourcentage formaté (ex: "5,7%")
 */
export function formatPercentage(value, decimals = 1) {
    if (value === null || value === undefined || isNaN(value)) {
        return formatPercentage(0, decimals);
    }

    // Le style « percent » d'Intl place l'espace insécable avant le signe,
    // comme l'exige la typographie française — ce que « 5.7% » ne fait pas.
    return new Intl.NumberFormat('fr-FR', {
        style: 'percent',
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    }).format(value / 100);
}

/**
 * Formate un nombre de briques
 * @param {number} bricks - Nombre de briques
 * @returns {string} Nombre formaté avec séparateurs
 */
export function formatBricks(bricks) {
    return formatNumber(bricks, 0);
}

/**
 * Tronque un texte long avec ellipse
 * @param {string} text - Texte à tronquer
 * @param {number} maxLength - Longueur maximale
 * @returns {string} Texte tronqué
 */
export function truncate(text, maxLength = 20) {
    if (!text || text.length <= maxLength) {
        return text || '';
    }
    return text.substring(0, maxLength) + '...';
}

/**
 * Formate un nom de mois YYYY-MM en texte lisible
 * @param {string} yyyymm - Date au format YYYY-MM
 * @returns {string} Texte formaté (ex: "Janvier 2024")
 */
export function formatMonthName(yyyymm) {
    if (!yyyymm || !yyyymm.includes('-')) {
        return yyyymm || '';
    }

    const [year, month] = yyyymm.split('-');
    const monthNames = [
        'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
        'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
    ];

    const monthIndex = parseInt(month, 10) - 1;
    if (monthIndex < 0 || monthIndex > 11) {
        return yyyymm;
    }

    return `${monthNames[monthIndex]} ${year}`;
}
