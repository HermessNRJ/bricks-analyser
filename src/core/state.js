/**
 * Gestionnaire d'état centralisé de l'application
 * Remplace les variables globales (allData, chart instances, etc.)
 * Implémente un pattern pub/sub pour la réactivité
 */

import { logger, LOG_CATEGORIES } from '../utils/logger.js';
import { CONFIG } from './config.js';

class AppState {
    constructor() {
        this._state = {
            // Données principales
            allData: [],
            lastResults: null,

            // Instances de charts Chart.js
            charts: {
                investment: null,
                origineFonds: null,
                arrieres: null,
                statuts: null,
                revenueEvolution: null,
                taxAmount: null,
                treemap: null,

                forecast: null
            },

            // État de la modal de suppression
            modal: {
                isOpen: false,
                projectIdsToRemove: [],
                dataContext: null
            },

            // État de l'interface
            ui: {
                resultsVisible: false,
                loading: false,
                error: null
            }
        };

        // Subscribers pour les changements d'état
        // Format: { 'allData': [callback1, callback2], ... }
        this._subscribers = {};

        logger.debug(LOG_CATEGORIES.UI, 'AppState initialized');
    }

    /**
     * Récupère une valeur de l'état
     * @param {string} key - Clé de l'état (ex: 'allData', 'charts', 'modal')
     * @returns {*} Valeur de l'état
     */
    get(key) {
        if (!(key in this._state)) {
            logger.warn(LOG_CATEGORIES.UI, `State key not found: ${key}`);
            return undefined;
        }
        return this._state[key];
    }

    /**
     * Définit une valeur dans l'état et notifie les subscribers
     * @param {string} key - Clé de l'état
     * @param {*} value - Nouvelle valeur
     */
    set(key, value) {
        const oldValue = this._state[key];

        // Mise à jour de l'état
        this._state[key] = value;

        // Notification des subscribers
        this._notify(key, value, oldValue);

        logger.debug(LOG_CATEGORIES.UI, `State updated: ${key}`);
    }

    /**
     * Met à jour partiellement un objet dans l'état
     * Utile pour modal, ui, charts où on veut modifier une propriété sans écraser l'objet
     * @param {string} key - Clé de l'état (ex: 'modal')
     * @param {object} partialValue - Propriétés à mettre à jour
     */
    update(key, partialValue) {
        if (!(key in this._state)) {
            logger.warn(LOG_CATEGORIES.UI, `Cannot update non-existent state key: ${key}`);
            return;
        }

        const oldValue = this._state[key];

        // Un tableau est un objet : sans ce garde-fou, une fusion le transformerait
        // silencieusement en objet simple (ex: allData deviendrait inexploitable).
        if (typeof oldValue !== 'object' || oldValue === null || Array.isArray(oldValue)) {
            logger.warn(LOG_CATEGORIES.UI, `Cannot partial update non-object state: ${key}`);
            return;
        }

        // Fusion avec l'état existant
        this._state[key] = { ...oldValue, ...partialValue };

        this._notify(key, this._state[key], oldValue);

        logger.debug(LOG_CATEGORIES.UI, `State partially updated: ${key}`, partialValue);
    }

    /**
     * S'abonne aux changements d'une clé spécifique
     * @param {string} key - Clé à surveiller
     * @param {Function} callback - Fonction appelée lors du changement (newValue, oldValue)
     * @returns {Function} Fonction de désabonnement
     */
    subscribe(key, callback) {
        if (!this._subscribers[key]) {
            this._subscribers[key] = [];
        }

        this._subscribers[key].push(callback);

        logger.debug(LOG_CATEGORIES.UI, `New subscriber for: ${key}`, {
            subscribersCount: this._subscribers[key].length
        });

        // Retourne une fonction pour se désabonner
        return () => this._unsubscribe(key, callback);
    }

    /**
     * Se désabonne d'une clé
     * @private
     */
    _unsubscribe(key, callback) {
        if (!this._subscribers[key]) {
            return;
        }

        this._subscribers[key] = this._subscribers[key].filter(cb => cb !== callback);

        logger.debug(LOG_CATEGORIES.UI, `Unsubscribed from: ${key}`, {
            subscribersCount: this._subscribers[key].length
        });
    }

    /**
     * Notifie tous les subscribers d'un changement
     * @private
     */
    _notify(key, newValue, oldValue) {
        if (!this._subscribers[key] || this._subscribers[key].length === 0) {
            return;
        }

        logger.debug(LOG_CATEGORIES.UI, `Notifying ${this._subscribers[key].length} subscribers for: ${key}`);

        this._subscribers[key].forEach(callback => {
            try {
                callback(newValue, oldValue);
            } catch (err) {
                logger.error(LOG_CATEGORIES.UI, `Error in subscriber callback for ${key}`, err);
            }
        });
    }

    /**
     * Réinitialise l'état à ses valeurs par défaut
     */
    reset() {
        logger.info(LOG_CATEGORIES.UI, 'Resetting application state');

        this._state = {
            allData: [],
            charts: {
                investment: null,
                origineFonds: null,
                arrieres: null,
                statuts: null,
                revenueEvolution: null,
                taxAmount: null,
                treemap: null,

                forecast: null
            },
            modal: {
                isOpen: false,
                projectIdsToRemove: [],
                dataContext: null
            },
            ui: {
                resultsVisible: false,
                loading: false,
                error: null
            }
        };

        // Notifier tous les subscribers
        Object.keys(this._subscribers).forEach(key => {
            this._notify(key, this._state[key], undefined);
        });
    }

    /**
     * Récupère tout l'état (pour debug)
     * @returns {object} État complet
     */
    getAll() {
        return { ...this._state };
    }
}

// Instance singleton exportée
export const state = new AppState();

// Exposer dans window pour debug en console (uniquement en mode debug)
// Note : l'application est servie sans bundler, import.meta.env n'existe pas ici,
// c'est CONFIG.DEBUG qui pilote l'exposition.
if (typeof window !== 'undefined' && CONFIG.DEBUG) {
    window.__appState__ = state;
}
