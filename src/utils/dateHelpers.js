/**
 * Utilitaires pour la manipulation de dates au format YYYY-MM
 */

/**
 * Ajoute un nombre de mois à une date au format YYYY-MM
 * @param {string} yyyymm - Date au format YYYY-MM
 * @param {number} monthsToAdd - Nombre de mois à ajouter (peut être négatif)
 * @returns {string|null} Nouvelle date au format YYYY-MM, ou null si invalide
 */
export function addMonthsToYYYYMM(yyyymm, monthsToAdd) {
    if (!yyyymm || !yyyymm.includes('-')) {
        return null;
    }

    let [year, month] = yyyymm.split('-').map(Number);

    if (isNaN(year) || isNaN(month)) {
        return null;
    }

    month += monthsToAdd;

    // Ajuster l'année si le mois dépasse 12 ou devient négatif
    while (month > 12) {
        month -= 12;
        year++;
    }
    while (month <= 0) {
        month += 12;
        year--;
    }

    return `${year}-${String(month).padStart(2, '0')}`;
}

/**
 * Génère une liste de mois entre deux dates (inclus)
 * @param {string} startYYYYMM - Date de début au format YYYY-MM
 * @param {string} endYYYYMM - Date de fin au format YYYY-MM
 * @returns {string[]} Tableau de dates au format YYYY-MM
 */
export function generateMonthRange(startYYYYMM, endYYYYMM) {
    const months = [];

    if (!startYYYYMM || !endYYYYMM) {
        return months;
    }

    let [currentYear, currentMonth] = startYYYYMM.split('-').map(Number);
    const [endYear, endMonth] = endYYYYMM.split('-').map(Number);

    if (isNaN(currentYear) || isNaN(currentMonth) || isNaN(endYear) || isNaN(endMonth)) {
        return months;
    }

    // Protection contre les boucles infinies
    const maxIterations = 1200; // 100 ans max
    let iterations = 0;

    while ((currentYear < endYear || (currentYear === endYear && currentMonth <= endMonth)) && iterations < maxIterations) {
        months.push(`${currentYear}-${String(currentMonth).padStart(2, '0')}`);

        currentMonth++;
        if (currentMonth > 12) {
            currentMonth = 1;
            currentYear++;
        }

        iterations++;
    }

    return months;
}

/**
 * Obtient le mois actuel au format YYYY-MM
 * @returns {string} Mois actuel au format YYYY-MM
 */
export function getCurrentMonthYYYYMM() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1; // getMonth() retourne 0-11
    return `${year}-${String(month).padStart(2, '0')}`;
}

/**
 * Calcule la date de remboursement estimée
 * @param {string} revenueStartDate - Date de début des revenus (format YYYY-MM)
 * @param {number} investmentHorizonInMonths - Durée de l'investissement en mois
 * @returns {string|null} Date estimée de remboursement (format YYYY-MM) ou null
 */
export function calculateRefundDate(revenueStartDate, investmentHorizonInMonths) {
    if (!revenueStartDate || !investmentHorizonInMonths) {
        return null;
    }

    // Vérifier le format YYYY-MM
    if (!revenueStartDate.match(/^\d{4}-\d{2}$/)) {
        return null;
    }

    return addMonthsToYYYYMM(revenueStartDate, investmentHorizonInMonths);
}

/**
 * Compare deux dates au format YYYY-MM
 * @param {string} date1 - Première date
 * @param {string} date2 - Deuxième date
 * @returns {number} -1 si date1 < date2, 0 si égales, 1 si date1 > date2
 */
export function compareYYYYMM(date1, date2) {
    if (date1 === date2) return 0;
    return date1 < date2 ? -1 : 1;
}

/**
 * Vérifie si une date YYYY-MM est valide
 * @param {string} yyyymm - Date à valider
 * @returns {boolean} true si valide
 */
export function isValidYYYYMM(yyyymm) {
    if (!yyyymm || typeof yyyymm !== 'string') {
        return false;
    }

    const regex = /^\d{4}-\d{2}$/;
    if (!regex.test(yyyymm)) {
        return false;
    }

    const [year, month] = yyyymm.split('-').map(Number);
    return year > 1900 && year < 2100 && month >= 1 && month <= 12;
}
