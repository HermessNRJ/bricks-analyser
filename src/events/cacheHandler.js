/**
 * Gestionnaire du bouton de réinitialisation du cache
 */

import { clearLocalStorage } from '../data/storage.js';
import { logger, LOG_CATEGORIES } from '../utils/logger.js';

/**
 * Configure le bouton de reset du cache
 */
export function setupResetCache() {
    const resetBtn = document.getElementById('resetCacheBtn');

    if (!resetBtn) {
        logger.warn(LOG_CATEGORIES.EVENT, 'Reset cache button not found');
        return;
    }

    resetBtn.addEventListener('click', () => {
        const confirmed = confirm('Êtes-vous sûr de vouloir effacer toutes les données stockées localement ? Cette action est irréversible.');

        if (confirmed) {
            logger.info(LOG_CATEGORIES.EVENT, 'User confirmed cache reset');
            clearLocalStorage();
            location.reload();
        } else {
            logger.debug(LOG_CATEGORIES.EVENT, 'User cancelled cache reset');
        }
    });

    logger.debug(LOG_CATEGORIES.EVENT, 'Reset cache handler configured');
}
