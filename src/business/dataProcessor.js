/**
 * Traitement et fusion des données d'investissement
 */

import { logger, LOG_CATEGORIES } from '../utils/logger.js';

/**
 * Récupère les IDs uniques de projets depuis un dataset
 * @param {Array} dataset - Données au format Bricks
 * @returns {Set<string>} Set d'IDs de projets
 */
export function getUniqueProjectIds(dataset) {
    const projectIds = new Set();

    if (!dataset || !Array.isArray(dataset)) {
        return projectIds;
    }

    dataset.forEach(monthEntry => {
        if (monthEntry.projects && Array.isArray(monthEntry.projects)) {
            monthEntry.projects.forEach(project => {
                if (project.id) {
                    projectIds.add(project.id);
                }
            });
        }
    });

    logger.debug(LOG_CATEGORIES.DATA_MERGE, 'Unique project IDs extracted', {
        count: projectIds.size
    });

    return projectIds;
}

/**
 * Fusionne deux datasets Bricks (données existantes + nouvelles données)
 * @param {Array} existingData - Données existantes (depuis localStorage)
 * @param {Array} newData - Nouvelles données (depuis fichier ou API)
 * @returns {Array} Données fusionnées
 */
export function mergeDatasets(existingData, newData) {
    // Deep copy des données existantes
    const mergedData = existingData && existingData.length > 0
        ? JSON.parse(JSON.stringify(existingData))
        : [];

    logger.debug(LOG_CATEGORIES.DATA_MERGE, 'Starting data merge', {
        existingEntries: mergedData.length,
        newEntries: newData.length
    });

    // Fusionner les nouvelles données
    newData.forEach(newMonthEntry => {
        // Chercher si ce mois existe déjà
        let monthInMergedData = mergedData.find(m => m.yearMonthDate === newMonthEntry.yearMonthDate);

        if (monthInMergedData) {
            // Le mois existe, fusionner les projets
            newMonthEntry.projects.forEach(newProject => {
                let existingProject = monthInMergedData.projects.find(p => p.id === newProject.id);

                if (existingProject) {
                    // Projet existe, mettre à jour
                    Object.assign(existingProject, newProject);
                    logger.debug(LOG_CATEGORIES.DATA_MERGE, `Updated project ${newProject.id} in ${newMonthEntry.yearMonthDate}`);
                } else {
                    // Nouveau projet, ajouter (deep copy)
                    monthInMergedData.projects.push(JSON.parse(JSON.stringify(newProject)));
                    logger.debug(LOG_CATEGORIES.DATA_MERGE, `Added new project ${newProject.id} to ${newMonthEntry.yearMonthDate}`);
                }
            });
        } else {
            // Nouveau mois, ajouter l'entrée complète (deep copy)
            mergedData.push(JSON.parse(JSON.stringify(newMonthEntry)));
            logger.debug(LOG_CATEGORIES.DATA_MERGE, `Added new month entry: ${newMonthEntry.yearMonthDate}`);
        }
    });

    logger.info(LOG_CATEGORIES.DATA_MERGE, 'Data merge completed', {
        resultingEntries: mergedData.length
    });

    return mergedData;
}

/**
 * Identifie les projets manquants dans les nouvelles données
 * @param {Array} existingData - Données existantes
 * @param {Array} newData - Nouvelles données
 * @returns {Array<string>} IDs des projets manquants
 */
export function identifyMissingProjects(existingData, newData) {
    const existingIds = getUniqueProjectIds(existingData);
    const newIds = getUniqueProjectIds(newData);

    const missingIds = Array.from(existingIds).filter(id => !newIds.has(id));

    logger.info(LOG_CATEGORIES.DATA_MERGE, 'Missing projects identified', {
        existingCount: existingIds.size,
        newCount: newIds.size,
        missingCount: missingIds.length
    });

    return missingIds;
}

/**
 * Supprime des projets du dataset par leurs IDs
 * @param {Array} data - Dataset
 * @param {Array<string>} projectIdsToRemove - IDs à supprimer
 * @returns {Array} Dataset nettoyé
 */
export function removeProjectsById(data, projectIdsToRemove) {
    if (!projectIdsToRemove || projectIdsToRemove.length === 0) {
        return data;
    }

    // Deep copy pour ne pas modifier l'original
    const cleanedData = JSON.parse(JSON.stringify(data));

    logger.debug(LOG_CATEGORIES.DATA_MERGE, 'Removing projects', {
        idsToRemove: projectIdsToRemove
    });

    cleanedData.forEach(monthEntry => {
        if (monthEntry.projects && Array.isArray(monthEntry.projects)) {
            monthEntry.projects = monthEntry.projects.filter(
                p => !projectIdsToRemove.includes(p.id)
            );
        }
    });

    logger.info(LOG_CATEGORIES.DATA_MERGE, 'Projects removed successfully', {
        removedCount: projectIdsToRemove.length
    });

    return cleanedData;
}

/**
 * Récupère le nom d'un projet par son ID
 * @param {string} projectId - ID du projet
 * @param {Array} dataContext - Dataset où chercher
 * @returns {string} Nom du projet ou ID si non trouvé
 */
export function getProjectNameById(projectId, dataContext) {
    for (const month of dataContext) {
        if (month.projects && Array.isArray(month.projects)) {
            const project = month.projects.find(p => p.id === projectId);
            if (project) {
                return project.name?.fr || project.name?.en || project.name || `Projet ID: ${projectId}`;
            }
        }
    }
    return `Projet ID: ${projectId} (Nom non trouvé)`;
}
