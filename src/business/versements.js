/**
 * État de versement d'une propriété, mois par mois
 *
 * L'état de compte de Bricks ventile chaque mois par projet. C'est la seule
 * source qui dise, propriété par propriété, ce qui est réellement tombé : le
 * reste du tableau de bord raisonne en coupon attendu, lequel ne manque jamais
 * un mois. Confronter les deux fait apparaître les projets muets.
 *
 * Un mois sans versement n'est pas toujours un incident. Bricks paie autour du
 * 8 : un relevé pris le 8 au matin montre un mois en cours de règlement, et un
 * projet tout juste acheté n'a rien à verser. D'où trois états distincts plutôt
 * qu'un simple « payé / pas payé ».
 */

import { addMonthsToYYYYMM, isValidYYYYMM } from '../utils/dateHelpers.js';
import { logger, LOG_CATEGORIES } from '../utils/logger.js';

/**
 * États possibles d'une propriété pour un mois donné
 */
export const ETATS = {
    VERSE: 'verse',        // Un montant est tombé ce mois-là
    MANQUANT: 'manquant',  // Rien n'est tombé, alors que la propriété devait verser
    ATTENDU: 'attendu',    // Rien n'est tombé, et rien n'était encore dû
    SOLDE: 'solde',        // Projet remboursé : il ne verse plus, c'est normal
    INCONNU: 'inconnu'     // Pas d'état de compte : on ne sait rien
};

/**
 * Nombre de mois repris dans le carnet de versements d'une fiche
 * Douze mois révolus plus le mois de référence : assez pour lire un rythme
 * sans que les marques deviennent illisibles.
 */
export const MOIS_CARNET = 13;

/**
 * Dernier mois où une propriété, quelle qu'elle soit, a versé quelque chose
 *
 * C'est ce mois-là qui sert de référence, et non le mois civil courant : un
 * cache vieux de trois semaines doit se juger sur le dernier mois qu'il
 * connaît, sinon tout le portefeuille passerait en défaut d'un coup.
 *
 * @param {Object} versements - Ventilation { propriété: { mois: euros } }
 * @returns {string|null} Mois au format YYYY-MM, null si rien n'a jamais été versé
 */
export function moisReferenceVersements(versements) {
    if (!versements || typeof versements !== 'object') {
        return null;
    }

    let dernier = null;

    Object.values(versements).forEach(parMois => {
        Object.keys(parMois).forEach(mois => {
            if (dernier === null || mois > dernier) {
                dernier = mois;
            }
        });
    });

    return dernier;
}

/**
 * Établit l'état d'une propriété pour le mois de référence
 *
 * @param {Object} property - Propriété du registre
 * @param {Object} versements - Ventilation { propriété: { mois: euros } }
 * @param {string} moisReference - Mois jugé, au format YYYY-MM
 * @returns {Object} { etat, montant, dernierMois, debut }
 */
export function etatVersement(property, versements, moisReference) {
    if (!property || !versements || !isValidYYYYMM(moisReference)) {
        return { etat: ETATS.INCONNU };
    }

    const parMois = versements[property.id] || null;
    const montant = parMois?.[moisReference] ?? 0;

    if (montant > 0) {
        return { etat: ETATS.VERSE, montant };
    }

    // Un projet remboursé a fini de verser : le signaler en rouge tous les mois
    // suivants noierait les vrais impayés.
    if (property.isRefunded) {
        return { etat: ETATS.SOLDE };
    }

    // Les briques sont payées mais le projet n'est pas bouclé : rien n'est dû
    if (property.projectStatus === 'ongoing' || property.projectStatus === 'upcoming') {
        return { etat: ETATS.ATTENDU, motif: 'financement' };
    }

    const premier = premierVersement(parMois);
    const annonce = isValidYYYYMM(property.revenueStartDate) ? property.revenueStartDate : null;
    const debut = plusAncien(premier, annonce);

    // Rien n'a encore été versé et la date annoncée n'est pas atteinte
    if (debut && debut > moisReference) {
        return { etat: ETATS.ATTENDU, motif: 'debut', debut };
    }

    // Ni versement passé, ni date annoncée : rien ne prouve qu'un coupon était
    // dû. Un rouge posé là serait une accusation sans pièce au dossier, et une
    // liste d'impayés qu'on ne peut pas vérifier ne sert à personne.
    if (!debut) {
        return { etat: ETATS.ATTENDU, motif: 'inconnu' };
    }

    return {
        etat: ETATS.MANQUANT,
        dernierMois: dernierVersement(parMois, moisReference),
        debut
    };
}

