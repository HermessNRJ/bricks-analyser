/**
 * Simulation de projection du portefeuille
 *
 * Il ne s'agit pas d'une prévision : le calcul déroule mécaniquement les
 * hypothèses saisies par l'utilisateur (apport, rendement, taux d'impayés) mois
 * par mois. Changez une hypothèse, le résultat change — c'est une calculette,
 * pas un pronostic.
 */

import { CONFIG } from '../core/config.js';
import { logger, LOG_CATEGORIES } from '../utils/logger.js';

/** Bornes de saisie, pour éviter les simulations absurdes */
export const BORNES = {
    horizonMois: { min: 1, max: 600 },
    apportMensuel: { min: 0, max: 1000000 },
    tauxAnnuelBrut: { min: 0, max: 100 },
    tauxImpaye: { min: 0, max: 100 }
};

/**
 * Ramène une valeur dans ses bornes
 * @param {number} valeur - Valeur candidate
 * @param {{min: number, max: number}} bornes - Bornes autorisées
 * @param {number} defaut - Valeur de repli si la saisie n'est pas un nombre
 * @returns {number} Valeur bornée
 */
function borner(valeur, bornes, defaut) {
    const nombre = Number(valeur);

    if (!Number.isFinite(nombre)) {
        return defaut;
    }

    return Math.min(bornes.max, Math.max(bornes.min, nombre));
}

/**
 * Déroule la projection mois par mois
 *
 * @param {Object} hypotheses
 * @param {number} hypotheses.capitalInitial - Capital déjà investi (€)
 * @param {number} hypotheses.apportMensuel - Somme investie chaque mois (€)
 * @param {number} hypotheses.horizonMois - Durée simulée (mois)
 * @param {number} hypotheses.tauxAnnuelBrut - Rendement annuel brut (%)
 * @param {number} hypotheses.tauxImpaye - Part des revenus jamais perçue (%)
 * @param {boolean} [hypotheses.reinvestir] - Réinvestir les revenus nets
 * @param {number} [hypotheses.tauxImposition] - Fraction d'imposition (défaut : flat tax)
 * @returns {Object} Série mensuelle et totaux à l'horizon
 */
export function simulerProjection(hypotheses = {}) {
    const capitalInitial = Math.max(0, Number(hypotheses.capitalInitial) || 0);
    const apportMensuel = borner(hypotheses.apportMensuel, BORNES.apportMensuel, 0);
    const horizonMois = Math.round(borner(hypotheses.horizonMois, BORNES.horizonMois, 12));
    const tauxAnnuelBrut = borner(hypotheses.tauxAnnuelBrut, BORNES.tauxAnnuelBrut, 0);
    const tauxImpaye = borner(hypotheses.tauxImpaye, BORNES.tauxImpaye, 0);
    const reinvestir = Boolean(hypotheses.reinvestir);
    const tauxImposition = Number.isFinite(hypotheses.tauxImposition)
        ? hypotheses.tauxImposition
        : CONFIG.TAX_RATE;

    const tauxMensuel = tauxAnnuelBrut / 100 / 12;
    const partPercue = 1 - tauxImpaye / 100;

    let capital = capitalInitial;
    let cumulNet = 0;
    let cumulImpots = 0;
    let cumulPerdu = 0;
    let totalApporte = 0;

    const serie = [];

    for (let mois = 1; mois <= horizonMois; mois++) {
        // L'apport du mois est investi avant que les revenus ne courent
        capital += apportMensuel;
        totalApporte += apportMensuel;

        const brutTheorique = capital * tauxMensuel;
        const brutPercu = brutTheorique * partPercue;
        const impot = brutPercu * tauxImposition;
        const net = brutPercu - impot;

        cumulPerdu += brutTheorique - brutPercu;
        cumulImpots += impot;
        cumulNet += net;

        // Les revenus réinvestis produisent à leur tour dès le mois suivant
        if (reinvestir) {
            capital += net;
        }

        serie.push({
            mois,
            capital,
            revenuNetMensuel: net,
            cumulNet,
            cumulImpots
        });
    }

    const dernier = serie[serie.length - 1];

    const resultat = {
        serie,
        capitalFinal: dernier ? dernier.capital : capitalInitial,
        revenuNetMensuelFinal: dernier ? dernier.revenuNetMensuel : 0,
        cumulNet,
        cumulImpots,
        cumulPerdu,
        totalApporte,
        capitalInitial,
        horizonMois,
        // Ce que le portefeuille a rapporté net, rapporté à l'argent mis dedans
        rendementNetCumule: (capitalInitial + totalApporte) > 0
            ? (cumulNet / (capitalInitial + totalApporte)) * 100
            : 0
    };

    logger.debug(LOG_CATEGORIES.CALC_STATS, 'Forecast simulated', {
        horizonMois,
        capitalFinal: Math.round(resultat.capitalFinal),
        cumulNet: Math.round(cumulNet)
    });

    return resultat;
}

/**
 * Traduit un rendement annuel brut en ce qui reste réellement
 *
 * Le champ du simulateur se saisit en brut, comme l'annonce Bricks. Deux
 * conversions comptent : ce qui reste après le prélèvement forfaitaire, et ce
 * qui reste une fois les impayés déduits par-dessus.
 *
 * @param {number} tauxBrut - Rendement annuel brut (%)
 * @param {number} [tauxImpaye] - Part des revenus jamais perçue (%)
 * @param {number} [tauxImposition] - Fraction d'imposition (défaut : flat tax)
 * @returns {{apresImpot: number, apresTout: number}} Rendements nets (%)
 */
export function rendementsNets(tauxBrut, tauxImpaye = 0, tauxImposition = CONFIG.TAX_RATE) {
    const brut = Number.isFinite(Number(tauxBrut)) ? Math.max(0, Number(tauxBrut)) : 0;
    const impaye = Number.isFinite(Number(tauxImpaye))
        ? Math.min(100, Math.max(0, Number(tauxImpaye)))
        : 0;

    const apresImpot = brut * (1 - tauxImposition);
    const apresTout = apresImpot * (1 - impaye / 100);

    return { apresImpot, apresTout };
}

/**
 * Durée d'investissement moyenne du portefeuille, pondérée par le capital
 * @param {Array} properties - Liste des propriétés
 * @returns {number} Horizon moyen en mois
 */
export function horizonMoyenPondere(properties) {
    const engagees = (properties || []).filter(
        p => !p.isRefunded && p.investment > 0 && p.investmentHorizonInMonths > 0
    );

    const capital = engagees.reduce((somme, p) => somme + p.investment, 0);

    if (capital === 0) {
        return 0;
    }

    const pondere = engagees.reduce(
        (somme, p) => somme + p.investment * p.investmentHorizonInMonths, 0
    );

    return pondere / capital;
}

/**
 * Rendement annuel brut moyen du portefeuille, pondéré par le capital engagé
 * Sert d'hypothèse de départ au simulateur : plus honnête qu'un chiffre rond.
 * @param {Array} properties - Liste des propriétés
 * @returns {number} Rendement annuel brut moyen (%)
 */
export function rendementMoyenPondere(properties) {
    const engagees = (properties || []).filter(p => !p.isRefunded && p.investment > 0);
    const capital = engagees.reduce((somme, p) => somme + p.investment, 0);

    if (capital === 0) {
        return 0;
    }

    const pondere = engagees.reduce((somme, p) => somme + p.investment * (p.yearlyReturn || 0), 0);

    return pondere / capital;
}
