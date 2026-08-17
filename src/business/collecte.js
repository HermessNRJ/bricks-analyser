/**
 * Traitement d'une collecte brute, quelle que soit sa provenance
 *
 * Deux chemins amènent désormais les mêmes données : l'appel direct à l'API
 * depuis l'application, et le fichier écrit par le favori exécuté sur
 * app.bricks.co. Ils diffèrent par le transport, pas par le contenu — les cinq
 * réponses de l'API sont les mêmes octets dans les deux cas.
 *
 * D'où ce module : la suite « normaliser puis traiter » n'existe qu'ici. La
 * dupliquer côté fichier aurait laissé deux versions du même enchaînement, dont
 * une seule serait restée juste au premier changement de format.
 */

import { mergeAPIProjects } from '../data/apiClient.js';
import { normaliserHistoriqueRevenus } from './revenueHistory.js';
import { normaliserTransactions } from './walletHistory.js';
import { normaliserApports, reconcilierJournal } from './apports.js';
import { processData } from './processor.js';
import { logger, LOG_CATEGORIES } from '../utils/logger.js';

/** Format attendu dans l'enveloppe écrite par le favori */
export const FORMAT_COLLECTE = 'bricks-analyser/collecte';

/** Version de l'enveloppe. Voir FORMAT dans src/collecte/extracteur.js. */
export const VERSION_COLLECTE = 1;

/**
 * Vérifie qu'un fichier importé est bien une collecte lisible
 *
 * Un favori posé il y a six mois produit encore un fichier d'apparence valide ;
 * seule la version dit s'il est encore compris. Mieux vaut un refus qui nomme la
 * cause qu'un tableau de bord à moitié rempli, qui se lit comme un vrai relevé.
 *
 * @param {*} enveloppe - Contenu désérialisé du fichier
 * @returns {{valide: boolean, erreur?: string}} Verdict et motif du refus
 */
export function validerEnveloppe(enveloppe) {
    if (!enveloppe || typeof enveloppe !== 'object') {
        return { valide: false, erreur: 'Ce fichier ne contient pas de JSON exploitable.' };
    }

    if (enveloppe.format !== FORMAT_COLLECTE) {
        return {
            valide: false,
            erreur: 'Ce fichier ne vient pas du favori de collecte : il ne porte pas la marque'
                + ` « ${FORMAT_COLLECTE} ».`
        };
    }

    if (enveloppe.version !== VERSION_COLLECTE) {
        return {
            valide: false,
            erreur: `Ce fichier a été écrit par un favori de version ${enveloppe.version}, et`
                + ` l'application attend la version ${VERSION_COLLECTE}. Reposez le favori depuis`
                + ' cette page, puis relancez la collecte.'
        };
    }

    if (!enveloppe.brut || !Array.isArray(enveloppe.brut.financed)) {
        return {
            valide: false,
            erreur: 'La collecte ne contient aucun projet financé — elle a probablement été'
                + ' interrompue. Relancez le favori depuis app.bricks.co.'
        };
    }

    return { valide: true };
}

/**
 * Normalise une collecte brute et la porte à l'écran
 *
 * L'ordre importe : les projets d'abord, parce qu'eux seuls conditionnent
 * l'affichage ; le reste enrichit. L'historique des revenus dit ce qui a
 * RÉELLEMENT été versé — sans lui on retombe sur l'estimation, qui compte les
 * impayés comme encaissés. Le journal, lui, est le seul à distinguer un
 * remboursement de capital d'un coupon.
 *
 * @param {Object} brut - { financed, projets, alertes, revenus, transactions }
 * @param {Object} [options]
 * @param {Function} [options.surAvancement] - Reçoit un libellé d'étape
 * @returns {Promise<Object>} Décompte de ce qui a été traité
 */
export async function traiterCollecte(brut, { surAvancement } = {}) {
    const avancer = (texte) => {
        if (typeof surAvancement === 'function') {
            surAvancement(texte);
        }
    };

    const projets = brut.projets || { ongoing: { projects: [] }, upcoming: { projects: [] } };
    const donnees = mergeAPIProjects(brut.financed, projets);
    const alertes = Array.isArray(brut.alertes) ? brut.alertes : [];

    const revenus = brut.revenus ? normaliserHistoriqueRevenus(brut.revenus) : null;

    if (!revenus) {
        logger.warn(LOG_CATEGORIES.EVENT, 'Revenue history unavailable, falling back to estimate');
    }

    const transactions = Array.isArray(brut.transactions) ? brut.transactions : [];
    const capital = normaliserTransactions(transactions);
    const apports = normaliserApports(transactions);

    // Additionner toutes les lignes doit rendre le solde du portefeuille :
    // le seul contrôle qui dise si une nature de mouvement nous échappe.
    reconcilierJournal(transactions);

    avancer('Chargement des données…');

    await processData(donnees, alertes, { revenus, capital, apports });

    const compte = {
        entrees: donnees.length,
        alertes: alertes.length,
        transactions: transactions.length,
        revenus: revenus ? Object.keys(revenus.mensuel).length : 0
    };

    logger.info(LOG_CATEGORIES.EVENT, 'Collection processed', compte);

    return compte;
}
