/**
 * Analyse du risque d'un portefeuille Bricks
 *
 * Deux sources, par ordre d'autorité :
 *
 * 1. Le suivi de projet (projects.bricks.co) porte le statut officiel et le
 *    décompte des échéances impayées. C'est lui qui fait foi.
 * 2. À défaut, le texte des alertes du portefeuille est lu par mots-clés. Cette
 *    approximation ne sert que de repli : elle avait classé « Hôtel 4* Théoule
 *    sur mer » sans incident alors que le projet est en défaut depuis quatre
 *    échéances, sa dernière actualité ne parlant que de démarches préfectorales.
 *
 * Deux précautions guident la lecture du texte :
 *  - seul le warning le PLUS RÉCENT compte : c'est l'état courant du dossier ;
 *  - « régularisé » et « reversé » signalent une résolution, pas un incident.
 *    Les compter comme des défauts gonflerait artificiellement le risque.
 */

import { stripTags } from '../utils/html.js';
import { logger, LOG_CATEGORIES } from '../utils/logger.js';

/**
 * Niveaux de risque, du plus grave au plus bénin
 */
export const NIVEAUX_RISQUE = {
    PROCEDURE: 'procedure',
    IMPAYE: 'impaye',
    SIGNALE: 'signale',
    SAIN: 'sain'
};

/**
 * Libellés d'affichage des niveaux
 */
export const LIBELLES_RISQUE = {
    [NIVEAUX_RISQUE.PROCEDURE]: 'En défaut ou procédure',
    [NIVEAUX_RISQUE.IMPAYE]: 'En retard, défaut non déclaré',
    [NIVEAUX_RISQUE.SIGNALE]: 'Signalé',
    [NIVEAUX_RISQUE.SAIN]: 'Sans signalement'
};

/**
 * Statuts officiels renvoyés par le suivi de projet qui valent défaut
 */
const STATUTS_EN_DEFAUT = ['defaulted', 'litigation', 'contentieux'];

/**
 * Déduit le niveau de risque du suivi officiel d'un projet
 *
 * Ce suivi fait foi : il porte le statut déclaré par Bricks et le décompte des
 * échéances impayées. Il prime donc sur toute lecture du texte des alertes,
 * laquelle avait par exemple classé « Hôtel 4* Théoule sur mer » sans incident
 * alors que le projet est en défaut avec quatre échéances impayées, sa
 * dernière actualité ne parlant que de démarches préfectorales.
 *
 * @param {Object} statut - Entrée renvoyée par fetchProjectStatus
 * @returns {string|null} Niveau de NIVEAUX_RISQUE, ou null si non concluant
 */
export function niveauDepuisStatutOfficiel(statut) {
    if (!statut) {
        return null;
    }

    // Aucune page de suivi : Bricks n'a ouvert aucun incident sur ce projet
    if (statut.suivi === false) {
        return NIVEAUX_RISQUE.SAIN;
    }

    // Un contentieux ouvert est le stade le plus avancé : garanties activées,
    // dossier transmis. Il prime, même si les échéances viennent d'être soldées.
    if (statut.contentieux === true) {
        return NIVEAUX_RISQUE.PROCEDURE;
    }

    const enDefaut = STATUTS_EN_DEFAUT.includes(String(statut.statut || '').toLowerCase());
    const impayees = Number(statut.impayees) || 0;

    // « defaulted » est un marqueur qui reste attaché au projet même une fois les
    // échéances rattrapées : sans le décompte des impayées, on rangerait parmi
    // les défauts en cours des dossiers depuis régularisés.
    if (enDefaut && impayees > 0) {
        return NIVEAUX_RISQUE.PROCEDURE;
    }

    if (impayees > 0) {
        return NIVEAUX_RISQUE.IMPAYE;
    }

    // Un suivi existe mais plus rien n'est dû : incident passé, désormais réglé
    return NIVEAUX_RISQUE.SIGNALE;
}

/**
 * Indique si un suivi décrit un défaut désormais régularisé
 * Utile pour nuancer l'affichage : ces projets ont connu un incident, mais
 * n'ont plus d'échéance due aujourd'hui.
 * @param {Object} statut - Entrée renvoyée par fetchProjectStatus
 * @returns {boolean}
 */
export function estDefautRegularise(statut) {
    if (!statut || statut.suivi === false || statut.contentieux === true) {
        return false;
    }

    return STATUTS_EN_DEFAUT.includes(String(statut.statut || '').toLowerCase())
        && (Number(statut.impayees) || 0) === 0;
}

// Le dossier est passé au contentieux : le plus grave, quel que soit le reste
const TERMES_PROCEDURE = [
    'procédure judiciaire', 'procédure en cours', 'mise en demeure', 'huissier',
    'liquidation', 'redressement judiciaire', 'recouvrement', 'saisie',
    'contentieux', 'défaut de paiement', 'commandement de payer'
];

