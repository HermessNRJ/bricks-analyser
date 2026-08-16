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
    const capitalConnu = Boolean(results.revenusReels?.capital);
    const apportsConnus = Boolean(results.revenusReels?.apports);
    const impotAVenir = results.revenusReels?.impotAVenir || null;

    // Sans état de compte, aucune ventilation fiable : mieux vaut ne rien
    // montrer qu'un tableau déduit des taux affichés.
    if (!parAnnee || Object.keys(parAnnee).length === 0) {
        section.classList.add('hidden');
        return;
    }

    section.classList.remove('hidden');

    const annees = Object.keys(parAnnee).sort().reverse();
    const cumul = {
        coupons: 0, impot: 0, parrainage: 0, boost: 0,
        capital: 0, apport: 0, etranger: 0, impotAVenir: 0
    };

    const lignes = annees.map(annee => {
        const a = parAnnee[annee];
        cumul.coupons += a.coupons;
        cumul.impot += a.impot;
        cumul.parrainage += a.parrainage;
        cumul.boost += a.boost;
        cumul.capital += a.capital || 0;
        cumul.apport += a.apport || 0;
        cumul.etranger += a.etranger || 0;
        cumul.impotAVenir += a.impotAVenir || 0;

        return ligne(escapeHtml(annee), a);
    });

    corps.innerHTML = lignes.join('') + ligne('Total', cumul, 'ligne-total');

    majColonne('colonne-avenir', Boolean(impotAVenir));
    majColonne('colonne-capital', capitalConnu);
    majColonne('colonne-apport', apportsConnus);

    if (resume) {
        const phrases = [impotAVenir
            ? `${formatCurrency(impotAVenir.total.base)} reçus sans retenue à la source depuis le début`
              + ` — ${formatCurrency(cumul.etranger)} de coupons étrangers,`
              + ` ${formatCurrency(cumul.parrainage)} de parrainage,`
              + ` ${formatCurrency(cumul.boost)} de solde boosté. Bricks n'a rien prélevé dessus :`
              + ` environ ${formatCurrency(impotAVenir.total.impot)} d'impôt restent à payer,`
              + ' au barème en vigueur le mois de l\'encaissement.'
            : 'Aucun revenu versé sans retenue à la source pour le moment.'];

        if (capitalConnu) {
            phrases.push(`${formatCurrency(cumul.capital)} de capital vous ont par ailleurs été remboursés : c'est votre mise qui revient, pas un gain.`);
        }

        if (apportsConnus) {
            phrases.push(`Vous avez versé ${formatCurrency(cumul.apport)} de votre poche sur la période.`);
        }

        resume.textContent = phrases.join(' ');
    }

    logger.debug(LOG_CATEGORIES.UI, 'Yearly revenue table rendered', { years: annees.length });
}

/**
 * Masque une colonne tant que le journal n'a pas été lu
 * Une colonne de zéros se lirait comme « aucun remboursement » ou « je n'ai
 * jamais rien déposé », alors qu'elle ne dirait que l'absence de la source.
 * @param {string} classe - Classe portée par les cellules de la colonne
 * @param {boolean} connu - true si la source a été récupérée
 */
function majColonne(classe, connu) {
    document.querySelectorAll(`.${classe}`).forEach(cellule => {
        cellule.classList.toggle('hidden', !connu);
    });
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
            <td class="colonne-brute colonne-avenir">${formatCurrency(montants.impotAVenir || 0)}</td>
            <td class="colonne-brute">${formatCurrency(montants.parrainage)}</td>
            <td class="colonne-brute">${formatCurrency(montants.boost)}</td>
            <td class="colonne-capital">${formatCurrency(montants.capital || 0)}</td>
            <td class="colonne-apport">${formatCurrency(montants.apport || 0)}</td>
        </tr>
    `;
}
