/**
 * Ce que le portefeuille vous doit encore, mois par mois
 *
 * Les tuiles de risque disent combien de projets vont mal, les fiches disent ce
 * que chacun vous doit aujourd'hui. Ni les unes ni les autres ne disent depuis
 * QUAND, ni si le trou se creuse ou se rebouche — et c'est pourtant la seule
 * question qui compte quand on regarde un défaut : est-ce que ça s'aggrave.
 *
 * ## Deux dettes, et non une
 *
 * Un projet en retard doit deux choses distinctes, que Bricks suit séparément :
 *
 *  - les **coupons** que les échéances impayées n'ont pas versés ;
 *  - les **pénalités** de retard, dues aux obligataires en plus du coupon.
 *
 * Les additionner en une seule courbe effacerait ce qui les sépare : les
 * premiers sont de l'argent qu'on attendait, les secondes un dédommagement qui
 * n'existerait pas si tout allait bien. Elles ne se recouvrent pas non plus dans
 * le temps — une pénalité continue de courir après que l'échéance a été
 * rattrapée, et se règle par un circuit à part.
 *
 * ## Ce qui sort du décompte, et quand
 *
 * Une ligne quitte la courbe le jour où l'argent est arrivé, pas le jour où
 * l'emprunteur a payé. La nuance décide de trois statuts :
 *
 *  - une échéance `regularized` a été rattrapée : son **coupon** disparaît, mais
 *    sa **pénalité** reste due tant qu'elle n'a pas été redistribuée — Bricks la
 *    range en `recovered_awaiting_distribution`, recouvrée mais pas reversée ;
 *  - une échéance `pending_penalties` a fini par être versée et ne doit plus
 *    que sa pénalité ;
 *  - une échéance `paid` ne doit plus rien, et sort entièrement de la courbe.
 *
 * Comme la série se reconstruit à chaque lecture des statuts, une régularisation
 * ne se retranche pas : la ligne cesse simplement d'avoir jamais existé. Le
 * cumul du mois où elle tombait redescend, et toute la courbe avec lui.
 *
 * ## Pourquoi un cumul, ici, alors que les apports se lisent en barres
 *
 * L'argent des apports entre puis reste : le rythme mensuel est l'information.
 * Un impayé, lui, s'ajoute au précédent sans que rien ne s'apure — une barre par
 * mois montrerait quatre coupons de taille égale et raterait l'essentiel, qui
 * est le trou qu'ils creusent ensemble. La courbe monte en escalier tant que
 * rien n'est versé, reste plate quand les échéances retombent, et redescend le
 * jour d'une régularisation.
 */

import { couponMensuel, partDuProjet } from './riskAnalysis.js';
import { netApresRetenue } from './fiscalite.js';
import { generateMonthRange, getCurrentMonthYYYYMM } from '../utils/dateHelpers.js';
import { logger, LOG_CATEGORIES } from '../utils/logger.js';

/** Le coupon n'est dû que tant que l'échéance elle-même n'est pas tombée */
const COUPON_DU = 'unpaid';

/** La pénalité survit à la régularisation : voir l'en-tête */
const PENALITE_DUE = ['unpaid', 'pending_penalties', 'regularized'];

/**
 * Reconstitue la dette du portefeuille envers vous, mois par mois
 *
 * @param {Array} properties - Propriétés, annotées de leur `suivi` officiel
 * @param {string} [moisCourant] - Dernier mois tracé, au format YYYY-MM
 * @returns {Object|null} { detaille, projets, mois, coupons, penalites, nets,
 *   total }, ou null si aucun suivi n'a encore été récupéré — il n'y a alors
 *   rien à dire, pas même « rien à signaler »
 */
