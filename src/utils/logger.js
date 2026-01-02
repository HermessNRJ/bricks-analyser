/**
 * Système de logging centralisé avec niveaux et catégories
 */

import { CONFIG } from '../core/config.js';

const LOG_LEVELS = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
    off: 4
};

class Logger {
    constructor() {
        this.level = CONFIG.LOG_LEVEL || 'debug';
        this.enabledCategories = new Set();
        this.allCategoriesEnabled = true; // Par défaut, toutes les catégories sont actives
    }

    /**
     * Définir le niveau de log minimum
     * @param {string} level - 'debug', 'info', 'warn', 'error', 'off'
     */
    setLevel(level) {
        if (LOG_LEVELS[level] !== undefined) {
            this.level = level;
        } else {
            console.warn(`Niveau de log invalide: ${level}`);
        }
    }

    /**
     * Activer des catégories spécifiques
     * @param {...string} categories - Liste des catégories à activer
     */
    enableCategories(...categories) {
        this.allCategoriesEnabled = false;
        categories.forEach(cat => this.enabledCategories.add(cat));
    }

    /**
     * Désactiver des catégories
     * @param {...string} categories - Liste des catégories à désactiver
     */
    disableCategories(...categories) {
        categories.forEach(cat => this.enabledCategories.delete(cat));
    }

    /**
     * Réactiver toutes les catégories
     */
    enableAllCategories() {
        this.allCategoriesEnabled = true;
        this.enabledCategories.clear();
    }

    /**
     * Vérifie si un log doit être affiché
     * @private
     */
    _shouldLog(level, category) {
        // Vérifier le niveau
        if (LOG_LEVELS[level] < LOG_LEVELS[this.level]) {
            return false;
        }

        // Vérifier la catégorie
        if (!this.allCategoriesEnabled && !this.enabledCategories.has(category)) {
            return false;
        }

        return true;
    }

    /**
     * Formater le message de log
     * @private
     */
    _format(category, message, data) {
        const timestamp = new Date().toISOString().substr(11, 12); // HH:MM:SS.mmm
        let output = `[${timestamp}] [${category}] ${message}`;

        if (data !== undefined && data !== null) {
            if (typeof data === 'object') {
                output += '\n' + JSON.stringify(data, null, 2);
            } else {
                output += ` ${data}`;
            }
        }

        return output;
    }

    /**
     * Log de debug (détails techniques)
     * @param {string} category - Catégorie du log (ex: 'CALC_STATS', 'API', 'STORAGE')
     * @param {string} message - Message principal
     * @param {*} data - Données optionnelles à logger
     */
    debug(category, message, data) {
        if (this._shouldLog('debug', category)) {
            console.log(this._format(category, message, data));
        }
    }

    /**
     * Log d'information
     * @param {string} category - Catégorie du log
     * @param {string} message - Message principal
     * @param {*} data - Données optionnelles
     */
    info(category, message, data) {
        if (this._shouldLog('info', category)) {
            console.info(this._format(category, message, data));
        }
    }

    /**
     * Log d'avertissement
     * @param {string} category - Catégorie du log
     * @param {string} message - Message principal
     * @param {*} data - Données optionnelles
     */
    warn(category, message, data) {
        if (this._shouldLog('warn', category)) {
            console.warn(this._format(category, message, data));
        }
    }

    /**
     * Log d'erreur
     * @param {string} category - Catégorie du log
     * @param {string} message - Message d'erreur
     * @param {*} error - Objet erreur ou données
     */
    error(category, message, error) {
        if (this._shouldLog('error', category)) {
            console.error(this._format(category, message, error));
        }
    }
}

// Instance singleton
export const logger = new Logger();

// Catégories communes (pour référence)
export const LOG_CATEGORIES = {
    STORAGE: 'STORAGE',
    API: 'API',
    FILE_PARSE: 'FILE_PARSE',
    DATA_MERGE: 'DATA_MERGE',
    CALC_STATS: 'CALC_STATS',
    CHART: 'CHART',
    UI: 'UI',
    EVENT: 'EVENT',
    MODAL: 'MODAL'
};
