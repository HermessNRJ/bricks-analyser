/**
 * Point d'entrée principal de l'application
 * Initialise tous les gestionnaires d'événements et charge les données
 */

import { state } from '../core/state.js';
import { logger, LOG_CATEGORIES } from '../utils/logger.js';
import { loadFromLocalStorage } from '../data/storage.js';
import { finalizeProcessing } from '../business/processor.js';
import { showDeletionModal, showError } from '../ui/modals.js';
import { resizeAllCharts } from '../charts/chartManager.js';
import { initPeriodeGraphiques } from '../ui/periodeGraphiques.js';
import { redessinerSeriesDatees } from '../charts/chartManager.js';
import { setupForecastHandler } from './forecastHandler.js';
import { setupStatusHandler } from './statusHandler.js';
import { setupAPIHandler } from './apiHandler.js';
import { setupScrollToTop } from './scrollHandler.js';
import { setupResetCache } from './cacheHandler.js';
import {
    updatePropertySortAndFilter, showResults, setSearch, changePage,
    allerALaPage, setTaillePage, taillePageCourante
} from '../ui/uiUpdater.js';
import { afficherAgeDonnees } from '../ui/dataAge.js';
import { lirePreference } from '../core/preferences.js';

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
 * Contrôles du registre, du nom de leur préférence à l'argument attendu
 *
 * L'identifiant du <select> dans index.html, la clé de la préférence et le
 * critère passé à updatePropertySortAndFilter portent le même nom à un mot
 * près. Les tenir dans une table plutôt que dans cinq blocs recopiés évite
 * qu'un filtre ajouté n'en oublie un.
 */
const CONTROLES_REGISTRE = {
    propertySortBy: 'sortBy',
    propertyFilter: 'filter',
    propertyWarningFilter: 'warningFilter',
    propertyCountryFilter: 'countryFilter',
    propertyVersementFilter: 'versementFilter'
};

/**
 * Configure les contrôles de tri et filtrage des propriétés
 */
function setupPropertyControls() {
    Object.entries(CONTROLES_REGISTRE).forEach(([id, critere]) => {
        const select = document.getElementById(id);

        if (!select) {
            return;
        }

        select.value = lirePreference(id);

        select.addEventListener('change', (e) => {
            updatePropertySortAndFilter({ [critere]: e.target.value });
        });
    });

    logger.debug(LOG_CATEGORIES.EVENT, 'Registry controls configured',
        Object.fromEntries(Object.keys(CONTROLES_REGISTRE).map(id => [id, lirePreference(id)])));
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
    const onglets = document.getElementById('pageTabs');
    const taille = document.getElementById('propertyPageSize');

    if (precedent) {
        precedent.addEventListener('click', () => changePage(-1));
    }

    if (suivant) {
        suivant.addEventListener('click', () => changePage(1));
    }

    // Délégation : les onglets sont réécrits à chaque rendu, et poser un
    // écouteur sur chacun en aurait laissé autant derrière à chaque page.
    if (onglets) {
        onglets.addEventListener('click', (evenement) => {
            const page = Number(evenement.target.closest('.pagination-onglet')?.dataset.page);

            if (Number.isFinite(page)) {
                allerALaPage(page);
            }
        });
    }

    if (taille) {
        const courante = taillePageCourante();
        taille.value = Number.isFinite(courante) ? String(courante) : 'all';
        taille.addEventListener('change', () => setTaillePage(taille.value));
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
 * Chemin du portefeuille de démonstration, écrit par « npm run demo »
 *
 * Absent de l'image Docker, qui ne copie que index.html, src/, la favicon et
 * nginx.conf : la démonstration se regarde derrière « npm run serve ».
 */
const FICHIER_DEMO = 'data/demo.json';

/**
 * Affiche le portefeuille de démonstration sans toucher au vrai
 *
 * Prendre une capture d'écran demandait jusqu'ici de coller un fetch dans la
 * console du navigateur, puis de penser à un localStorage.clear() après coup.
 * Le paramètre ?demo fait la même chose en un lien — et sans rien écrire :
 * les 42 propriétés fictives vivent le temps de la page, le portefeuille
 * enregistré est intact au rechargement suivant.
 *
 * @returns {Promise<boolean>} Vrai si la démonstration est à l'écran
 */
async function chargerDemonstration() {
    try {
        const reponse = await fetch(FICHIER_DEMO);

        if (!reponse.ok) {
            throw new Error(`${reponse.status} ${reponse.statusText}`);
        }

        const demo = await reponse.json();

        await finalizeProcessing(demo.data, demo.warnings, {
            persister: false,
            statuts: demo.statuts,
            revenus: demo.revenus,
            capital: demo.capital,
            apports: demo.apports
        });

        // Pas d'âge des données ici : la ligne « Données récupérées… » répond
        // d'ordinaire pour le vrai portefeuille, et daterait un fichier fabriqué
        // à la demande. Le bandeau dit tout ce qu'il y a à dire.
        afficherBandeauDemo();

        logger.info(LOG_CATEGORIES.EVENT, 'Demo portfolio displayed', {
            entries: demo.data?.length ?? 0
        });

        return true;

    } catch (err) {
        logger.error(LOG_CATEGORIES.EVENT, 'Demo portfolio unavailable', err);
        showError(`Portefeuille de démonstration introuvable (${FICHIER_DEMO}).`
            + ' Il se fabrique avec « npm run demo », et n\'est pas copié dans l\'image Docker.');
        return false;
    }
}

/**
 * Dit à l'écran que les chiffres sont inventés
 *
 * Un tableau de bord chiffré au centime se lit comme un relevé : rien, sinon
 * cette bande, ne distinguerait 42 propriétés fictives d'un vrai portefeuille.
 */
function afficherBandeauDemo() {
    if (document.getElementById('bandeauDemo')) {
        return;
    }

    const bandeau = document.createElement('p');
    bandeau.id = 'bandeauDemo';
    bandeau.className = 'bandeau-demo';
    bandeau.setAttribute('role', 'status');
    bandeau.textContent = 'Portefeuille de démonstration : 42 propriétés inventées. '
        + 'Rien n\'est enregistré, et vos données ne sont pas touchées.';

    document.getElementById('results')?.prepend(bandeau);
}

/**
 * Charge les données initiales depuis localStorage
 */
async function loadInitialData() {
    // ?demo passe avant le cache : c'est une demande explicite, et elle ne doit
    // pas dépendre de ce qui est déjà enregistré.
    if (new URLSearchParams(location.search).has('demo')) {
        if (await chargerDemonstration()) {
            return;
        }
    }

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
