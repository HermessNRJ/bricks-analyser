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

        const echeances = Array.isArray(data.echeances) ? data.echeances : [];
        const impayees = echeances.filter(e => e.status === 'unpaid');

        // Les unités ne sont pas homogènes : les champs suffixés `_in_cents`
        // sont en centimes, `amount_due` est en euros. Vérifié sur un projet en
        // défaut, où `pending_investors_penalties_amount: 903` accompagne
        // `net_investors_penalties_in_cents: 90296`.
        const montantDu = impayees.reduce(
            (somme, e) => somme + (Number.isFinite(e.amount_due) ? e.amount_due : 0), 0
        );

        return {
            id: projectId,
            suivi: true,
            statut: data.project.status || null,
            impayees: impayees.length || Number(data.unpaid_count) || 0,
            penalites: (data.investors_penalties_summary?.total_amount_in_cents || 0) / 100,
            // Montants À L'ÉCHELLE DU PROJET : ils ne veulent rien dire sur une
            // fiche tant qu'ils n'ont pas été ramenés aux briques détenues, d'où
            // le nombre total de briques conservé avec eux.
            montantDu,
            briquesProjet: Number(data.number_of_bricks) || 0,
            derniereEcheanceImpayee: impayees
                .map(e => e.payment_date)
                .sort()
                .pop() || null,
            premiereEcheanceImpayee: impayees
                .map(e => e.payment_date)
                .sort()
                .shift() || null
        };

    } catch (err) {
        logger.warn(LOG_CATEGORIES.API, 'Project status request errored', { projectId, err });
        return { id: projectId, erreur: true };
    }
}

/** Actualités conservées par projet, et longueur retenue de chacune.
 *  Le flux complet ferait plusieurs mégaoctets sur 138 projets : le
 *  localStorage n'y survivrait pas, et les fiches n'en montrent que le début. */
const ACTUALITES_GARDEES = 3;
const LONGUEUR_ACTUALITE = 600;

/**
 * Récupère les dernières actualités d'un projet
 *
 * Ce flux est nettement plus riche que les alertes du portefeuille : il porte
 * le détail des démarches, des retards et des relances.
 *
 * @param {string} projectId - Identifiant du projet
 * @returns {Promise<Array>} Actualités { date, texte }, vide si indisponible
 */
export async function fetchProjectActivities(projectId) {
    try {
        const response = await fetch(
            `${BASE}/project-activities/public/${encodeURIComponent(projectId)}?limit=${ACTUALITES_GARDEES}`,
            { method: 'GET', headers: { 'Accept': 'application/json' } }
        );

        if (!response.ok) {
            return [];
        }

        const data = await response.json();

        return (data?.items || [])
            .slice(0, ACTUALITES_GARDEES)
            .map(item => ({
                date: item.created_at || null,
                texte: String(item.content || '').slice(0, LONGUEUR_ACTUALITE),
                tronquee: String(item.content || '').length > LONGUEUR_ACTUALITE
            }));

    } catch (err) {
        logger.warn(LOG_CATEGORIES.API, 'Project activities request errored', { projectId, err });
        return [];
    }
}

/**
 * Indique si un contentieux est ouvert sur un projet
 * @param {string} projectId - Identifiant du projet
 * @returns {Promise<boolean>} true si une procédure contentieuse est active
 */
export async function fetchProjectContentieux(projectId) {
    try {
        const response = await fetch(
            `${BASE}/projects/${encodeURIComponent(projectId)}/contentieux-investors`,
            { method: 'GET', headers: { 'Accept': 'application/json' } }
        );

        if (!response.ok) {
            return false;
        }

        const data = await response.json();
        return Boolean(data?.has_active_contentieux);

    } catch (err) {
        logger.warn(LOG_CATEGORIES.API, 'Contentieux request errored', { projectId, err });
        return false;
    }
}

/**
 * Applique un traitement à une liste, avec un parallélisme borné
 *
 * 200 requêtes lancées d'un coup seraient à la fois inutiles et agressives
 * pour l'API : on en tient au plus `concurrence` en vol.
 *
 * @param {Array} elements - Éléments à traiter
 * @param {Function} traitement - Appelé avec chaque élément
 * @param {number} concurrence - Appels simultanés
 * @param {Function} [surAvancement] - Appelé après chaque élément traité
 * @returns {Promise<void>}
 */
async function parLots(elements, traitement, concurrence, surAvancement) {
    let curseur = 0;

    const travailleur = async () => {
        while (curseur < elements.length) {
            const element = elements[curseur++];
            await traitement(element);

            if (surAvancement) {
                surAvancement();
            }
        }
    };

    await Promise.all(
        Array.from({ length: Math.min(concurrence, elements.length) }, travailleur)
    );
}

/**
 * Récupère le suivi complet de plusieurs projets
 *
 * Trois phases, chacune restreinte aux projets qu'elle concerne :
 *  1. les échéances, pour tous ;
 *  2. les actualités, pour ceux qui ont un dossier de suivi ;
 *  3. le contentieux, pour ceux déclarés en défaut — il ne survient pas ailleurs.
 *
 * @param {string[]} projectIds - Identifiants à interroger
 * @param {Object} [options]
 * @param {Function} [options.onProgress] - Appelé avec (faits, total, phase)
 * @param {number} [options.concurrence] - Appels simultanés
 * @param {Function} [options.fetcher] - Injection pour les tests (échéances)
 * @param {Function} [options.fetcherActualites] - Injection pour les tests
 * @param {Function} [options.fetcherContentieux] - Injection pour les tests
 * @returns {Promise<Object>} Statuts indexés par identifiant de projet
 */
export async function fetchProjectStatuses(projectIds, options = {}) {
    const {
        onProgress,
        concurrence = CONCURRENCE,
        fetcher = fetchProjectStatus,
        fetcherActualites = fetchProjectActivities,
        fetcherContentieux = fetchProjectContentieux
    } = options;

    const ids = [...new Set(projectIds || [])];
    const statuts = {};

    let faits = 0;
    const avancer = (phase, total) => () => {
        faits += 1;
        if (onProgress) {
            onProgress(faits, total, phase);
        }
    };

    // Phase 1 : l'état des échéances, pour chaque projet détenu
    await parLots(ids, async (id) => {
        const resultat = await fetcher(id);

        // Une erreur ponctuelle ne doit pas être mémorisée comme « sain » :
        // on l'omet, l'analyse retombera sur le texte des alertes.
        if (!resultat.erreur) {
            statuts[id] = resultat;
        }
    }, concurrence, avancer('échéances', ids.length));

    const avecSuivi = Object.values(statuts).filter(s => s.suivi).map(s => s.id);
    const enDefaut = Object.values(statuts)
        .filter(s => s.suivi && String(s.statut || '').toLowerCase() === 'defaulted')
        .map(s => s.id);

    const total = ids.length + avecSuivi.length + enDefaut.length;
    faits = ids.length;

    // Phase 2 : les actualités, là où il y a quelque chose à raconter
    await parLots(avecSuivi, async (id) => {
        statuts[id].actualites = await fetcherActualites(id);
    }, concurrence, avancer('actualités', total));

    // Phase 3 : le contentieux ne suit qu'un défaut
    await parLots(enDefaut, async (id) => {
        statuts[id].contentieux = await fetcherContentieux(id);
    }, concurrence, avancer('contentieux', total));

    logger.info(LOG_CATEGORIES.API, 'Project statuses fetched', {
        demandes: ids.length,
        obtenus: Object.keys(statuts).length,
        avecActualites: avecSuivi.length,
        contentieuxVerifies: enDefaut.length
    });

    return statuts;
}
