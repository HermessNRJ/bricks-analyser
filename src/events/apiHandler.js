/**
 * Gestionnaire de récupération des données via API
 */

import { fetchFinancedProjects, fetchAllProjects, mergeAPIProjects, fetchWarnings } from '../data/apiClient.js';
import { processData } from '../business/processor.js';
import { showError, hideError } from '../ui/modals.js';
import { logger, LOG_CATEGORIES } from '../utils/logger.js';

/**
 * Configure le gestionnaire d'API
 */
export function setupAPIHandler() {
    const tokenInput = document.getElementById('apiTokenInput');
    const fetchBtn = document.getElementById('fetchApiDataBtn');
    const loadingMsg = document.getElementById('apiLoadingMessage');

    if (!tokenInput || !fetchBtn || !loadingMsg) {
        logger.error(LOG_CATEGORIES.EVENT, 'API elements not found');
        return;
    }

    fetchBtn.addEventListener('click', async () => {
        const token = tokenInput.value.trim();

        if (!token) {
            showError('Veuillez entrer un Bearer Token API.');
            return;
        }

        logger.info(LOG_CATEGORIES.EVENT, 'API fetch initiated');

        // UI feedback
        loadingMsg.style.display = 'block';
        fetchBtn.disabled = true;
        fetchBtn.style.opacity = '0.7';
        hideError();

        let financedData = [];

        try {
            // Récupérer les projets financés
            financedData = await fetchFinancedProjects(token);

            // Récupérer les projets en cours/à venir
            let allProjectsData;
            try {
                allProjectsData = await fetchAllProjects(token);
            } catch (secondErr) {
                logger.warn(LOG_CATEGORIES.EVENT, 'Failed to fetch ongoing/upcoming projects', secondErr);
                showError(`Données des projets financés chargées, mais échec de la récupération des projets en cours/à venir: ${secondErr.message}`);
                // Continuer avec les données partielles
                allProjectsData = { ongoing: { projects: [] }, upcoming: { projects: [] } };
            }

            // Fusionner les données
            const combinedData = mergeAPIProjects(financedData, allProjectsData);

            // Récupérer les warnings
            let warningsData = [];
            try {
                warningsData = await fetchWarnings(token);
                logger.info(LOG_CATEGORIES.EVENT, 'Warnings fetched successfully', {
                    count: warningsData.length,
                    propertyIds: warningsData.map(w => w.propertyId),
                    sampleWarning: warningsData.length > 0 ? warningsData[0] : null
                });
            } catch (warningsErr) {
                logger.warn(LOG_CATEGORIES.EVENT, 'Failed to fetch warnings', warningsErr);
                // Continuer sans les warnings
            }

            // Traiter les données avec les warnings
            await processData(combinedData, warningsData);

            // Nettoyer le token input
            tokenInput.value = '';

            logger.info(LOG_CATEGORIES.EVENT, 'API data processed successfully');

        } catch (err) {
            logger.error(LOG_CATEGORIES.EVENT, 'API fetch failed', err);

            if (financedData.length > 0) {
                // Première requête réussie, deuxième échouée
                showError(`Données des projets financés chargées, mais échec de la récupération des projets en cours/à venir: ${err.message}`);
                await processData(financedData);
                tokenInput.value = '';
            } else {
                // Première requête a échoué
                showError(err.message || "Une erreur inconnue est survenue lors de la récupération des données API.");
            }
        } finally {
            loadingMsg.style.display = 'none';
            fetchBtn.disabled = false;
            fetchBtn.style.opacity = '1';
        }
    });

    logger.debug(LOG_CATEGORIES.EVENT, 'API handler configured');
}
