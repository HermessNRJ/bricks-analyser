/**
 * Client API pour interagir avec Bricks.co
 */

import { CONFIG } from '../core/config.js';
import { logger, LOG_CATEGORIES } from '../utils/logger.js';
import { getCurrentMonthYYYYMM } from '../utils/dateHelpers.js';
import { normaliserHistoriqueRevenus } from '../business/revenueHistory.js';

/**
 * Nom du cookie de session posé par better-auth après le SSO Google
 */
const SESSION_COOKIE_NAME = 'better-auth.session_token';

/**
 * Normalise l'en-tête Cookie collé par l'utilisateur
 * On accepte la ligne telle qu'elle se copie depuis les outils de développement,
 * avec ou sans le préfixe « Cookie: ».
 * @param {string} raw - Valeur brute saisie
 * @returns {string} En-tête Cookie prêt à être relayé
 */
export function normalizeSessionCookie(raw) {
    if (typeof raw !== 'string') {
        return '';
    }
    return raw.trim().replace(/^Cookie\s*:\s*/i, '').replace(/;\s*$/, '');
}

/**
 * Vérifie que la valeur collée contient bien le cookie de session Bricks
 * Sans lui, l'API répond 401 : autant le dire tout de suite plutôt que de
 * laisser l'utilisateur deviner.
 * @param {string} cookie - En-tête Cookie normalisé
 * @returns {boolean} true si le cookie de session est présent
 */
export function hasSessionCookie(cookie) {
    return typeof cookie === 'string' && cookie.includes(SESSION_COOKIE_NAME);
}

/**
 * Effectue un GET authentifié sur l'API Bricks (via le proxy) et renvoie le JSON
 * Centralise l'en-tête de session, le parsing d'erreur et le logging.
 * @param {string} endpoint - Chemin de l'endpoint (voir CONFIG.API_ENDPOINTS)
 * @param {string} session - En-tête Cookie contenant la session Bricks
 * @param {Object} options
 * @param {string} options.label - Libellé technique pour les logs
 * @param {string} [options.context] - Précision ajoutée aux messages d'erreur utilisateur
 * @returns {Promise<*>} Corps de la réponse désérialisé
 * @throws {Error} Si la requête échoue
 * @private
 */
async function requestJSON(endpoint, session, { label, context = '' }) {
    const url = `${CONFIG.API_BASE_URL}${endpoint}`;
    const suffix = context ? ` (${context})` : '';

    logger.debug(LOG_CATEGORIES.API, `Fetching ${label}`, { url });

    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                // Le proxy nginx retransforme cet en-tête en Cookie vers api.bricks.co
                'X-Bricks-Session': normalizeSessionCookie(session),
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            // Tenter de parser le body d'erreur, sinon retomber sur le statusText
            let errorData;
            try {
                errorData = await response.json();
            } catch {
                throw new Error(`Erreur HTTP ${response.status}: ${response.statusText}${suffix}`);
            }

            throw new Error(`Erreur API ${response.status}: ${errorData.message || JSON.stringify(errorData)}${suffix}`);
        }

        return await response.json();

    } catch (err) {
        logger.error(LOG_CATEGORIES.API, `Failed to fetch ${label}`, err);
        throw err;
    }
}

/**
 * Récupère les projets financés depuis l'API Bricks.co
 * @param {string} session - En-tête Cookie contenant la session Bricks
 * @returns {Promise<Array>} Données des projets financés
 * @throws {Error} Si la requête échoue
 */
export async function fetchFinancedProjects(session) {
    const data = await requestJSON(CONFIG.API_ENDPOINTS.FINANCED, session, {
        label: 'financed projects'
    });

    logger.info(LOG_CATEGORIES.API, 'Financed projects fetched successfully', {
        count: Array.isArray(data) ? data.length : 'unknown'
    });

    return data;
}

/**
 * Récupère tous les projets (en cours de financement et à venir) depuis l'API
 * @param {string} session - En-tête Cookie contenant la session Bricks
 * @returns {Promise<Object>} Données avec { ongoing, upcoming }
 * @throws {Error} Si la requête échoue
 */
export async function fetchAllProjects(session) {
    const data = await requestJSON(CONFIG.API_ENDPOINTS.ALL_PROJECTS, session, {
        label: 'all projects (ongoing & upcoming)',
        context: 'récupération projets en cours/à venir'
    });

    logger.info(LOG_CATEGORIES.API, 'All projects fetched successfully', {
        ongoingCount: data.ongoing?.projects?.length || 0,
        upcomingCount: data.upcoming?.projects?.length || 0
    });

    return data;
}

/**
 * Récupère les warnings (highlighted updates) depuis l'API Bricks.co
 * Ne rejette jamais : les warnings sont accessoires, un échec renvoie une liste vide.
 * @param {string} session - En-tête Cookie contenant la session Bricks
 * @returns {Promise<Array>} Liste des warnings (vide en cas d'échec)
 */