// « Constat d'huissier » désigne un rapport d'avancement de chantier, pas un
// recouvrement : le terme est retiré du texte avant analyse pour ne pas
// déclencher une procédure sur un simple point de suivi.
const FAUX_AMIS = ["constat d'huissier"];

// Un versement manque à l'appel
const TERMES_IMPAYE = [
    'impay', 'retard de paiement', 'retard de versement', 'non perçu',
    "n'ont pas encore été reçus", 'pas encore été versé', 'échéance non'
];

// Le versement a finalement eu lieu : ces termes annulent un simple retard
const TERMES_RESOLUTION = [
    'régularis', 'ont été reversé', 'a été reversé', 'ont été versé',
    'intégralement remboursé', 'soldé'
];

/**
 * Normalise le texte d'un warning pour la recherche de termes
 *
 * Les messages Bricks emploient l'apostrophe typographique (’). Sans cette
 * conversion, un terme écrit avec une apostrophe droite ne correspondrait
 * jamais — le filtre passerait à côté sans rien signaler.
 *
 * @param {string} description - Description HTML du warning
 * @returns {string} Texte en minuscules, sans balises ni faux amis
 */
function normaliser(description) {
    const texte = stripTags(description || '')
        .toLowerCase()
        .replace(/[’‘‛]/g, "'");

    return FAUX_AMIS.reduce((acc, expression) => acc.split(expression).join(' '), texte);
}

/**
 * Indique si un texte contient l'un des termes
 * @param {string} texte - Texte normalisé
 * @param {string[]} termes - Termes recherchés
 * @returns {boolean}
 */
function contient(texte, termes) {
    return termes.some(terme => texte.includes(terme));
}

/**
 * Classe un warning isolé
 * @param {Object} warning - Warning à classer
 * @returns {string} Niveau de NIVEAUX_RISQUE
 */
export function classerWarning(warning) {
    const texte = normaliser(warning?.description);

    if (!texte) {
        return NIVEAUX_RISQUE.SIGNALE;
    }

    // Une procédure prime : elle reste ouverte même si un versement a été régularisé
    if (contient(texte, TERMES_PROCEDURE)) {
        return NIVEAUX_RISQUE.PROCEDURE;
    }

    if (contient(texte, TERMES_IMPAYE)) {
        // Sauf si le même message annonce que la somme a finalement été versée
        return contient(texte, TERMES_RESOLUTION)
            ? NIVEAUX_RISQUE.SIGNALE
            : NIVEAUX_RISQUE.IMPAYE;
    }

    return NIVEAUX_RISQUE.SIGNALE;
}

/**
 * Détermine le niveau de risque d'une propriété
 *
 * Le suivi officiel prime quand il est connu. À défaut — statut pas encore
 * récupéré, appel en échec — on retombe sur la lecture du dernier warning,
 * qui reste une approximation.
 *
 * @param {Object} property - Propriété avec sa liste de warnings
 * @param {Object} [statutOfficiel] - Entrée du suivi de projet, si disponible
 * @returns {string} Niveau de NIVEAUX_RISQUE
 */
export function niveauRisque(property, statutOfficiel = null) {
    const officiel = niveauDepuisStatutOfficiel(statutOfficiel);

    if (officiel) {
        return officiel;
    }

    const warnings = property?.warnings;

    if (!Array.isArray(warnings) || warnings.length === 0) {
        return NIVEAUX_RISQUE.SAIN;
    }

    const plusRecent = [...warnings].sort((a, b) => {
        const da = new Date(a.date).getTime() || 0;
        const db = new Date(b.date).getTime() || 0;
        return db - da;
    })[0];

    return classerWarning(plusRecent);
}

/**
 * Répartit le portefeuille par niveau de risque
 *
 * Les pourcentages sont calculés sur les propriétés ENCORE DÉTENUES, remboursées
 * exclues : un projet soldé ne porte plus aucun risque et diluerait la mesure.
 *
 * @param {Array} properties - Liste des propriétés
 * @param {Object} [statuts] - Suivis officiels indexés par identifiant de projet
 * @returns {Object} Compteurs, parts et capital exposé par niveau
 */
