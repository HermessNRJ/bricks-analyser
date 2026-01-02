/**
 * Gestion du Local Storage pour persister les données
 */

import { CONFIG } from '../core/config.js';
import { logger, LOG_CATEGORIES } from '../utils/logger.js';

/**
 * Charge les données depuis le Local Storage
 * @returns {Object|null} Objet contenant {data, warnings} ou null si absent/invalide
 */
export function loadFromLocalStorage() {
    try {
        const stored = localStorage.getItem(CONFIG.LOCAL_STORAGE_KEY);

        if (!stored) {
            logger.info(LOG_CATEGORIES.STORAGE, 'No data found in localStorage');
            return null;
        }

        const parsed = JSON.parse(stored);

        // Compatibilité avec l'ancien format (array direct)
        if (Array.isArray(parsed)) {
            logger.info(LOG_CATEGORIES.STORAGE, 'Legacy format detected, converting', {
                entries: parsed.length
            });
            return { data: parsed, warnings: [] };
        }

        // Nouveau format (objet avec data et warnings)
        if (parsed && typeof parsed === 'object' && Array.isArray(parsed.data)) {
            logger.info(LOG_CATEGORIES.STORAGE, 'Data loaded from localStorage', {
                entries: parsed.data.length,
                warnings: (parsed.warnings || []).length
            });
            return {
                data: parsed.data,
                warnings: parsed.warnings || []
            };
        }

        // Format invalide
        logger.warn(LOG_CATEGORIES.STORAGE, 'Invalid stored data format, clearing');
        localStorage.removeItem(CONFIG.LOCAL_STORAGE_KEY);
        return null;

    } catch (err) {
        logger.error(LOG_CATEGORIES.STORAGE, 'Failed to load from localStorage', err);
        // En cas d'erreur, nettoyer les données corrompues
        localStorage.removeItem(CONFIG.LOCAL_STORAGE_KEY);
        return null;
    }
}

/**
 * Sauvegarde les données dans le Local Storage
 * @param {Array} data - Données à sauvegarder
 * @param {Array} warnings - Warnings à sauvegarder (optionnel)
 * @returns {boolean} true si succès, false sinon
 */
export function saveToLocalStorage(data, warnings = []) {
    if (!Array.isArray(data)) {
        logger.error(LOG_CATEGORIES.STORAGE, 'Cannot save non-array data to localStorage');
        return false;
    }

    try {
        const storageObject = {
            data: data,
            warnings: warnings || []
        };
        const jsonData = JSON.stringify(storageObject);
        localStorage.setItem(CONFIG.LOCAL_STORAGE_KEY, jsonData);

        logger.info(LOG_CATEGORIES.STORAGE, 'Data saved to localStorage', {
            entries: data.length,
            warnings: warnings.length,
            size: `${(jsonData.length / 1024).toFixed(2)} KB`
        });

        return true;

    } catch (err) {
        logger.error(LOG_CATEGORIES.STORAGE, 'Failed to save to localStorage', err);

        // Si l'erreur est due au quota dépassé
        if (err.name === 'QuotaExceededError') {
            logger.error(LOG_CATEGORIES.STORAGE, 'LocalStorage quota exceeded');
        }

        return false;
    }
}

/**
 * Efface toutes les données du Local Storage
 */
export function clearLocalStorage() {
    try {
        localStorage.removeItem(CONFIG.LOCAL_STORAGE_KEY);
        logger.info(LOG_CATEGORIES.STORAGE, 'LocalStorage cleared');
        return true;
    } catch (err) {
        logger.error(LOG_CATEGORIES.STORAGE, 'Failed to clear localStorage', err);
        return false;
    }
}

/**
 * Vérifie si des données existent dans le Local Storage
 * @returns {boolean} true si des données existent
 */
export function hasStoredData() {
    return localStorage.getItem(CONFIG.LOCAL_STORAGE_KEY) !== null;
}
