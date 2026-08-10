/**
 * Validation du format des données Bricks
 *
 * Le chargement se fait désormais par l'API : il ne reste ici que le contrôle
 * de forme appliqué aux données reçues avant traitement.
 */

import { logger, LOG_CATEGORIES } from '../utils/logger.js';

/**
 * Valide la structure des données Bricks
 * @param {Array} data - Données à valider
 * @returns {Object} { valid: boolean, errors: string[] }
 */
export function validateBricksData(data) {
    const errors = [];

    if (!Array.isArray(data)) {
        errors.push('Les données doivent être un tableau');
        return { valid: false, errors };
    }

    if (data.length === 0) {
        errors.push('Le tableau de données est vide');
        return { valid: false, errors };
    }

    // Vérifier la structure de chaque entrée
    for (let i = 0; i < data.length; i++) {
        const entry = data[i];

        if (!entry.yearMonthDate) {
            errors.push(`Entrée ${i}: yearMonthDate manquant`);
        }

        if (!entry.projects || !Array.isArray(entry.projects)) {
            errors.push(`Entrée ${i}: projects manquant ou invalide`);
        }
    }

    const valid = errors.length === 0;

    if (valid) {
        logger.info(LOG_CATEGORIES.FILE_PARSE, 'Data validation passed', {
            entries: data.length
        });
    } else {
        logger.warn(LOG_CATEGORIES.FILE_PARSE, 'Data validation failed', {
            errorCount: errors.length,
            errors
        });
    }

    return { valid, errors };
}
