/**
 * Client API pour interagir avec Bricks.co
 */

import { CONFIG } from '../core/config.js';
import { logger, LOG_CATEGORIES } from '../utils/logger.js';

/**
 * Récupère les projets financés depuis l'API Bricks.co
 * @param {string} token - Bearer token d'authentification
 * @returns {Promise<Array>} Données des projets financés
 * @throws {Error} Si la requête échoue
 */
export async function fetchFinancedProjects(token) {
    const url = `${CONFIG.API_BASE_URL}${CONFIG.API_ENDPOINTS.FINANCED}`;

    logger.debug(LOG_CATEGORIES.API, 'Fetching financed projects', { url });

    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            // Tenter de parser le body d'erreur
            let errorData;
            try {
                errorData = await response.json();
            } catch {
                // Si le parsing échoue, utiliser le statusText
                throw new Error(`Erreur HTTP ${response.status}: ${response.statusText}`);
            }

            throw new Error(`Erreur API ${response.status}: ${errorData.message || JSON.stringify(errorData)}`);
        }

        const data = await response.json();

        logger.info(LOG_CATEGORIES.API, 'Financed projects fetched successfully', {
            count: Array.isArray(data) ? data.length : 'unknown'
        });

        return data;

    } catch (err) {
        logger.error(LOG_CATEGORIES.API, 'Failed to fetch financed projects', err);
        throw err;
    }
}

/**
 * Récupère tous les projets (en cours de financement et à venir) depuis l'API
 * @param {string} token - Bearer token d'authentification
 * @returns {Promise<Object>} Données avec { ongoing, upcoming }
 * @throws {Error} Si la requête échoue
 */
export async function fetchAllProjects(token) {
    const url = `${CONFIG.API_BASE_URL}${CONFIG.API_ENDPOINTS.ALL_PROJECTS}`;

    logger.debug(LOG_CATEGORIES.API, 'Fetching all projects (ongoing & upcoming)', { url });

    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            let errorData;
            try {
                errorData = await response.json();
            } catch {
                throw new Error(`Erreur HTTP ${response.status}: ${response.statusText} (récupération projets en cours/à venir)`);
            }

            throw new Error(`Erreur API ${response.status}: ${errorData.message || JSON.stringify(errorData)} (récupération projets en cours/à venir)`);
        }

        const data = await response.json();

        logger.info(LOG_CATEGORIES.API, 'All projects fetched successfully', {
            ongoingCount: data.ongoing?.projects?.length || 0,
            upcomingCount: data.upcoming?.projects?.length || 0
        });

        return data;

    } catch (err) {
        logger.error(LOG_CATEGORIES.API, 'Failed to fetch all projects', err);
        throw err;
    }
}

/**
 * Combine les projets financés avec les projets en cours/à venir qui ont des briques possédées
 * @param {Array} financedData - Données des projets financés
 * @param {Object} allProjectsData - Données avec { ongoing, upcoming }
 * @returns {Array} Données combinées au format compatible
 */
export function mergeAPIProjects(financedData, allProjectsData) {
    const combined = [...financedData];

    logger.debug(LOG_CATEGORIES.API, 'Merging API project data', {
        financedCount: financedData.length,
        ongoingCount: allProjectsData.ongoing?.projects?.length || 0,
        upcomingCount: allProjectsData.upcoming?.projects?.length || 0
    });

    // Extraire les projets ongoing avec des briques possédées
    if (allProjectsData.ongoing && allProjectsData.ongoing.projects) {
        allProjectsData.ongoing.projects.forEach(proj => {
            if (proj.ownedBricks > 0) {
                proj.projectStatus = 'ongoing';
                // Emballer dans une structure compatible
                combined.push({
                    yearMonthDate: 'N/A',
                    projects: [proj]
                });
            }
        });
    }

    // Extraire les projets upcoming avec des briques possédées
    if (allProjectsData.upcoming && allProjectsData.upcoming.projects) {
        allProjectsData.upcoming.projects.forEach(proj => {
            if (proj.ownedBricks > 0) {
                proj.projectStatus = 'upcoming';
                combined.push({
                    yearMonthDate: 'N/A',
                    projects: [proj]
                });
            }
        });
    }

    logger.info(LOG_CATEGORIES.API, 'API data merged', {
        totalEntries: combined.length
    });

    return combined;
}

/**
 * Récupère les warnings (highlighted updates) depuis l'API Bricks.co
 * @param {string} token - Bearer token d'authentification
 * @returns {Promise<Array>} Liste des warnings
 * @throws {Error} Si la requête échoue
 */
export async function fetchWarnings(token) {
    const url = `${CONFIG.API_BASE_URL}${CONFIG.API_ENDPOINTS.WARNINGS}`;

    logger.debug(LOG_CATEGORIES.API, 'Fetching property warnings', { url });

    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            let errorData;
            try {
                errorData = await response.json();
            } catch {
                throw new Error(`Erreur HTTP ${response.status}: ${response.statusText} (récupération warnings)`);
            }

            throw new Error(`Erreur API ${response.status}: ${errorData.message || JSON.stringify(errorData)} (récupération warnings)`);
        }

        const data = await response.json();

        logger.info(LOG_CATEGORIES.API, 'Warnings fetched successfully', {
            count: Array.isArray(data) ? data.length : 0
        });

        return data || [];

    } catch (err) {
        logger.error(LOG_CATEGORIES.API, 'Failed to fetch warnings', err);
        // Ne pas bloquer l'application si les warnings échouent
        return [];
    }
}
