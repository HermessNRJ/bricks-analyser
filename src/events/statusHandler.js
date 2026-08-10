/**
 * Récupération du suivi officiel des projets
 *
 * Une requête par projet détenu : l'API de suivi n'expose pas de vue
 * d'ensemble. Les appels sont donc bornés en parallélisme, la progression est
 * affichée, et le résultat est conservé pour qu'un simple rechargement de page
 * ne relance pas la série.
 */

import { fetchProjectStatuses } from '../data/projectStatusClient.js';
import { loadFromLocalStorage, saveToLocalStorage } from '../data/storage.js';
import { finalizeProcessing } from '../business/processor.js';
import { state } from '../core/state.js';
import { logger, LOG_CATEGORIES } from '../utils/logger.js';

let enCours = false;

/**
 * Écrit l'état d'avancement à l'écran
 * @param {string} texte - Message à afficher, vide pour masquer
 */
function afficherProgression(texte) {
    const element = document.getElementById('statusProgress');

    if (!element) {
        return;
    }

    element.textContent = texte;
    element.classList.toggle('hidden', !texte);
}

/**
 * Récupère le statut officiel des propriétés détenues et rejoue l'analyse
 * @param {Object} [options]
 * @param {boolean} [options.silencieux] - Ne rien afficher pendant la course
 * @returns {Promise<Object>} Statuts obtenus, indexés par identifiant
 */
export async function rafraichirStatuts({ silencieux = false } = {}) {
    if (enCours) {
        return {};
    }

    const stockage = loadFromLocalStorage();
    const donnees = stockage?.data;

    if (!donnees || donnees.length === 0) {
        return {};
    }

    // Seules les propriétés encore détenues portent un risque : interroger les
    // projets soldés serait autant d'appels pour rien.
    const resultats = state.get('lastResults');
    const cibles = (resultats?.properties || [])
        .filter(p => !p.isRefunded)
        .map(p => p.id);

    if (cibles.length === 0) {
        return {};
    }

    enCours = true;
    const bouton = document.getElementById('refreshStatusBtn');
    if (bouton) bouton.disabled = true;

    try {
        const statuts = await fetchProjectStatuses(cibles, {
            onProgress: (faits, total) => {
                if (!silencieux) {
                    afficherProgression(`Vérification du statut des projets… ${faits} / ${total}`);
                }
            }
        });

        saveToLocalStorage(stockage.data, stockage.warnings, { statuts });

        // Rejouer l'analyse : les tuiles d'incident reposent désormais sur le
        // statut officiel plutôt que sur le texte des alertes.
        await finalizeProcessing(stockage.data, stockage.warnings, { statuts });

        logger.info(LOG_CATEGORIES.API, 'Project statuses refreshed', {
            demandes: cibles.length,
            obtenus: Object.keys(statuts).length
        });

        return statuts;

    } catch (err) {
        logger.error(LOG_CATEGORIES.API, 'Failed to refresh project statuses', err);
        afficherProgression('Impossible de vérifier le statut des projets.');
        return {};

    } finally {
        enCours = false;
        if (bouton) bouton.disabled = false;

        // Laisser le dernier compteur visible un instant, puis effacer
        if (!silencieux) {
            setTimeout(() => afficherProgression(''), 4000);
        }
    }
}

/**
 * Configure le bouton de vérification des statuts
 */
export function setupStatusHandler() {
    const bouton = document.getElementById('refreshStatusBtn');

    if (!bouton) {
        return;
    }

    bouton.addEventListener('click', () => rafraichirStatuts());

    logger.debug(LOG_CATEGORIES.EVENT, 'Status handler configured');
}
