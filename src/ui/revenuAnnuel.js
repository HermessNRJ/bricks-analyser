/**
 * Ventilation des revenus par année civile
 *
 * L'impôt se déclare par année. Bricks prélève à la source sur les coupons,
 * mais pas sur tout : le parrainage et le solde boosté arrivent bruts, sans
 * retenue. Ce sont eux que l'on risque d'oublier au moment de déclarer, parce
 * qu'ils tombent au centime et ne ressemblent pas à un revenu.
 */

import { formatCurrency } from '../utils/formatters.js';
import { escapeHtml } from '../utils/html.js';
import { logger, LOG_CATEGORIES } from '../utils/logger.js';

/**
 * Affiche le tableau des revenus par année
 * @param {Object} results - Résultats des calculs
 */
export function afficherRevenusParAnnee(results) {
    const section = document.getElementById('revenusAnnuels');
    const corps = document.getElementById('revenusAnnuelsCorps');
    const resume = document.getElementById('revenusAnnuelsResume');

    if (!section || !corps) {
        return;
    }

    const parAnnee = results.revenusReels?.parAnnee;

    // Sans état de compte, aucune ventilation fiable : mieux vaut ne rien
    // montrer qu'un tableau déduit des taux affichés.
    if (!parAnnee || Object.keys(parAnnee).length === 0) {
        section.classList.add('hidden');
        return;
    }

    section.classList.remove('hidden');

    const annees = Object.keys(parAnnee).sort().reverse();
    const cumul = { coupons: 0, impot: 0, parrainage: 0, boost: 0 };

    const lignes = annees.map(annee => {
        const a = parAnnee[annee];
        cumul.coupons += a.coupons;
        cumul.impot += a.impot;
        cumul.parrainage += a.parrainage;
        cumul.boost += a.boost;

        return ligne(escapeHtml(annee), a);
    });

    corps.innerHTML = lignes.join('') + ligne('Total', cumul, 'ligne-total');

    if (resume) {
        const aDeclarer = cumul.parrainage + cumul.boost;
        resume.textContent = aDeclarer > 0
            ? `${formatCurrency(aDeclarer)} reçus sans retenue à la source depuis le début — ${formatCurrency(cumul.parrainage)} de parrainage et ${formatCurrency(cumul.boost)} de solde boosté.`
            : 'Aucun revenu versé sans retenue à la source pour le moment.';
    }

    logger.debug(LOG_CATEGORIES.UI, 'Yearly revenue table rendered', { years: annees.length });
}

/**
 * Compose une ligne du tableau
 * @param {string} libelle - Année ou libellé de la ligne
 * @param {Object} montants - Montants de la ligne
 * @param {string} [classe] - Classe CSS supplémentaire
 * @returns {string} Ligne HTML
 */
function ligne(libelle, montants, classe = '') {
    return `
        <tr${classe ? ` class="${classe}"` : ''}>
            <th scope="row">${libelle}</th>
            <td>${formatCurrency(montants.coupons)}</td>
            <td>${formatCurrency(montants.impot)}</td>
            <td class="colonne-brute">${formatCurrency(montants.parrainage)}</td>
            <td class="colonne-brute">${formatCurrency(montants.boost)}</td>
        </tr>
    `;
}
