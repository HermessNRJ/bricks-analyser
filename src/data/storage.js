/**
 * Gestion du Local Storage pour persister les données
 */

import { CONFIG } from '../core/config.js';
import { logger, LOG_CATEGORIES } from '../utils/logger.js';

/**
 * Charge les données depuis le Local Storage
 * @returns {Object|null} Objet {data, warnings, savedAt, statuts, revenus, capital} ou null si absent/invalide
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
            return { data: parsed, warnings: [], savedAt: null, statuts: {}, revenus: null, capital: null, apports: null };
        }

        // Nouveau format (objet avec data et warnings)
        if (parsed && typeof parsed === 'object' && Array.isArray(parsed.data)) {
            logger.info(LOG_CATEGORIES.STORAGE, 'Data loaded from localStorage', {
                entries: parsed.data.length,
                warnings: (parsed.warnings || []).length
            });
            return {
                data: parsed.data,
                warnings: parsed.warnings || [],
                // Absent des sauvegardes antérieures : l'âge est alors inconnu
                savedAt: parsed.savedAt || null,
                statuts: parsed.statuts || {},
                // Absent des sauvegardes antérieures : on retombe alors sur l'estimation
                revenus: parsed.revenus || null,
                capital: parsed.capital || null,
                apports: parsed.apports || null
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
 *
 * La date enregistrée est celle de la RÉCUPÉRATION auprès de Bricks, pas celle
 * de l'écriture : l'application réécrit le cache à chaque ouverture de page, et
 * l'horodater alors rajeunirait indéfiniment des données inchangées.
 *
 * @param {Array} data - Données à sauvegarder
 * @param {Array} warnings - Warnings à sauvegarder (optionnel)
 * @param {Object} [options]
 * @param {string} [options.dateRecuperation] - Date ISO d'un appel à l'API ;
 *   omise, la date déjà enregistrée est conservée
 * @param {Object} [options.statuts] - Suivis officiels de projet ; omis, ceux
 *   déjà enregistrés sont conservés
 * @param {Object} [options.revenus] - Historique des revenus versés ; omis,
 *   celui déjà enregistré est conservé
 * @param {Object} [options.capital] - Remboursements de capital ; omis, celui
 *   déjà enregistré est conservé
 * @param {Object} [options.apports] - Versements personnels ; omis, ceux déjà
 *   enregistrés sont conservés
 * @returns {boolean} true si succès, false sinon
 */
export function saveToLocalStorage(data, warnings = [], { dateRecuperation, statuts, revenus, capital, apports } = {}) {
    if (!Array.isArray(data)) {
        logger.error(LOG_CATEGORIES.STORAGE, 'Cannot save non-array data to localStorage');
        return false;
    }

    try {
        // La date de récupération permet de dire à l'écran de quand datent les
        // chiffres : sans elle, rien ne distingue un portefeuille chargé ce
        // matin d'un autre vieux de trois semaines.
        const storageObject = {
            data: data,
            warnings: warnings || [],
            savedAt: dateRecuperation || lireDateRecuperation() || new Date().toISOString(),
            statuts: statuts || lireStatuts(),
            revenus: revenus || lireRevenus(),
            capital: capital || lireCapital(),
            apports: apports || lireApports()
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
 * Relit la date de récupération déjà enregistrée
 * @returns {string|null} Date ISO, ou null si absente ou illisible
 */
function lireDateRecuperation() {
    try {
        const stored = localStorage.getItem(CONFIG.LOCAL_STORAGE_KEY);
        return stored ? (JSON.parse(stored).savedAt || null) : null;
    } catch {
        return null;
    }
}

/**
 * Relit les suivis de projet déjà enregistrés
 * @returns {Object} Statuts indexés par identifiant, vide si absents
 */
function lireStatuts() {
    try {
        const stored = localStorage.getItem(CONFIG.LOCAL_STORAGE_KEY);
        return stored ? (JSON.parse(stored).statuts || {}) : {};
    } catch {
        return {};
    }
}

/**
 * Relit l'historique des revenus déjà enregistré
 * @returns {Object|null} Historique normalisé, null s'il est absent ou illisible
 */
function lireRevenus() {
    try {
        const stored = localStorage.getItem(CONFIG.LOCAL_STORAGE_KEY);
        return stored ? (JSON.parse(stored).revenus || null) : null;
    } catch {
        return null;
    }
}

/**
 * Relit les remboursements de capital déjà enregistrés
 * @returns {Object|null} Cumuls normalisés, null s'ils sont absents ou illisibles
 */
function lireCapital() {
    try {
        const stored = localStorage.getItem(CONFIG.LOCAL_STORAGE_KEY);
        return stored ? (JSON.parse(stored).capital || null) : null;
    } catch {
        return null;
    }
}

/**
 * Relit les versements personnels déjà enregistrés
 * @returns {Object|null} Cumuls normalisés, null s'ils sont absents ou illisibles
 */
function lireApports() {
    try {
        const stored = localStorage.getItem(CONFIG.LOCAL_STORAGE_KEY);
        return stored ? (JSON.parse(stored).apports || null) : null;
    } catch {
        return null;
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
