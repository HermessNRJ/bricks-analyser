/**
 * Ce que Bricks n'a pas prélevé, et qu'il faudra payer
 *
 * Bricks retient le prélèvement forfaitaire à la source sur les coupons
 * français, et vous verse le net. Trois recettes échappent à cette retenue :
 *
 * - les **coupons étrangers** — un projet portugais ou espagnol verse brut, et
 *   l'impôt est réclamé plus tard, sur la déclaration de revenus ;
 * - le **parrainage**, versé brut ;
 * - le **solde boosté**, ces centimes crédités jour après jour, bruts eux aussi.
 *
 * Elles ont ceci de traître qu'elles ressemblent à de l'argent déjà net. Le
 * tableau de bord affichait jusqu'ici leur montant sans jamais dire ce qu'elles
 * coûteraient : au printemps suivant, l'impôt tombe sans qu'on l'ait provisionné.
 *
 * Ce module chiffre la note à venir, au barème en vigueur le mois de
 * l'encaissement. C'est un ordre de grandeur, pas une déclaration : le taux
 * réel dépend de votre situation, et un projet étranger peut ouvrir droit à un
 * crédit d'impôt au titre de la convention fiscale du pays. L'IFU transmis par
 * Bricks reste la référence.
 */

import { tauxImpositionPour } from '../core/config.js';
import { logger, LOG_CATEGORIES } from '../utils/logger.js';

/**
 * Ventile les coupons du mois entre France et étranger
 *
 * Le pays se lit sur la propriété, pas sur le versement : l'état de compte ne
 * dit que des identifiants de projet. Une propriété inconnue de la ventilation
 * — vendue, puis disparue du portefeuille — est comptée comme française, le
 * pays étant indécidable et la France le cas de très loin le plus fréquent.
 *
 * @param {Object} versements - Ventilation { propriété: { mois: montant } }
 * @param {Array} properties - Propriétés, porteuses du pays détecté
 * @returns {Object} Coupons étrangers par mois, en euros
 */
export function couponsEtrangersParMois(versements, properties) {
    const parMois = {};

    if (!versements || !Array.isArray(properties)) {
        return parMois;
    }

    const etrangeres = new Set(
        properties.filter(p => p.country && p.country !== 'France').map(p => p.id)
    );

    if (etrangeres.size === 0) {
        return parMois;
    }

    etrangeres.forEach(id => {
        const mois = versements[id];

        if (!mois) {
            return;
        }

        Object.keys(mois).forEach(m => {
            parMois[m] = Math.round(((parMois[m] || 0) + (mois[m] || 0)) * 100) / 100;
        });
    });

    logger.debug(LOG_CATEGORIES.CALC_STATS, 'Foreign coupons isolated', {
        properties: etrangeres.size,
        months: Object.keys(parMois).length
    });

    return parMois;
}

/**
 * Chiffre l'impôt encore dû sur les recettes versées brutes
 *
 * @param {Object} mensuel - Revenus par mois, issus de l'état de compte
 * @param {Object} [etrangerParMois] - Coupons étrangers, par mois
 * @returns {Object|null} { parAnnee, total } ou null si rien n'échappe à la retenue
 */
export function impotDifferre(mensuel, etrangerParMois) {
    const parAnnee = {};
    let base = 0;
    let impot = 0;

    Object.keys(mensuel || {}).sort().forEach(m => {
        const entree = mensuel[m] || {};
        const assiette = (etrangerParMois?.[m] || 0)
            + (entree.parrainage || 0)
            + (entree.boost || 0);

        if (assiette <= 0) {
            return;
        }

        const du = assiette * tauxImpositionPour(m);
        const annee = m.slice(0, 4);
        const cumul = parAnnee[annee] ||= { etranger: 0, parrainage: 0, boost: 0, base: 0, impot: 0 };

        cumul.etranger += etrangerParMois?.[m] || 0;
        cumul.parrainage += entree.parrainage || 0;
        cumul.boost += entree.boost || 0;
        cumul.base += assiette;
        cumul.impot += du;

        base += assiette;
        impot += du;
    });

    if (base <= 0) {
        return null;
    }

    Object.values(parAnnee).forEach(cumul => {
        Object.keys(cumul).forEach(champ => {
            cumul[champ] = Math.round(cumul[champ] * 100) / 100;
        });
    });

    logger.info(LOG_CATEGORIES.CALC_STATS, 'Deferred tax computed', {
        years: Object.keys(parAnnee).length,
        base: Math.round(base * 100) / 100,
        tax: Math.round(impot * 100) / 100
    });

    return {
        parAnnee,
        total: {
            base: Math.round(base * 100) / 100,
            impot: Math.round(impot * 100) / 100
        }
    };
}

/**
 * Ce qu'il reste d'un coupon une fois la retenue à la source appliquée
 *
 * La ventilation par propriété de l'état de compte est BRUTE : c'est le coupon
 * annoncé, avant que Bricks ne prélève. Un projet français laisse donc moins
 * que ce montant sur le compte ; un projet étranger, lui, le laisse en entier —
 * l'impôt viendra plus tard, sur la déclaration, et le net du mois est bien
 * égal au brut.
 *
 * @param {number} brut - Coupon brut du mois
 * @param {string} mois - Mois au format YYYY-MM, pour le barème applicable
 * @param {string} [pays] - Pays de la propriété
 * @returns {number} Montant réellement encaissé
 */
export function netApresRetenue(brut, mois, pays) {
    const montant = Number.isFinite(brut) ? brut : 0;

    if (!pays || pays !== 'France') {
        return montant;
    }

    return Math.round(montant * (1 - tauxImpositionPour(mois)) * 100) / 100;
}
