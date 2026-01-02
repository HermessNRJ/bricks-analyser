/**
 * Gestion du Local Storage pour persister les données
 */

import { CONFIG } from '../core/config.js';
import { logger, LOG_CATEGORIES } from '../utils/logger.js';

/**
 * Charge les données depuis le Local Storage
 * @returns {Array|null} Données parsées ou null si absentes/invalides
 */
export function loadFromLocalStorage() {
    try {
        const stored = localStorage.getItem(CONFIG.LOCAL_STORAGE_KEY);

        if (!stored) {
            logger.info(LOG_CATEGORIES.STORAGE, 'No data found in localStorage');
            return null;
        }

        const parsed = JSON.parse(stored);

        // Validation basique
        if (!Array.isArray(parsed)) {
            logger.warn(LOG_CATEGORIES.STORAGE, 'Stored data is not an array, clearing');
            localStorage.removeItem(CONFIG.LOCAL_STORAGE_KEY);
            return null;
        }

        logger.info(LOG_CATEGORIES.STORAGE, 'Data loaded from localStorage', {
            entries: parsed.length
        });

        return parsed;

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
 * @returns {boolean} true si succès, false sinon
 */
export function saveToLocalStorage(data) {
    if (!Array.isArray(data)) {
        logger.error(LOG_CATEGORIES.STORAGE, 'Cannot save non-array data to localStorage');
        return false;
    }

    try {
        const jsonData = JSON.stringify(data);
        localStorage.setItem(CONFIG.LOCAL_STORAGE_KEY, jsonData);

        logger.info(LOG_CATEGORIES.STORAGE, 'Data saved to localStorage', {
            entries: data.length,
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
