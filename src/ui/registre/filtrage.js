/**
 * Choisir et ordonner les propriétés du registre
 *
 * Ces trois fonctions ne connaissent ni le DOM ni l'état du registre : on leur
 * donne une liste et des critères, elles rendent une liste. C'est ce qui les
 * rend vérifiables une par une, ce qu'elles n'étaient pas quand elles lisaient
 * directement les huit variables de module de registre.js — la moitié par
 * paramètre, l'autre moitié en douce.
 */

import { NIVEAUX_RISQUE } from '../../business/riskAnalysis.js';
import { cleLieu } from '../../business/geographie.js';
import { hasWarningInCurrentMonth, hasWarningInLastMonth, hasWarningInMonthBefore } from '../alertes.js';

/**
 * Vérifie qu'une propriété correspond à la recherche libre
 * @param {Object} property - Propriété
 * @param {string} terme - Terme recherché (déjà normalisé)
 * @returns {boolean}
 */
export function matchesSearch(property, terme) {
    if (!terme) {
        return true;
    }

    const cible = `${property.name || ''} ${property.address || ''}`.toLowerCase();
    return cible.includes(terme);
}

/**
 * Filtre les propriétés selon les critères en vigueur
 *
 * Les critères arrivent en un seul objet plutôt qu'en huit, dont cinq étaient
 * auparavant lus directement dans l'état de registre.js. Une clé absente vaut
 * « pas de filtre » : appeler sans critères rend la liste entière.
 *
 * @param {Array} properties - Propriétés à filtrer
 * @param {Object} [criteres] - Ce que la barre de filtres demande
 * @param {string} [criteres.statut] - Actives, remboursées, en financement…
 * @param {string} [criteres.alerte] - Filtre d'alerte ou de niveau de risque
 * @param {string} [criteres.versement] - État du versement du mois de référence
 * @param {string} [criteres.pays] - Code pays
 * @param {string} [criteres.region] - Région déduite du code postal
 * @param {string} [criteres.departement] - Département déduit du code postal
 * @param {string} [criteres.lieu] - Clé de localisation, posée par la carte
 * @param {string} [criteres.recherche] - Recherche libre sur nom et adresse
 * @returns {Array} Propriétés filtrées
 */
export function filterProperties(properties, {
    statut = 'all',
    alerte = 'all',
    versement = 'all',
    pays = 'all',
    region = 'all',
    departement = 'all',
    lieu = 'all',
    recherche = ''
} = {}) {
    let filtered = properties;

    // Filtre par statut
    switch (statut) {
        case 'active':
            filtered = filtered.filter(p => !p.isRefunded && p.projectStatus === 'financed');
            break;
        case 'refunded':
            filtered = filtered.filter(p => p.isRefunded);
            break;
        case 'ongoing':
            filtered = filtered.filter(p => p.projectStatus === 'ongoing');
            break;
        case 'upcoming':
            filtered = filtered.filter(p => p.projectStatus === 'upcoming');
            break;
    }

    // Filtre par warning
    switch (alerte) {
        case 'warning-current-month':
            filtered = filtered.filter(p => hasWarningInCurrentMonth(p));
            break;
        case 'has-warning':
            filtered = filtered.filter(p => p.warningsCount > 0);
            break;
        case 'no-warning':
            filtered = filtered.filter(p => p.warningsCount === 0);
            break;
        case 'warning-last-month':
            filtered = filtered.filter(p => hasWarningInLastMonth(p));
            break;
        case 'warning-month-before':
            filtered = filtered.filter(p => hasWarningInMonthBefore(p));
            break;
        // Les remboursées sont écartées comme dans les tuiles d'incident : un
        // projet soldé ne porte plus de risque, et le raccourci « Voir » doit
        // montrer exactement les fiches derrière le chiffre annoncé.
        case 'risk-procedure':
            filtered = filtered.filter(p => !p.isRefunded && p.niveauRisque === NIVEAUX_RISQUE.PROCEDURE);
            break;
        case 'risk-impaye':
            filtered = filtered.filter(p => !p.isRefunded && p.niveauRisque === NIVEAUX_RISQUE.IMPAYE);
            break;
        case 'risk-signale':
            filtered = filtered.filter(p => !p.isRefunded && p.niveauRisque === NIVEAUX_RISQUE.SIGNALE);
            break;
        case 'risk-sain':
            filtered = filtered.filter(p => !p.isRefunded && p.niveauRisque === NIVEAUX_RISQUE.SAIN);
            break;
    }

    // Filtre par état de versement du mois de référence
    if (versement !== 'all') {
        filtered = filtered.filter(p => p.versement?.etat === versement);
    }

    // Filtre par pays
    if (pays !== 'all') {
        filtered = filtered.filter(p => p.country === pays);
    }

    // Filtres géographiques, déduits du code postal de l'adresse
    if (region !== 'all') {
        filtered = filtered.filter(p => p.geo?.region === region);
    }

    if (departement !== 'all') {
        filtered = filtered.filter(p => p.geo?.departement === departement);
    }

    // Posé par un clic sur une ligne du tableau des localisations, jamais par
    // un menu : la clé sert des deux côtés, si bien que la ligne et le registre
    // comptent forcément les mêmes biens.
    if (lieu !== 'all') {
        filtered = filtered.filter(p => cleLieu(p.geo) === lieu);
    }

    // Recherche libre
    const terme = (recherche || '').toLowerCase();
    if (terme) {
        filtered = filtered.filter(p => matchesSearch(p, terme));
    }

    return filtered;
}

/**
 * Trie les propriétés selon le critère
 * @param {Array} properties - Propriétés à trier
 * @param {string} sortBy - Critère de tri
 * @returns {Array} Propriétés triées
 */
export function sortProperties(properties, sortBy) {
    const sorted = [...properties];

    switch (sortBy) {
        case 'investment-desc':
            return sorted.sort((a, b) => b.investment - a.investment);
        case 'investment-asc':
            return sorted.sort((a, b) => a.investment - b.investment);

        case 'bricks-desc':
            return sorted.sort((a, b) => b.ownedBricks - a.ownedBricks);
        case 'bricks-asc':
            return sorted.sort((a, b) => a.ownedBricks - b.ownedBricks);

        case 'return-desc':
            return sorted.sort((a, b) => b.yearlyReturn - a.yearlyReturn);
        case 'return-asc':
            return sorted.sort((a, b) => a.yearlyReturn - b.yearlyReturn);

        case 'revenue-desc':
            return sorted.sort((a, b) => b.monthlyRevenue - a.monthlyRevenue);
        case 'revenue-asc':
            return sorted.sort((a, b) => a.monthlyRevenue - b.monthlyRevenue);

        case 'name-asc':
            return sorted.sort((a, b) => a.name.localeCompare(b.name));
        case 'name-desc':
            return sorted.sort((a, b) => b.name.localeCompare(a.name));

        case 'revenuestart-desc':
            return sorted.sort((a, b) => {
                if (!a.revenueStartDate) return 1;
                if (!b.revenueStartDate) return -1;
                return b.revenueStartDate.localeCompare(a.revenueStartDate);
            });
        case 'revenuestart-asc':
            return sorted.sort((a, b) => {
                if (!a.revenueStartDate) return 1;
                if (!b.revenueStartDate) return -1;
                return a.revenueStartDate.localeCompare(b.revenueStartDate);
            });

        default:
            return sorted;
    }
}
