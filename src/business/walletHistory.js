/**
 * Lecture du journal des mouvements du portefeuille
 *
 * L'état de compte range les remboursements de capital avec les coupons : en
 * juin 2026, Villa Gypsea y figure pour 34,67 € quand son coupon mensuel vaut
 * 4,33 €. Le reste est du capital rendu — pas un revenu, et l'écart se voit
 * jusque sur le prélèvement, qui tombe à 18 % là où le barème est à 31,4 %.
 *
 * Le journal, lui, nomme chaque mouvement. C'est le seul endroit où capital et
 * intérêts se distinguent.
 */

import { logger, LOG_CATEGORIES } from '../utils/logger.js';

/**
 * Statuts qui annulent un mouvement
 * Tout autre statut est compté : « confirmed » et « waiting » désignent tous
 * deux de l'argent dû, seul le calendrier les sépare.
 */
const STATUTS_ANNULES = ['cancelled', 'canceled', 'failed', 'refused', 'rejected'];

/**
 * Reconnaît un remboursement de capital
 * La formulation exacte varie (`_partial`, et vraisemblablement un équivalent
 * pour un solde total) : on s'attache à la racine plutôt qu'à la liste.
 * @param {string} kind - Nature du mouvement
 * @returns {boolean} true s'il s'agit d'un remboursement de capital
 */
function estRemboursementCapital(kind) {
    return typeof kind === 'string' && kind.includes('principal_repayment');
}

/**
 * Ramène le journal à un cumul de capital remboursé, par mois et par année
 *
 * @param {Array} transactions - Journal brut renvoyé par l'API
 * @returns {Object|null} { parMois, parAnnee, total, nombre } ou null si vide
 */
export function normaliserTransactions(transactions) {
    if (!Array.isArray(transactions) || transactions.length === 0) {
        return null;
    }

    const parMois = {};
    let totalCentimes = 0;
    let nombre = 0;
    let ignorees = 0;

    transactions.forEach(transaction => {
        if (!estRemboursementCapital(transaction?.kind)) {
            return;
        }

        if (STATUTS_ANNULES.includes(transaction.status)) {
            ignorees++;
            return;
        }

        const mois = moisDeLaDate(transaction.createdAt);
        const valeur = Number.isFinite(transaction.value) ? transaction.value : 0;

        if (!mois || valeur === 0) {
            return;
        }

        parMois[mois] = (parMois[mois] || 0) + valeur;
        totalCentimes += valeur;
        nombre++;
    });

    if (nombre === 0) {
        logger.info(LOG_CATEGORIES.API, 'No capital repayment found in wallet journal');
        return null;
    }

    Object.keys(parMois).forEach(mois => {
        parMois[mois] = parMois[mois] / 100;
    });

    logger.info(LOG_CATEGORIES.API, 'Capital repayments extracted', {
        transactions: nombre,
        months: Object.keys(parMois).length,
        cancelled: ignorees
    });

    return {
        parMois,
        parAnnee: cumulerParAnnee(parMois),
        total: totalCentimes / 100,
        nombre
    };
}

/**
 * Extrait le mois d'un horodatage ISO
 * @param {string} date - Horodatage ISO
 * @returns {string|null} Mois au format YYYY-MM, null si illisible
 */
function moisDeLaDate(date) {
    if (typeof date !== 'string' || date.length < 7) {
        return null;
    }

    const mois = date.slice(0, 7);

    return /^\d{4}-\d{2}$/.test(mois) ? mois : null;
}

/**
 * Cumule les montants mensuels par année civile
 * @param {Object} parMois - Montants par mois, en euros
 * @returns {Object} Montants par année
 */
function cumulerParAnnee(parMois) {
    const annees = {};

    Object.keys(parMois).forEach(mois => {
        const annee = mois.slice(0, 4);
        annees[annee] = (annees[annee] || 0) + parMois[mois];
    });

    Object.keys(annees).forEach(annee => {
        annees[annee] = Math.round(annees[annee] * 100) / 100;
    });

    return annees;
}