/**
 * Dresse le carnet des derniers mois d'une propriété
 *
 * Une marque par mois : c'est ce qui rend un rouge interprétable. Douze mois
 * pleins suivis d'un blanc se lisent autrement qu'un silence d'un an.
 *
 * @param {Object} property - Propriété du registre
 * @param {Object} versements - Ventilation { propriété: { mois: euros } }
 * @param {string} moisReference - Dernier mois du carnet
 * @param {number} [nbMois] - Nombre de mois repris
 * @returns {Array<Object>} [{ mois, etat, montant }] du plus ancien au plus récent
 */
export function carnetVersements(property, versements, moisReference, nbMois = MOIS_CARNET) {
    if (!property || !versements || !isValidYYYYMM(moisReference)) {
        return [];
    }

    const parMois = versements[property.id] || null;
    const annonce = isValidYYYYMM(property.revenueStartDate) ? property.revenueStartDate : null;

    // Un projet encore en financement porte une date de versement annoncée alors
    // qu'il n'a rien à verser : la retenir noircirait tout le carnet d'une
    // propriété que la pastille dit pourtant « pas encore dû ».
    const enFinancement = property.projectStatus === 'ongoing' || property.projectStatus === 'upcoming';
    const debut = enFinancement ? null : plusAncien(premierVersement(parMois), annonce);

    // Un projet remboursé cesse de verser sans que ce soit un manquement : la
    // fenêtre où l'on attend quelque chose se referme sur son dernier versement.
    const fin = property.isRefunded
        ? (dernierVersement(parMois, moisReference) || debut)
        : moisReference;

    const carnet = [];

    for (let recul = nbMois - 1; recul >= 0; recul--) {
        const mois = addMonthsToYYYYMM(moisReference, -recul);
        const montant = parMois?.[mois] ?? 0;

        if (montant > 0) {
            carnet.push({ mois, etat: ETATS.VERSE, montant });
        } else if (!debut || mois < debut || (fin && mois > fin)) {
            // Hors de la fenêtre où la propriété devait verser : la case ne dit rien
            carnet.push({ mois, etat: ETATS.ATTENDU, montant: 0 });
        } else {
            carnet.push({ mois, etat: ETATS.MANQUANT, montant: 0 });
        }
    }

    return carnet;
}

/**
 * Compte les propriétés par état de versement
 * @param {Array} properties - Propriétés portant déjà leur champ `versement`
 * @returns {Object} { verse, manquant, attendu, solde }
 */
export function compterVersements(properties) {
    const comptes = { verse: 0, manquant: 0, attendu: 0, solde: 0 };

    if (!Array.isArray(properties)) {
        return comptes;
    }

    properties.forEach(p => {
        const etat = p?.versement?.etat;
        if (etat && etat in comptes) {
            comptes[etat]++;
        }
    });

    return comptes;
}

/**
 * Rattache son état de versement à chaque propriété
 * @param {Array} properties - Propriétés du registre, modifiées sur place
 * @param {Object} [versements] - Ventilation par propriété, absente sans relevé
 * @returns {Object|null} { moisReference, comptes, parPropriete } ou null sans relevé
 */
export function annoterVersements(properties, versements) {
    const moisReference = moisReferenceVersements(versements);

    if (!Array.isArray(properties) || !moisReference) {
        return null;
    }

    properties.forEach(p => {
        p.versement = etatVersement(p, versements, moisReference);
    });

    const comptes = compterVersements(properties);

    logger.info(LOG_CATEGORIES.CALC_STATS, 'Payment states resolved', {
        month: moisReference,
        ...comptes
    });

    return { moisReference, comptes, parPropriete: versements };
}

/**
 * Premier mois où la propriété a versé quelque chose
 * @param {Object|null} parMois - Versements de la propriété
 * @returns {string|null} Mois au format YYYY-MM
 */
function premierVersement(parMois) {
    if (!parMois) {
        return null;
    }

    return Object.keys(parMois).sort()[0] || null;
}

/**
 * Dernier mois, au plus tard au mois de référence, où la propriété a versé
 * @param {Object|null} parMois - Versements de la propriété
 * @param {string} moisReference - Mois jugé
 * @returns {string|null} Mois au format YYYY-MM, null si elle n'a jamais versé
 */
function dernierVersement(parMois, moisReference) {
    if (!parMois) {
        return null;
    }

    const passes = Object.keys(parMois).filter(mois => mois <= moisReference).sort();
    return passes[passes.length - 1] || null;
}

/**
 * Retient le plus ancien de deux mois, en tolérant les valeurs absentes
 * @param {string|null} a - Premier mois
 * @param {string|null} b - Second mois
 * @returns {string|null} Le plus ancien des deux, null si aucun n'est connu
 */
function plusAncien(a, b) {
    if (!a) return b || null;
    if (!b) return a;
    return a < b ? a : b;
}
