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
 * @returns {Object|null} { mensuel, versements, total, premierMois, dernierMois }
 */
export function normaliserHistoriqueRevenus(payload) {
    if (!payload || typeof payload !== 'object') {
        return null;
    }

    const entrees = Array.isArray(payload.revenuesByYearAndMonth)
        ? payload.revenuesByYearAndMonth
        : [];

    const mensuel = {};
    const versements = {};
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

        releverVersements(versements, mois, revenus);

        brutCentimes += Number.isFinite(brut) ? brut : 0;
        netCentimes += Number.isFinite(net) ? net : 0;
        impotCentimes += impot;
    });

    // L'API répond depuis la date demandée, pas depuis le premier versement :
    // demander large ramenait des mois à zéro et faisait démarrer les courbes
    // en janvier 2020 pour un portefeuille ouvert fin 2023. Les mois vides du
    // début ne sont pas de l'histoire, seulement l'amplitude de la question.
    const mois = rognerDebutVide(mensuel);

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
        versements,
        parAnnee: grouperParAnnee(mensuel),
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
 * Ventile les coupons d'un mois entre les propriétés qui les ont versés
 *
 * Seuls les coupons obligataires sont rattachés à un projet : le parrainage et
 * le solde boosté ne viennent d'aucune propriété.
 *
 * Une propriété absente du mois n'a rien versé : elle n'apparaît pas dans la
 * ventilation plutôt que d'y figurer à zéro, pour que « n'a rien versé » et
 * « n'était pas encore détenue » restent deux choses distinctes.
 *
 * @param {Object} versements - Accumulateur { propriété: { mois: euros } }
 * @param {string} mois - Mois au format YYYY-MM
 * @param {Object} revenus - Bloc `revenues` de l'entrée mensuelle
 */
function releverVersements(versements, mois, revenus) {
    const parPropriete = revenus.obligationCoupons?.byProperty;

    if (!Array.isArray(parPropriete)) {
        return;
    }

    parPropriete.forEach(ligne => {
        const id = ligne?.propertyId;
        const valeur = Number.isFinite(ligne?.value) ? ligne.value : 0;

        if (typeof id !== 'string' || !id || valeur === 0) {
            return;
        }

        const propriete = versements[id] ||= {};
        propriete[mois] = Math.round((propriete[mois] || 0) * 100 + valeur) / 100;
    });
}

/**
 * Retire les mois sans le moindre mouvement en tête d'historique
 *
 * Seul le début est rogné : un mois vide au milieu est une information — rien
 * n'a été versé ce mois-là — alors qu'un mois vide avant le premier versement
 * n'est qu'un artefact de la plage demandée.
 *
 * @param {Object} mensuel - Revenus par mois ; les mois rognés en sont retirés
 * @returns {Array<string>} Mois conservés, triés
 */
function rognerDebutVide(mensuel) {
    const mois = Object.keys(mensuel).sort();
    const premier = mois.findIndex(m => mensuel[m].brut !== 0 || mensuel[m].net !== 0);

    if (premier === -1) {
        mois.forEach(m => delete mensuel[m]);
        return [];
    }

    const vides = mois.slice(0, premier);
    vides.forEach(m => delete mensuel[m]);

    if (vides.length > 0) {
        logger.debug(LOG_CATEGORIES.API, 'Empty months trimmed from history start', {
            trimmed: vides.length,
            firstKept: mois[premier]
        });
    }

    return mois.slice(premier);
}

/**
 * Regroupe les revenus par année civile
 *
 * L'impôt se déclare par année, pas par mois. La ventilation distingue ce sur
 * quoi Bricks a déjà prélevé — les coupons — de ce qu'il verse brut : le
 * parrainage et le solde boosté ne subissent aucune retenue à la source.
 * Vérifié sur l'ensemble de l'historique : mois après mois, le prélèvement
 * retenu s'applique aux seuls coupons, et `taxedTotal` vaut exactement
 * `coupons − prélèvement + parrainage + solde boosté`.
 *
 * @param {Object} mensuel - Revenus par mois, en euros
 * @returns {Object} Années décroissantes { 2026: { coupons, impot, ... } }
 */
function grouperParAnnee(mensuel) {
    const annees = {};

    Object.keys(mensuel).sort().forEach(mois => {
        const annee = mois.slice(0, 4);
        const m = mensuel[mois];

        const cumul = annees[annee] ||= {
            brut: 0, net: 0, impot: 0, coupons: 0, parrainage: 0, boost: 0
        };

        cumul.brut += m.brut;
        cumul.net += m.net;
        cumul.impot += m.impot;
        cumul.coupons += m.coupons;
        cumul.parrainage += m.parrainage;
        cumul.boost += m.boost;
    });

    // Les flottants cumulés dérivent : on rétablit le centime
    Object.values(annees).forEach(cumul => {
        Object.keys(cumul).forEach(champ => {
            cumul[champ] = Math.round(cumul[champ] * 100) / 100;
        });
    });

    return annees;
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