export function serieArrieres(properties, moisCourant = getCurrentMonthYYYYMM()) {
    const suivis = (properties || []).filter(p => p?.suivi?.suivi);

    if (suivis.length === 0) {
        return null;
    }

    // Ce qui s'ajoute chaque mois, avant cumul
    const coupons = {};
    const penalites = {};
    const nets = {};
    const projets = new Set();

    // Les statuts mis en cache par une version antérieure ne portent pas le
    // détail des échéances. Le distinguer d'un portefeuille sain est nécessaire :
    // dans un cas il n'y a rien à tracer, dans l'autre il n'y a rien à tracer
    // ENCORE, et seul le second mérite qu'on invite à relancer la vérification.
    let detaille = false;

    suivis.forEach(property => {
        const echeances = property.suivi.echeances;

        if (!Array.isArray(echeances)) {
            return;
        }

        detaille = true;

        const coupon = couponMensuel(property);
        const part = partDuProjet(property, property.suivi);

        echeances.forEach(echeance => {
            const mois = String(echeance?.mois || '');

            if (!/^\d{4}-\d{2}$/.test(mois)) {
                return;
            }

            const dus = [];

            if (echeance.statut === COUPON_DU && coupon > 0) {
                dus.push([coupons, coupon]);
            }

            const penalite = part === null ? 0 : (echeance.penalitesProjet || 0) * part;

            if (PENALITE_DUE.includes(echeance.statut) && penalite > 0) {
                dus.push([penalites, penalite]);
            }

            dus.forEach(([serie, montant]) => {
                serie[mois] = (serie[mois] || 0) + montant;
                // Le prélèvement ne mordra que sur les projets français : le
                // net d'un projet portugais est égal à son brut, l'impôt
                // n'arrivant que plus tard, sur la déclaration.
                nets[mois] = (nets[mois] || 0) + netApresRetenue(montant, mois, property.country);
                projets.add(property.id);
            });
        });
    });

    const echus = [...new Set([...Object.keys(coupons), ...Object.keys(penalites)])].sort();

    if (echus.length === 0) {
        return { detaille, projets: 0, mois: [], coupons: {}, penalites: {}, nets: {}, total: 0 };
    }

    // La courbe court jusqu'au mois courant, et non jusqu'au dernier impayé :
    // un trou creusé il y a six mois est toujours ouvert aujourd'hui, et une
    // ligne qui s'arrêterait à la dernière échéance laisserait croire l'inverse.
    const dernier = echus[echus.length - 1];
    const mois = generateMonthRange(echus[0], dernier > moisCourant ? dernier : moisCourant);

    const cumule = serie => {
        const resultat = {};
        let total = 0;

        mois.forEach(m => {
            total += serie[m] || 0;
            resultat[m] = Math.round(total * 100) / 100;
        });

        return resultat;
    };

    const cumulCoupons = cumule(coupons);
    const cumulPenalites = cumule(penalites);
    const cumulNets = cumule(nets);

    const total = totalAffiche({ coupons: cumulCoupons, penalites: cumulPenalites }, mois);

    logger.debug(LOG_CATEGORIES.CALC_STATS, 'Arrears series computed', {
        months: mois.length,
        projects: projets.size,
        total
    });

    return {
        detaille,
        projets: projets.size,
        mois,
        coupons: cumulCoupons,
        penalites: cumulPenalites,
        // Le net est une SÉRIE et non un total : restreindre la fenêtre à six
        // mois tronque les courbes, et un net calculé une fois pour tout
        // l'historique se serait retrouvé plus élevé que le brut affiché.
        nets: cumulNets,
        total
    };
}

/**
 * Additionne les deux dettes au dernier mois affiché
 *
 * Le repère du total se calcule sur les mois DESSINÉS, et non une fois pour
 * l'historique entier : restreindre la fenêtre à six mois laisserait sinon un
 * trait annonçant un total que les courbes visibles n'atteignent jamais. La
 * leçon est celle du repère de versement moyen, qui restait figé à 252 €
 * qu'on regarde trois mois ou trois ans.
 *
 * @param {Object|null} serie - Séries cumulées { coupons, penalites }
 * @param {Array<string>} moisAffiches - Mois effectivement tracés
 * @returns {number} Dette totale au dernier mois affiché
 */
export function totalAffiche(serie, moisAffiches) {
    if (!serie || !Array.isArray(moisAffiches) || moisAffiches.length === 0) {
        return 0;
    }

    const dernier = moisAffiches[moisAffiches.length - 1];
    const somme = (serie.coupons?.[dernier] || 0) + (serie.penalites?.[dernier] || 0);

    return Math.round(somme * 100) / 100;
}
