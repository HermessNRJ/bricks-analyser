/**
 * Analyse du risque à partir des warnings Bricks
 *
 * L'API ne publie aucun statut de défaut : les warnings ne portent qu'un texte
 * libre et une date. Le niveau de risque est donc DÉDUIT du vocabulaire employé,
 * selon des règles explicites — et non relevé d'un champ officiel.
 *
 * Deux précautions guident le classement :
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
    [NIVEAUX_RISQUE.PROCEDURE]: 'En procédure',
    [NIVEAUX_RISQUE.IMPAYE]: 'Impayé ou retard',
    [NIVEAUX_RISQUE.SIGNALE]: 'Signalé',
    [NIVEAUX_RISQUE.SAIN]: 'Sans signalement'
};

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
 * Seul le warning le plus récent est retenu : les précédents décrivent un état
 * dépassé du dossier.
 * @param {Object} property - Propriété avec sa liste de warnings
 * @returns {string} Niveau de NIVEAUX_RISQUE
 */
export function niveauRisque(property) {
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
 * @returns {Object} Compteurs, parts et capital exposé par niveau
 */
export function repartitionRisque(properties) {
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

    encoursDetenus.forEach(p => {
        const niveau = niveauRisque(p);
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
        procedure: repartition[NIVEAUX_RISQUE.PROCEDURE].nombre,
        impaye: repartition[NIVEAUX_RISQUE.IMPAYE].nombre
    });

    return { base, capitalBase, repartition, enDifficulte };
}
