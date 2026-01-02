/**
 * Parsing des fichiers JSON uploadés
 */

import { logger, LOG_CATEGORIES } from '../utils/logger.js';

/**
 * Parse un fichier JSON
 * @param {File} file - Fichier à parser
 * @returns {Promise<Object>} Données parsées
 * @throws {Error} Si le parsing échoue
 */
export function parseJSONFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = (e) => {
            try {
                const rawText = e.target.result;

                logger.debug(LOG_CATEGORIES.FILE_PARSE, 'File content loaded', {
                    length: rawText.length,
                    preview: rawText.substring(0, 100) + '...'
                });

                // Nettoyer le texte
                const cleanText = rawText.trim();

                // Vérifier que c'est du JSON valide
                if (!cleanText.startsWith('[') && !cleanText.startsWith('{')) {
                    throw new Error('Le fichier ne semble pas être un JSON valide');
                }

                // Parser le JSON
                const data = JSON.parse(cleanText);

                logger.info(LOG_CATEGORIES.FILE_PARSE, 'JSON parsed successfully', {
                    type: Array.isArray(data) ? 'array' : typeof data,
                    length: Array.isArray(data) ? data.length : 'N/A'
                });

                resolve(data);

            } catch (err) {
                logger.error(LOG_CATEGORIES.FILE_PARSE, 'JSON parse error', err);
                reject(new Error(`Erreur de parsing JSON: ${err.message}`));
            }
        };

        reader.onerror = () => {
            const error = new Error('Erreur lors de la lecture du fichier');
            logger.error(LOG_CATEGORIES.FILE_PARSE, 'File read error', error);
            reject(error);
        };

        // Lire le fichier en texte UTF-8
        reader.readAsText(file, 'UTF-8');

        logger.debug(LOG_CATEGORIES.FILE_PARSE, 'Started reading file', {
            name: file.name,
            size: `${(file.size / 1024).toFixed(2)} KB`,
            type: file.type
        });
    });
}

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
