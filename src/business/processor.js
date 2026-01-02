/**
 * Orchestration du traitement des données
 * Point central pour processData et finalizeProcessing
 */

import { state } from '../core/state.js';
import { logger, LOG_CATEGORIES } from '../utils/logger.js';
import { saveToLocalStorage } from '../data/storage.js';
import { validateBricksData } from '../data/fileParser.js';
import { mergeDatasets, identifyMissingProjects, removeProjectsById } from './dataProcessor.js';
import { calculateInvestmentStats } from './calculations.js';
import { updateUI, showResults } from '../ui/uiUpdater.js';
import { createCharts } from '../charts/chartManager.js';

/**
 * Traite les données importées (fichier ou API)
 * Gère la fusion avec les données existantes et la modal de suppression
 * @param {Array} fileData - Données brutes importées
 * @param {Array} warnings - Liste des warnings (optionnel)
 * @returns {Promise<void>}
 */
export async function processData(fileData, warnings = []) {
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
                warnings: warnings
            });

            // La modal s'occupera d'appeler finalizeProcessing ou handleConfirmDelete
            // On ne fait rien de plus ici, la modal gère la suite
        } else {
            logger.info(LOG_CATEGORIES.DATA_MERGE, 'No missing projects, proceeding to finalize');
            await finalizeProcessing(mergedData, warnings);
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
 * @returns {Promise<Object>} Résultats des calculs
 */
export async function finalizeProcessing(finalData, warnings = []) {
    logger.info(LOG_CATEGORIES.DATA_MERGE, 'Finalizing data processing', {
        entries: finalData.length
    });

    try {
        // Mettre à jour l'état global
        state.set('allData', finalData);

        // Calculer les statistiques (avec warnings)
        const results = calculateInvestmentStats(finalData, warnings);

        logger.info(LOG_CATEGORIES.CALC_STATS, 'Statistics calculated successfully', {
            totalInvestment: results.totalInvestment,
            totalBricks: results.totalBricks,
            properties: results.properties.length
        });

        // Sauvegarder dans localStorage (avec warnings)
        const saved = saveToLocalStorage(finalData, warnings);
        if (!saved) {
            logger.warn(LOG_CATEGORIES.STORAGE, 'Failed to save to localStorage, but continuing');
        }

        // Mettre à jour l'interface utilisateur
        updateUI(results);
        createCharts(results);
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
    return await finalizeProcessing(cleanedData, warnings);
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
    return await finalizeProcessing(dataContext, warnings);
}
