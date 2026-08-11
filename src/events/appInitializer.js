/**
 * Point d'entrée principal de l'application
 * Initialise tous les gestionnaires d'événements et charge les données
 */

import { state } from '../core/state.js';
import { logger, LOG_CATEGORIES } from '../utils/logger.js';
import { loadFromLocalStorage } from '../data/storage.js';
import { finalizeProcessing } from '../business/processor.js';
import { showDeletionModal } from '../ui/modals.js';
import { resizeAllCharts } from '../charts/chartManager.js';
import { initPeriodeGraphiques } from '../ui/periodeGraphiques.js';
import { redessinerSeriesDatees } from '../charts/chartManager.js';
import { setupForecastHandler } from './forecastHandler.js';
import { setupStatusHandler } from './statusHandler.js';
import { setupAPIHandler } from './apiHandler.js';
import { setupScrollToTop } from './scrollHandler.js';
import { setupResetCache } from './cacheHandler.js';
import { updatePropertySortAndFilter, showResults, setSearch, changePage } from '../ui/uiUpdater.js';
import { afficherAgeDonnees } from '../ui/dataAge.js';

/**
 * Initialise l'application au chargement de la page
 */
function initializeApp() {
    logger.info(LOG_CATEGORIES.EVENT, 'Initializing Bricks Analyser application');

    // Configurer tous les gestionnaires d'événements
    setupAPIHandler();
    setupScrollToTop();
    setupResetCache();
    setupPropertyControls();
    setupSearchControl();
    setupPaginationControls();
    setupPeriodeControl();
    setupForecastHandler();
    setupStatusHandler();
    setupRiskShortcuts();

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
    const warningFilterSelect = document.getElementById('propertyWarningFilter');

    if (sortBySelect) {
        // Charger l'état depuis localStorage
        const savedSortBy = localStorage.getItem('propertySortBy') || 'investment-desc';
        sortBySelect.value = savedSortBy;

        // Écouter les changements
        sortBySelect.addEventListener('change', (e) => {
            const sortBy = e.target.value;
            updatePropertySortAndFilter({ sortBy });
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
            updatePropertySortAndFilter({ filter });
        });

        logger.debug(LOG_CATEGORIES.EVENT, 'Property filter control configured', { filter: savedFilter });
    }


    if (warningFilterSelect) {
        // Charger l'état depuis localStorage
        const savedWarningFilter = localStorage.getItem('propertyWarningFilter') || 'all';
        warningFilterSelect.value = savedWarningFilter;

        // Écouter les changements
        warningFilterSelect.addEventListener('change', (e) => {
            const warningFilter = e.target.value;
            updatePropertySortAndFilter({ warningFilter });
        });

        logger.debug(LOG_CATEGORIES.EVENT, 'Property warning filter control configured', { warningFilter: savedWarningFilter });
    }

    const countryFilterSelect = document.getElementById('propertyCountryFilter');
    if (countryFilterSelect) {
        // Charger l'état depuis localStorage
        const savedCountryFilter = localStorage.getItem('propertyCountryFilter') || 'all';
        countryFilterSelect.value = savedCountryFilter;

        // Écouter les changements
        countryFilterSelect.addEventListener('change', (e) => {
            const countryFilter = e.target.value;
            updatePropertySortAndFilter({ countryFilter });
        });

        logger.debug(LOG_CATEGORIES.EVENT, 'Property country filter control configured', { countryFilter: savedCountryFilter });
    }
}

/**
 * Rend les tuiles d'incident cliquables : elles filtrent le registre
 * Un chiffre déduit doit pouvoir être vérifié sur pièces.
 */
function setupRiskShortcuts() {
    document.querySelectorAll('[data-risque]').forEach(tuile => {
        tuile.addEventListener('click', () => {
            const filtre = `risk-${tuile.dataset.risque}`;

            updatePropertySortAndFilter({ warningFilter: filtre });

            const select = document.getElementById('propertyWarningFilter');
            if (select) {
                select.value = filtre;
            }

            document.querySelector('.properties-list')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    });

    logger.debug(LOG_CATEGORIES.EVENT, 'Risk shortcuts configured');
}

/**
 * Configure la recherche libre du registre
 * La saisie est temporisée : re-rendre 241 fiches à chaque frappe serait inutile.
 */
function setupSearchControl() {
    const champ = document.getElementById('propertySearch');

    if (!champ) {
        return;
    }

    let minuteur = null;

    champ.addEventListener('input', (e) => {
        const valeur = e.target.value;

        clearTimeout(minuteur);
        minuteur = setTimeout(() => setSearch(valeur), 180);
    });

    logger.debug(LOG_CATEGORIES.EVENT, 'Property search configured');
}

/**
 * Configure les boutons de pagination du registre
 */
function setupPaginationControls() {
    const precedent = document.getElementById('prevPage');
    const suivant = document.getElementById('nextPage');

    if (precedent) {
        precedent.addEventListener('click', () => changePage(-1));
    }

    if (suivant) {
        suivant.addEventListener('click', () => changePage(1));
    }

    logger.debug(LOG_CATEGORIES.EVENT, 'Pagination controls configured');
}

/**
 * Configure le sélecteur de période commun aux graphiques datés
 * Appelé avant le chargement des données : la fenêtre retenue est donc déjà
 * connue quand les courbes sont dessinées pour la première fois.
 */
function setupPeriodeControl() {
    initPeriodeGraphiques(redessinerSeriesDatees);
}

/**
 * Charge les données initiales depuis localStorage
 */
async function loadInitialData() {
    const cachedStorage = loadFromLocalStorage();

    if (cachedStorage && cachedStorage.data && cachedStorage.data.length > 0) {
        logger.info(LOG_CATEGORIES.EVENT, 'Loading cached data from localStorage', {
            entries: cachedStorage.data.length,
            warnings: cachedStorage.warnings.length
        });

        afficherAgeDonnees(cachedStorage.savedAt);

        try {
            // Utiliser finalizeProcessing pour traiter les données (avec warnings)
            // finalizeProcessing s'occupe maintenant de mettre à jour l'UI et créer les charts
            await finalizeProcessing(cachedStorage.data, cachedStorage.warnings);

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
