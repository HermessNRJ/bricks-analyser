/**
 * Orchestration du traitement des données
 * Point central pour processData et finalizeProcessing
 */

import { state } from '../core/state.js';
import { logger, LOG_CATEGORIES } from '../utils/logger.js';
import { saveToLocalStorage, loadFromLocalStorage } from '../data/storage.js';
import { afficherAgeDonnees } from '../ui/dataAge.js';
import { validateBricksData } from '../data/fileParser.js';
import { mergeDatasets, identifyMissingProjects, removeProjectsById } from './dataProcessor.js';
import { calculateInvestmentStats } from './calculations.js';
import { updateUI, showResults } from '../ui/uiUpdater.js';
import { createCharts } from '../charts/chartManager.js';
import { updateForecastContext } from '../events/forecastHandler.js';

/**
 * Traite les données importées (fichier ou API)
 * Gère la fusion avec les données existantes et la modal de suppression
 * @param {Array} fileData - Données brutes importées
 * @param {Array} warnings - Liste des warnings (optionnel)
 * @param {Object} [options]
 * @param {Object} [options.revenus] - Historique des revenus réellement versés
 * @param {Object} [options.capital] - Remboursements de capital
 * @param {Object} [options.apports] - Versements personnels
 * @returns {Promise<void>}
 */
export async function processData(fileData, warnings = [], { revenus, capital, apports } = {}) {
    // Ce point d'entrée n'est atteint que depuis un appel à l'API : c'est ici
    // que naît la date de récupération.
    const dateRecuperation = new Date().toISOString();

    try {
        logger.info(LOG_CATEGORIES.DATA_MERGE, 'Processing imported data', {
            entries: fileData.length
        });

        // Validation basique des données
        if (!Array.isArray(fileData) || fileData.length === 0) {
            throw new Error('Le fichier de données est vide ou invalide.');
        }

        // Validation de la structure
        const validation = validateBricksData(fileData);
        if (!validation.valid) {
            throw new Error(`Format de données invalide:\n${validation.errors.join('\n')}`);
        }

        // Récupérer les données existantes depuis l'état
        const existingData = state.get('allData') || [];

        // Fusionner les données
        const mergedData = mergeDatasets(existingData, fileData);

        // Identifier les projets manquants (dans existingData mais pas dans fileData)
        const missingProjectIds = identifyMissingProjects(existingData, fileData);

        if (missingProjectIds.length > 0) {
            logger.info(LOG_CATEGORIES.DATA_MERGE, 'Missing projects detected, will show modal', {
                count: missingProjectIds.length,
                ids: missingProjectIds
            });

            // Stocker dans l'état pour la modal (incluant warnings)
            state.update('modal', {
                isOpen: true,
                projectIdsToRemove: missingProjectIds,
                dataContext: mergedData,
                warnings: warnings,
                dateRecuperation,
                revenus,
                capital,
                apports
            });

            // La modal s'occupera d'appeler finalizeProcessing ou handleConfirmDelete
            // On ne fait rien de plus ici, la modal gère la suite
        } else {
            logger.info(LOG_CATEGORIES.DATA_MERGE, 'No missing projects, proceeding to finalize');
            await finalizeProcessing(mergedData, warnings, { dateRecuperation, revenus, capital, apports });
        }

    } catch (err) {
        logger.error(LOG_CATEGORIES.DATA_MERGE, 'Error processing data', err);
        throw err; // Re-throw pour que le gestionnaire d'événement puisse afficher l'erreur
    }
}

/**
 * Finalise le traitement après validation/fusion
 * Calcule les stats, met à jour l'UI, sauvegarde dans localStorage
 * @param {Array} finalData - Données finales à traiter
 * @param {Array} warnings - Liste des warnings (optionnel)
 * @param {Object} [options]
 * @param {string} [options.dateRecuperation] - Date ISO si les données viennent
 *   d'être récupérées ; omise, l'âge affiché reste celui du dernier appel API
 * @param {Object} [options.statuts] - Suivis officiels de projet
 * @param {Object} [options.revenus] - Historique des revenus réellement versés ;
 *   omis, celui du cache est réutilisé
 * @param {Object} [options.capital] - Remboursements de capital ; omis, celui
 *   du cache est réutilisé
 * @param {Object} [options.apports] - Versements personnels ; omis, ceux du
 *   cache sont réutilisés
 * @returns {Promise<Object>} Résultats des calculs
 */
