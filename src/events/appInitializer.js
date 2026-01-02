/**
 * Point d'entrée principal de l'application
 * Initialise tous les gestionnaires d'événements et charge les données
 */

import { state } from '../core/state.js';
import { logger, LOG_CATEGORIES } from '../utils/logger.js';
import { loadFromLocalStorage } from '../data/storage.js';
import { finalizeProcessing } from '../business/processor.js';
import { createCharts } from '../charts/chartManager.js';
import { updateUI, showResults } from '../ui/uiUpdater.js';
import { showDeletionModal } from '../ui/modals.js';
import { resizeAllCharts } from '../charts/chartManager.js';
import { setupFileUploadHandler } from './fileUploadHandler.js';
import { setupAPIHandler } from './apiHandler.js';
import { setupScrollToTop } from './scrollHandler.js';
import { setupResetCache } from './cacheHandler.js';
import { updatePropertySortAndFilter } from '../ui/uiUpdater.js';

/**
 * Initialise l'application au chargement de la page
 */
function initializeApp() {
    logger.info(LOG_CATEGORIES.EVENT, 'Initializing Bricks Analyser application');

    // Configurer tous les gestionnaires d'événements
    setupFileUploadHandler();
    setupAPIHandler();
    setupScrollToTop();
    setupResetCache();
    setupPropertyControls();

    // S'abonner aux changements d'état pour mettre à jour l'UI
    subscribeToStateChanges();

    // Gérer le resize window pour les charts
    window.addEventListener('resize', () => {
        resizeAllCharts();
    });

    // Charger les données depuis localStorage si disponibles
    loadInitialData();

    logger.info(LOG_CATEGORIES.EVENT, 'Application initialized successfully');
}

/**
 * S'abonne aux changements d'état pour mettre à jour l'UI automatiquement
 */
function subscribeToStateChanges() {
    // Quand la modal doit s'ouvrir
    state.subscribe('modal', (newModalState) => {
        if (newModalState.isOpen && newModalState.projectIdsToRemove.length > 0) {
            showDeletionModal(newModalState.projectIdsToRemove, newModalState.dataContext);
        }
    });

    // Quand l'UI doit afficher les résultats
    state.subscribe('ui', (newUIState) => {
        if (newUIState.resultsVisible) {
            showResults();
        }
    });

    logger.debug(LOG_CATEGORIES.EVENT, 'State subscriptions configured');
}

/**
 * Configure les contrôles de tri et filtrage des propriétés
 */
function setupPropertyControls() {
    const sortBySelect = document.getElementById('propertySortBy');
    const filterSelect = document.getElementById('propertyFilter');

    if (sortBySelect) {
        // Charger l'état depuis localStorage
        const savedSortBy = localStorage.getItem('propertySortBy') || 'investment-desc';
        sortBySelect.value = savedSortBy;

        // Écouter les changements
        sortBySelect.addEventListener('change', (e) => {
            const sortBy = e.target.value;
            updatePropertySortAndFilter(sortBy, undefined);
        });

        logger.debug(LOG_CATEGORIES.EVENT, 'Property sort control configured', { sortBy: savedSortBy });
    }

    if (filterSelect) {
        // Charger l'état depuis localStorage
        const savedFilter = localStorage.getItem('propertyFilter') || 'all';
        filterSelect.value = savedFilter;

        // Écouter les changements
        filterSelect.addEventListener('change', (e) => {
            const filter = e.target.value;
            updatePropertySortAndFilter(undefined, filter);
        });

        logger.debug(LOG_CATEGORIES.EVENT, 'Property filter control configured', { filter: savedFilter });
    }
}

/**
 * Charge les données initiales depuis localStorage
 */
async function loadInitialData() {
    const cachedData = loadFromLocalStorage();

    if (cachedData && cachedData.length > 0) {
        logger.info(LOG_CATEGORIES.EVENT, 'Loading cached data from localStorage', {
            entries: cachedData.length
        });

        try {
            // Utiliser finalizeProcessing pour traiter les données
            const results = await finalizeProcessing(cachedData);

            // Mettre à jour l'UI et créer les charts
            updateUI(results);
            createCharts(results);
            showResults();

            logger.info(LOG_CATEGORIES.EVENT, 'Cached data loaded and displayed');
        } catch (err) {
            logger.error(LOG_CATEGORIES.EVENT, 'Error loading cached data', err);
        }
    } else {
        logger.info(LOG_CATEGORIES.EVENT, 'No cached data found');
    }
}

// Démarrer l'application quand le DOM est prêt
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    // DOM déjà chargé
    initializeApp();
}