export function repartitionRisque(properties, statuts = {}) {
    const encoursDetenus = (properties || []).filter(p => !p.isRefunded);
    const base = encoursDetenus.length;
    const capitalBase = encoursDetenus.reduce((somme, p) => somme + (p.investment || 0), 0);

    const vide = () => ({ nombre: 0, capital: 0, part: 0, partCapital: 0, ids: [] });
    const repartition = {
        [NIVEAUX_RISQUE.PROCEDURE]: vide(),
        [NIVEAUX_RISQUE.IMPAYE]: vide(),
        [NIVEAUX_RISQUE.SIGNALE]: vide(),
        [NIVEAUX_RISQUE.SAIN]: vide()
    };

    let defautsRegularises = 0;

    encoursDetenus.forEach(p => {
        const statut = statuts?.[p.id];
        const niveau = p.niveauRisque || niveauRisque(p, statut);

        if (estDefautRegularise(statut)) {
            defautsRegularises += 1;
        }

        repartition[niveau].nombre += 1;
        repartition[niveau].capital += p.investment || 0;
        repartition[niveau].ids.push(p.id);
    });

    Object.values(repartition).forEach(entree => {
        entree.part = base > 0 ? (entree.nombre / base) * 100 : 0;
        entree.partCapital = capitalBase > 0 ? (entree.capital / capitalBase) * 100 : 0;
    });

    // Ce qui va vraiment mal : procédure + impayé
    const enDifficulte = {
        nombre: repartition[NIVEAUX_RISQUE.PROCEDURE].nombre + repartition[NIVEAUX_RISQUE.IMPAYE].nombre,
        capital: repartition[NIVEAUX_RISQUE.PROCEDURE].capital + repartition[NIVEAUX_RISQUE.IMPAYE].capital
    };
    enDifficulte.part = base > 0 ? (enDifficulte.nombre / base) * 100 : 0;
    enDifficulte.partCapital = capitalBase > 0 ? (enDifficulte.capital / capitalBase) * 100 : 0;

    logger.debug(LOG_CATEGORIES.CALC_STATS, 'Risk breakdown computed', {
        base,
        statutsOfficiels: Object.keys(statuts || {}).length,
        procedure: repartition[NIVEAUX_RISQUE.PROCEDURE].nombre,
        impaye: repartition[NIVEAUX_RISQUE.IMPAYE].nombre
    });

    return {
        base,
        capitalBase,
        repartition,
        enDifficulte,
        defautsRegularises,
        statutsConnus: Object.keys(statuts || {}).length
    };
}

/**
 * Le coupon mensuel qu'une propriété verse quand tout va bien
 *
 * Il se déduit du projet lui-même, au taux annoncé. Le montant porté par
 * l'échéance officielle ne conviendrait pas : c'est la dette de l'emprunteur,
 * échéancier et commission de plateforme compris, sans rapport fixe avec le
 * coupon reversé. Vérifié sur deux projets réels : Villa Cap d'Antibes annonce
 * 11 % mais son échéance revient à 9,1 % du capital, quand Mas de Souvignargues
 * en fait 12,45 % pour le même taux affiché.
 *
 * @param {Object} property - Propriété détenue
 * @returns {number} Coupon mensuel brut, en euros
 */
export function couponMensuel(property) {
    return (property?.investment || 0) * (property?.yearlyReturn || 0) / 100 / 12;
}

/**
 * La fraction du projet que vos briques représentent
 *
 * Seule clé de répartition d'une émission obligataire : chaque brique porte la
 * même part du droit. Sur un Château de Chicamour à 175 000 briques et 4 471
 * investisseurs, s'en passer reviendrait à s'attribuer la dette de tout le monde
 * — d'où le `null` plutôt qu'un prorata inventé quand le total des briques du
 * projet manque, ce qu'un statut récupéré par une version antérieure ne porte pas.
 *
 * @param {Object} property - Propriété détenue
 * @param {Object} [suivi] - Suivi officiel du projet
 * @returns {number|null} Part détenue entre 0 et 1, ou null si incalculable
 */
export function partDuProjet(property, suivi) {
    const briquesProjet = suivi?.briquesProjet || 0;
    const detenues = property?.ownedBricks || 0;

    return briquesProjet > 0 && detenues > 0 ? detenues / briquesProjet : null;
}

/**
 * Chiffre ce qu'un projet en défaut ne vous a pas versé
 *
 * Deux montants, et deux sources qu'il ne faut pas confondre.
 *
 * Les **coupons manqués** se déduisent du projet lui-même : autant d'échéances
 * impayées que de coupons non tombés, au taux annoncé — voir `couponMensuel`.
 * La part de Villa Cap d'Antibes donnait 1,90 € quand le coupon mensuel valait
 * 2,29 €, celle de Mas de Souvignargues l'inverse.
 *
 * Les **pénalités**, elles, sont explicitement celles des investisseurs :
 * `investors_penalties_summary`. Elles se répartissent au prorata des briques,
 * que donne `partDuProjet`.
 *
 * @param {Object} property - Propriété détenue
 * @param {Object} [suivi] - Suivi officiel du projet
 * @returns {Object|null} { montant, echeances, penalites, part } ou null
 */
export function arrieresInvestisseur(property, suivi) {
    if (!suivi?.suivi) {
        return null;
    }

    const impayees = suivi.impayees || 0;
    const montant = impayees * couponMensuel(property);

    const part = partDuProjet(property, suivi);
    const penalites = part === null ? 0 : (suivi.penalites || 0) * part;

    if (montant <= 0 && penalites <= 0) {
        return null;
    }

    return {
        montant: Math.round(montant * 100) / 100,
        echeances: impayees,
        penalites: Math.round(penalites * 100) / 100,
        penalitesConnues: part !== null,
        part
    };
}
