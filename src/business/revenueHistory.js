/**
 * Historique des revenus réellement versés par Bricks
 *
 * Le reste de l'application raisonne en revenus ATTENDUS : chaque projet détenu
 * est censé verser son coupon tous les mois, au taux affiché. C'est une
 * espérance, pas une observation. Elle ignore les échéances non versées, les
 * projets déjà remboursés (qui ont pourtant versé pendant des mois), le
 * parrainage, le solde boosté, et retient un prélèvement forfaitaire là où
 * Bricks en applique un autre — le remboursement de capital glissé dans un
 * coupon n'étant pas imposable.
 *
 * Ce module traduit l'état de compte de Bricks, qui lui dit ce qui a été
 * encaissé. Les montants y sont exprimés en centimes et les mois indexés à
 * partir de zéro : `{year: 2026, month: 6}` est juillet 2026.
 */

import { logger, LOG_CATEGORIES } from '../utils/logger.js';

/**
 * Convertit des centimes en euros
 * @param {*} centimes - Valeur brute renvoyée par l'API
 * @returns {number} Montant en euros, 0 si la valeur est inexploitable
 */
function enEuros(centimes) {
    return Number.isFinite(centimes) ? centimes / 100 : 0;
}

/**
 * Compose une clé de mois à partir de l'année et de l'index renvoyés par l'API
 * @param {number} annee - Année sur quatre chiffres
 * @param {number} indexMois - Index du mois, janvier valant 0
 * @returns {string|null} Mois au format YYYY-MM, null si le couple est invalide
 */
export function moisDepuisIndex(annee, indexMois) {
    if (!Number.isInteger(annee) || !Number.isInteger(indexMois)) {
        return null;
    }

    if (annee < 2000 || annee > 2999 || indexMois < 0 || indexMois > 11) {
        return null;
    }

    return `${annee}-${String(indexMois + 1).padStart(2, '0')}`;
}

/**
 * Ramène l'état de compte Bricks à un historique mensuel exploitable
 *
 * Les totaux sont recalculés depuis les mois plutôt que repris du bloc
 * `revenuesTotal` : la tuile « net cumulé » doit être la somme de ce que trace
 * la courbe, sans quoi les deux se contrediraient si la plage demandée et la
 * ventilation mensuelle venaient à diverger.
 *
 * @param {Object} payload - Corps de la réponse /investor/portfolio/revenue
 * @returns {Object|null} { mensuel, total, premierMois, dernierMois } ou null
 */
export function normaliserHistoriqueRevenus(payload) {
    if (!payload || typeof payload !== 'object') {
        return null;
    }

    const entrees = Array.isArray(payload.revenuesByYearAndMonth)
        ? payload.revenuesByYearAndMonth
        : [];

    const mensuel = {};
    let brutCentimes = 0;
    let netCentimes = 0;
    let impotCentimes = 0;

    entrees.forEach(entree => {
        const mois = moisDepuisIndex(entree?.year, entree?.month);

        if (!mois) {
            logger.warn(LOG_CATEGORIES.API, 'Revenue entry with unusable date, skipped', {
                year: entree?.year,
                month: entree?.month
            });
            return;
        }

        const revenus = entree.revenues || {};

        // Le prélèvement est renvoyé négatif : on le manipule en valeur absolue
        const impot = Math.abs(revenus.withholdingTax?.total ?? 0);
        const brut = entree.untaxedTotal;
        const net = entree.taxedTotal;

        mensuel[mois] = {
            brut: enEuros(brut),
            net: enEuros(net),
            impot: enEuros(impot),
            coupons: enEuros(revenus.obligationCoupons?.untaxedTotal ?? 0),
            parrainage: enEuros(revenus.referrals?.total ?? 0),
            boost: enEuros(revenus.boostedBalanceGain?.total ?? 0)
        };

        brutCentimes += Number.isFinite(brut) ? brut : 0;
        netCentimes += Number.isFinite(net) ? net : 0;
        impotCentimes += impot;
    });

    const mois = Object.keys(mensuel).sort();

    if (mois.length === 0) {
        logger.warn(LOG_CATEGORIES.API, 'Revenue history contains no usable month');
        return null;
    }

    logger.info(LOG_CATEGORIES.API, 'Revenue history normalised', {
        months: mois.length,
        firstMonth: mois[0],
        lastMonth: mois[mois.length - 1]
    });

    return {
        mensuel,
        premierMois: mois[0],
        dernierMois: mois[mois.length - 1],
        total: {
            brut: enEuros(brutCentimes),
            net: enEuros(netCentimes),
            impot: enEuros(impotCentimes)
        }
    };
}

/**
 * Extrait une série mensuelle prête pour les graphiques
 * @param {Object} historique - Historique normalisé
 * @param {string} champ - Champ à projeter ('net', 'brut' ou 'impot')
 * @returns {Object} Série { 'YYYY-MM': montant }
 */
export function serieMensuelle(historique, champ) {
    const serie = {};

    if (!historique?.mensuel) {
        return serie;
    }

    Object.keys(historique.mensuel).sort().forEach(mois => {
        serie[mois] = historique.mensuel[mois][champ] ?? 0;
    });

    return serie;
}
