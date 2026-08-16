/**
 * Gestion des modales (modal de suppression, erreurs)
 */

import { state } from '../core/state.js';
import { logger, LOG_CATEGORIES } from '../utils/logger.js';
import { getProjectNameById } from '../business/dataProcessor.js';
import { handleConfirmDelete, handleKeepAllItems } from '../business/processor.js';

/**
 * Affiche la modal de confirmation de suppression
 * @param {Array<string>} projectIds - IDs des projets à supprimer
 * @param {Array} dataContext - Contexte de données
 */
export function showDeletionModal(projectIds, dataContext) {
    const overlay = document.getElementById('deletionModalOverlay');
    const listUL = document.getElementById('deletionList');

    if (!overlay || !listUL) {
        logger.error(LOG_CATEGORIES.MODAL, 'Modal elements not found');
        return;
    }

    logger.info(LOG_CATEGORIES.MODAL, 'Showing deletion modal', { projectCount: projectIds.length });

    // Remplir la liste des projets
    listUL.innerHTML = '';
    projectIds.forEach(id => {
        const listItem = document.createElement('li');
        listItem.textContent = getProjectNameById(id, dataContext);
        listUL.appendChild(listItem);
    });

    // Afficher la modal
    overlay.style.display = 'flex';

    // Configurer les boutons (une seule fois)
    setupModalButtons();
}

/**
 * Ferme la modal de suppression
 */
export function closeDeletionModal() {
    const overlay = document.getElementById('deletionModalOverlay');
    const listUL = document.getElementById('deletionList');

    if (overlay) overlay.style.display = 'none';
    if (listUL) listUL.innerHTML = '';

    logger.debug(LOG_CATEGORIES.MODAL, 'Deletion modal closed');
}

/**
 * Configure les boutons de la modal (une seule fois au chargement)
 */
function setupModalButtons() {
    const confirmBtn = document.getElementById('confirmDeleteBtn');
    const keepBtn = document.getElementById('keepItemsBtn');

    if (!confirmBtn || !keepBtn) {
        logger.error(LOG_CATEGORIES.MODAL, 'Modal buttons not found');
        return;
    }

    // Retirer les anciens listeners (si présents)
    const newConfirmBtn = confirmBtn.cloneNode(true);
    const newKeepBtn = keepBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
    keepBtn.parentNode.replaceChild(newKeepBtn, keepBtn);

    // Ajouter les nouveaux listeners
    newConfirmBtn.addEventListener('click', async () => {
        logger.info(LOG_CATEGORIES.MODAL, 'User confirmed deletion');

        const modalState = state.get('modal');
        const projectIdsToRemove = modalState.projectIdsToRemove;

        closeDeletionModal();

        try {
            await handleConfirmDelete(projectIdsToRemove);
        } catch (err) {
            logger.error(LOG_CATEGORIES.MODAL, 'Error during deletion', err);
            showError(`Erreur lors de la suppression: ${err.message}`);
        }
    });

    newKeepBtn.addEventListener('click', async () => {
        logger.info(LOG_CATEGORIES.MODAL, 'User chose to keep all items');

        closeDeletionModal();

        try {
            await handleKeepAllItems();
        } catch (err) {
            logger.error(LOG_CATEGORIES.MODAL, 'Error keeping items', err);
            showError(`Erreur: ${err.message}`);
        }
    });
}

/**
 * Affiche un message d'erreur
 * @param {string} message - Message d'erreur
 */
export function showError(message) {
    const errorDiv = document.getElementById('error');

    if (!errorDiv) {
        logger.error(LOG_CATEGORIES.UI, 'Error div not found');
        // Le seul console de l'application, et il est délibéré : l'endroit où
        // afficher le message a disparu, et le logger ci-dessus se tait au
        // niveau réglé pour la production. Sans cette ligne, l'erreur
        // n'apparaîtrait nulle part.
        // eslint-disable-next-line no-console
        console.error(message);
        return;
    }

    errorDiv.textContent = message;
    errorDiv.classList.remove('hidden');

    logger.error(LOG_CATEGORIES.UI, 'Error displayed to user', { message });
}

/**
 * Cache le message d'erreur
 */
export function hideError() {
    const errorDiv = document.getElementById('error');

    if (errorDiv) {
        errorDiv.classList.add('hidden');
    }
}