export async function finalizeProcessing(finalData, warnings = [], options = {}) {
    logger.info(LOG_CATEGORIES.DATA_MERGE, 'Finalizing data processing', {
        entries: finalData.length
    });

    try {
        // Mettre à jour l'état global
        state.set('allData', finalData);

        const cache = loadFromLocalStorage();

        // Le suivi officiel des projets prime sur la lecture des alertes
        const statuts = options.statuts || cache?.statuts || {};

        // L'état de compte Bricks prime sur les revenus estimés depuis les taux
        const revenus = options.revenus || cache?.revenus || null;

        // Le journal des mouvements dit ce qui relève du capital rendu
        const capital = options.capital || cache?.capital || null;

        // Le même journal dit ce qui vient de votre poche
        const apports = options.apports || cache?.apports || null;

        const results = calculateInvestmentStats(finalData, warnings, statuts, revenus, capital, apports);

        // Le rafraîchissement des statuts a besoin de la liste des propriétés
        state.set('lastResults', results);

        logger.info(LOG_CATEGORIES.CALC_STATS, 'Statistics calculated successfully', {
            totalInvestment: results.totalInvestment,
            totalBricks: results.totalBricks,
            properties: results.properties.length
        });

        // Sauvegarder dans localStorage (avec warnings)
        const saved = saveToLocalStorage(finalData, warnings, options);

        if (saved) {
            afficherAgeDonnees(loadFromLocalStorage()?.savedAt || null);
        } else {
            logger.warn(LOG_CATEGORIES.STORAGE, 'Failed to save to localStorage, but continuing');
        }

        // Mettre à jour l'interface utilisateur
        updateUI(results);
        createCharts(results);
        updateForecastContext(results);
        showResults();

        // Mettre à jour l'état UI
        state.update('ui', {
            resultsVisible: true,
            loading: false,
            error: null
        });

        // Réinitialiser l'état de la modal
        state.update('modal', {
            isOpen: false,
            projectIdsToRemove: [],
            dataContext: null
        });

        logger.info(LOG_CATEGORIES.DATA_MERGE, 'Processing finalized successfully');

        return results;

    } catch (err) {
        logger.error(LOG_CATEGORIES.DATA_MERGE, 'Error finalizing processing', err);
        throw err;
    }
}

/**
 * Gestionnaire pour la confirmation de suppression depuis la modal
 * @param {Array<string>} projectIdsToRemove - IDs des projets à supprimer
 * @returns {Promise<Object>} Résultats des calculs
 */
export async function handleConfirmDelete(projectIdsToRemove) {
    logger.info(LOG_CATEGORIES.DATA_MERGE, 'User confirmed deletion', {
        count: projectIdsToRemove.length
    });

    // Récupérer le contexte de données depuis l'état de la modal
    const modalState = state.get('modal');
    const dataContext = modalState.dataContext;
    const warnings = modalState.warnings || [];

    if (!dataContext) {
        logger.error(LOG_CATEGORIES.DATA_MERGE, 'No data context found in modal state');
        throw new Error('Erreur: contexte de données manquant pour la suppression');
    }

    // Supprimer les projets
    const cleanedData = removeProjectsById(dataContext, projectIdsToRemove);

    // Finaliser avec les données nettoyées (et les warnings)
    return await finalizeProcessing(cleanedData, warnings, {
        dateRecuperation: modalState.dateRecuperation,
        revenus: modalState.revenus,
        capital: modalState.capital,
        apports: modalState.apports
    });
}

/**
 * Gestionnaire pour garder tous les éléments (annuler la suppression)
 * @returns {Promise<Object>} Résultats des calculs
 */
export async function handleKeepAllItems() {
    logger.info(LOG_CATEGORIES.DATA_MERGE, 'User chose to keep all items');

    // Récupérer le contexte de données depuis l'état de la modal
    const modalState = state.get('modal');
    const dataContext = modalState.dataContext;
    const warnings = modalState.warnings || [];

    if (!dataContext) {
        logger.error(LOG_CATEGORIES.DATA_MERGE, 'No data context found in modal state');
        throw new Error('Erreur: contexte de données manquant');
    }

    // Finaliser avec toutes les données (aucune suppression et les warnings)
    return await finalizeProcessing(dataContext, warnings, {
        dateRecuperation: modalState.dateRecuperation,
        revenus: modalState.revenus,
        capital: modalState.capital,
        apports: modalState.apports
    });
}
