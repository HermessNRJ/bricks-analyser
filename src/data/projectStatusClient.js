/**
 * Client du suivi de projet (projects.bricks.co)
 *
 * Cette API porte le statut qui fait foi — « defaulted », le décompte des
 * échéances impayées, les mises en demeure — là où les alertes du portefeuille
 * ne livrent que du texte libre. Elle répond sans authentification : seul
 * Cloudflare la garde, d'où le passage par le proxy.
 *
 * Un 404 « PAGE_NOT_AVAILABLE » signifie qu'aucun suivi d'incident n'existe
 * pour ce projet : c'est une réponse utile, pas une erreur.
 */

import { logger, LOG_CATEGORIES } from '../utils/logger.js';

const BASE = '/projects-api/api';

/** Nombre d'appels simultanés : assez pour ne pas traîner, assez peu pour ne
 *  pas marteler l'API de Bricks. */
export const CONCURRENCE = 5;

/**
 * Récupère le suivi d'échéances d'un projet
 * @param {string} projectId - Identifiant du projet
 * @returns {Promise<Object>} { id, suivi: false } si aucun suivi, sinon les
 *   champs officiels ; { erreur: true } si l'appel a échoué
 */
export async function fetchProjectStatus(projectId) {
    try {
        const response = await fetch(`${BASE}/projects/${encodeURIComponent(projectId)}/echeances-investors`, {
            method: 'GET',
            headers: { 'Accept': 'application/json' }
        });

        // Pas de page de suivi : le projet ne connaît aucun incident
        if (response.status === 404) {
            return { id: projectId, suivi: false };
        }

        if (!response.ok) {
            logger.warn(LOG_CATEGORIES.API, 'Project status fetch failed', {
                projectId,
                status: response.status
            });
            return { id: projectId, erreur: true };
        }

        const data = await response.json();

        if (!data || !data.project) {
            return { id: projectId, suivi: false };
        }

        return {
            id: projectId,
            suivi: true,
            statut: data.project.status || null,
            impayees: Number(data.unpaid_count) || 0,
            // Les pénalités sont exprimées en centimes par l'API
            penalites: (data.investors_penalties_summary?.total_amount_in_cents || 0) / 100,
            derniereEcheanceImpayee: (data.echeances || [])
                .filter(e => e.status === 'unpaid')
                .map(e => e.payment_date)
                .sort()
                .pop() || null
        };

    } catch (err) {
        logger.warn(LOG_CATEGORIES.API, 'Project status request errored', { projectId, err });
        return { id: projectId, erreur: true };
    }
}

/**
 * Récupère le suivi de plusieurs projets, par lots
 *
 * Les appels sont bornés en parallélisme : 200 requêtes lancées d'un coup
 * seraient à la fois inutiles et agressives pour l'API.
 *
 * @param {string[]} projectIds - Identifiants à interroger
 * @param {Object} [options]
 * @param {Function} [options.onProgress] - Appelé avec (faits, total)
 * @param {number} [options.concurrence] - Appels simultanés
 * @param {Function} [options.fetcher] - Injection pour les tests
 * @returns {Promise<Object>} Statuts indexés par identifiant de projet
 */
export async function fetchProjectStatuses(projectIds, options = {}) {
    const { onProgress, concurrence = CONCURRENCE, fetcher = fetchProjectStatus } = options;
    const ids = [...new Set(projectIds || [])];
    const statuts = {};

    let faits = 0;
    let curseur = 0;

    const travailleur = async () => {
        while (curseur < ids.length) {
            const id = ids[curseur++];
            const resultat = await fetcher(id);

            // Une erreur ponctuelle ne doit pas être mémorisée comme « sain » :
            // on l'omet, l'analyse retombera sur le texte des alertes.
            if (!resultat.erreur) {
                statuts[id] = resultat;
            }

            faits += 1;
            if (onProgress) {
                onProgress(faits, ids.length);
            }
        }
    };

    await Promise.all(
        Array.from({ length: Math.min(concurrence, ids.length) }, travailleur)
    );

    logger.info(LOG_CATEGORIES.API, 'Project statuses fetched', {
        demandes: ids.length,
        obtenus: Object.keys(statuts).length
    });

    return statuts;
}
