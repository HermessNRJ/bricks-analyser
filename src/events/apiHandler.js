/**
 * Gestionnaire de récupération des données via API
 */

import { fetchFinancedProjects, fetchAllProjects, mergeAPIProjects, fetchWarnings, fetchHistoriqueRevenus, fetchTransactionsPortefeuille, normalizeSessionCookie, hasSessionCookie } from '../data/apiClient.js';
import { normaliserTransactions } from '../business/walletHistory.js';
import { normaliserApports, reconcilierJournal } from '../business/apports.js';
import { processData } from '../business/processor.js';
import { showError, hideError } from '../ui/modals.js';
import { logger, LOG_CATEGORIES } from '../utils/logger.js';
import { rafraichirStatuts } from './statusHandler.js';

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

    const loadFromAPI = async () => {
        // Le bouton est désactivé pendant un chargement : évite un double envoi
        // via la touche Entrée.
        if (fetchBtn.disabled) {
            return;
        }

        const session = normalizeSessionCookie(tokenInput.value);

        if (!session) {
            showError('Veuillez coller votre cookie de session Bricks.');
            return;
        }

        if (!hasSessionCookie(session)) {
            showError("Le cookie de session Bricks (better-auth.session_token) est absent de la valeur collée. Copiez l'en-tête Cookie complet depuis les outils de développement sur app.bricks.co.");
            return;
        }

        logger.info(LOG_CATEGORIES.EVENT, 'API fetch initiated');

        // UI feedback
        loadingMsg.classList.remove('hidden');
        fetchBtn.disabled = true;
        hideError();

        try {
            // Récupérer les projets financés : sans eux, rien à afficher
            const financedData = await fetchFinancedProjects(session);

            // Récupérer les projets en cours/à venir
            let allProjectsData;
            try {
                allProjectsData = await fetchAllProjects(session);
            } catch (secondErr) {
                logger.warn(LOG_CATEGORIES.EVENT, 'Failed to fetch ongoing/upcoming projects', secondErr);
                showError(`Données des projets financés chargées, mais échec de la récupération des projets en cours/à venir: ${secondErr.message}`);
                // Continuer avec les données partielles
                allProjectsData = { ongoing: { projects: [] }, upcoming: { projects: [] } };
            }

            // Fusionner les données
            const combinedData = mergeAPIProjects(financedData, allProjectsData);

            // Les warnings sont accessoires : fetchWarnings renvoie [] en cas d'échec
            const warningsData = await fetchWarnings(session);
            logger.info(LOG_CATEGORIES.EVENT, 'Warnings retrieved', {
                count: warningsData.length,
                propertyIds: warningsData.map(w => w.propertyId)
            });

            // L'état de compte dit ce qui a RÉELLEMENT été versé : sans lui on
            // retombe sur l'estimation, qui compte les impayés comme encaissés.
            const revenus = await fetchHistoriqueRevenus(session);

            if (revenus) {
                logger.info(LOG_CATEGORIES.EVENT, 'Revenue history retrieved', {
                    months: Object.keys(revenus.mensuel).length,
                    netTotal: revenus.total.net
                });
            } else {
                logger.warn(LOG_CATEGORIES.EVENT, 'Revenue history unavailable, falling back to estimate');
            }

            // Le journal des mouvements nomme chaque versement : lui seul
            // distingue un remboursement de capital d'un coupon.
            loadingMsg.textContent = 'Lecture du journal des mouvements…';

            const transactions = await fetchTransactionsPortefeuille(session, {
                onProgress: (nombre) => {
                    loadingMsg.textContent = `Lecture du journal des mouvements… ${nombre} lignes`;
                }
            });

            const capital = normaliserTransactions(transactions);
            const apports = normaliserApports(transactions);

            // Additionner toutes les lignes doit rendre le solde du portefeuille :
            // le seul contrôle qui dise si une nature de mouvement nous échappe.
            reconcilierJournal(transactions);

            if (capital) {
                logger.info(LOG_CATEGORIES.EVENT, 'Capital repayments retrieved', {
                    total: capital.total,
                    transactions: capital.nombre
                });
            }

            loadingMsg.textContent = 'Chargement des données…';

            // Traiter les données avec les warnings
            await processData(combinedData, warningsData, { revenus, capital, apports });

            // Ne pas laisser la session dans le DOM
            tokenInput.value = '';

            // Le statut officiel de chaque projet demande un appel par projet :
            // on enchaîne ici, une fois les données à l'écran, plutôt que de
            // faire attendre l'affichage.
            rafraichirStatuts();

            logger.info(LOG_CATEGORIES.EVENT, 'API data processed successfully');

        } catch (err) {
            // Couvre l'échec de /projects/financed comme celui du traitement des données :
            // dans les deux cas il n'y a rien à afficher, on remonte l'erreur telle quelle.
            logger.error(LOG_CATEGORIES.EVENT, 'API fetch failed', err);
            showError(err.message || "Une erreur inconnue est survenue lors de la récupération des données API.");
        } finally {
            loadingMsg.classList.add('hidden');
            fetchBtn.disabled = false;
        }
    };

    fetchBtn.addEventListener('click', loadFromAPI);

    // Coller le cookie puis Entrée : le parcours le plus courant
    tokenInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            loadFromAPI();
        }
    });

    logger.debug(LOG_CATEGORIES.EVENT, 'API handler configured');
}