export async function fetchWarnings(session) {
    try {
        const data = await requestJSON(CONFIG.API_ENDPOINTS.WARNINGS, session, {
            label: 'property warnings',
            context: 'récupération warnings'
        });

        logger.info(LOG_CATEGORIES.API, 'Warnings fetched successfully', {
            count: Array.isArray(data) ? data.length : 0
        });

        return data || [];

    } catch {
        // Erreur déjà loguée par requestJSON : on ne bloque pas l'application
        return [];
    }
}

/**
 * Récupère l'historique des revenus réellement versés
 *
 * C'est l'état de compte de Bricks : ce qui a été encaissé mois par mois, avec
 * le prélèvement effectivement retenu. Il remplace l'estimation déduite des
 * taux affichés, qui compte les échéances impayées comme si elles avaient été
 * versées.
 *
 * Ne rejette jamais : sans historique l'application retombe sur l'estimation,
 * ce qui vaut mieux qu'un écran vide.
 *
 * @param {string} session - En-tête Cookie contenant la session Bricks
 * @param {Object} [options]
 * @param {string} [options.debut] - Premier mois demandé (YYYY-MM)
 * @param {string} [options.fin] - Dernier mois demandé (YYYY-MM)
 * @returns {Promise<Object|null>} Historique normalisé, null en cas d'échec
 */
export async function fetchHistoriqueRevenus(session, { debut, fin } = {}) {
    const startDate = debut || CONFIG.REVENUE_HISTORY_START;
    const endDate = fin || getCurrentMonthYYYYMM();

    try {
        const data = await requestJSON(
            `${CONFIG.API_ENDPOINTS.REVENUE}?startDate=${startDate}&endDate=${endDate}`,
            session,
            {
                label: 'revenue history',
                context: 'récupération historique des revenus'
            }
        );

        return normaliserHistoriqueRevenus(data);

    } catch {
        // Erreur déjà loguée par requestJSON : on ne bloque pas l'application
        return null;
    }
}

/**
 * Nombre de transactions demandées par appel
 * Le journal compte un mouvement par jour rien que pour le solde boosté :
 * demander vingt lignes à la fois en ferait des centaines d'allers-retours.
 */
const TAILLE_LOT = 100;

/** Garde-fou : au-delà, c'est que la pagination ne progresse pas */
const LOTS_MAX = 200;

/**
 * Récupère le journal des mouvements du portefeuille
 *
 * L'état de compte agrège ; ce journal détaille. Lui seul distingue un
 * remboursement de capital d'un coupon, les deux arrivant mêlés dans
 * `obligationCoupons`.
 *
 * Ne rejette jamais : en cas d'échec en cours de route, les lots déjà obtenus
 * sont renvoyés plutôt que perdus.
 *
 * @param {string} session - En-tête Cookie contenant la session Bricks
 * @param {Object} [options]
 * @param {Function} [options.onProgress] - Reçoit le nombre de lignes obtenues
 * @returns {Promise<Array>} Transactions, de la plus récente à la plus ancienne
 */
export async function fetchTransactionsPortefeuille(session, { onProgress } = {}) {
    const transactions = [];
    let cursor = 0;

    for (let lot = 0; lot < LOTS_MAX; lot++) {
        let page;

        try {
            page = await requestJSON(
                `${CONFIG.API_ENDPOINTS.WALLET}?cursor=${cursor}&take=${TAILLE_LOT}`,
                session,
                { label: 'wallet transactions', context: 'récupération du journal des mouvements' }
            );
        } catch {
            // Erreur déjà loguée : on garde ce qui a été obtenu
            break;
        }

        const lignes = Array.isArray(page?.data) ? page.data : [];

        if (lignes.length === 0) {
            break;
        }

        transactions.push(...lignes);

        if (typeof onProgress === 'function') {
            onProgress(transactions.length);
        }

        // Le curseur renvoyé fait foi tant qu'il avance ; sinon on le déduit du
        // nombre de lignes reçues, la taille de lot pouvant être plafonnée.
        cursor = Number.isFinite(page.cursor) && page.cursor > cursor
            ? page.cursor
            : cursor + lignes.length;
    }

    logger.info(LOG_CATEGORIES.API, 'Wallet transactions fetched', { count: transactions.length });

    return transactions;
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

    // Les projets ongoing/upcoming où l'utilisateur détient des briques sont
    // emballés dans une structure mensuelle compatible avec les projets financés.
    ['ongoing', 'upcoming'].forEach(status => {
        const projects = allProjectsData[status]?.projects;

        if (!Array.isArray(projects)) {
            return;
        }

        projects.forEach(proj => {
            if (proj.ownedBricks > 0) {
                combined.push({
                    yearMonthDate: 'N/A',
                    projects: [{ ...proj, projectStatus: status }]
                });
            }
        });
    });

    logger.info(LOG_CATEGORIES.API, 'API data merged', {
        totalEntries: combined.length
    });

    return combined;
}
