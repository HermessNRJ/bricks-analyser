/**
 * Mise à jour de l'interface utilisateur
 */

import { formatCurrency, formatNumber, truncate } from '../utils/formatters.js';
import { getCurrentMonthYYYYMM, addMonthsToYYYYMM } from '../utils/dateHelpers.js';
import { logger, LOG_CATEGORIES } from '../utils/logger.js';

// Stocker les propriétés pour le tri/filtrage
let allProperties = [];
let currentSortBy = 'investment-desc';
let currentFilter = 'all';

/**
 * Met à jour toute l'interface avec les résultats calculés
 * @param {Object} results - Résultats des calculs
 */
export function updateUI(results) {
    logger.info(LOG_CATEGORIES.UI, 'Updating UI with results');

    updateStatCards(results);

    // Stocker les propriétés globalement pour le tri/filtrage
    allProperties = results.properties;

    // Charger les préférences de tri/filtrage
    currentSortBy = localStorage.getItem('propertySortBy') || 'investment-desc';
    currentFilter = localStorage.getItem('propertyFilter') || 'all';

    updatePropertyList(allProperties);
    updateProjections(results.netRevenueEvolutionData);

    logger.info(LOG_CATEGORIES.UI, 'UI updated successfully');
}

/**
 * Met à jour les cartes de statistiques
 * @param {Object} results - Résultats des calculs
 */
function updateStatCards(results) {
    document.getElementById('totalBricks').textContent = formatNumber(results.totalBricks);
    document.getElementById('totalInvestment').textContent = formatCurrency(results.totalInvestment, 0);
    document.getElementById('monthlyRevenue').textContent = formatCurrency(results.monthlyRevenue);
    document.getElementById('totalProperties').textContent = formatNumber(results.activePropertiesCount || 0);
    document.getElementById('totalNetRevenueSinceBeginning').textContent = formatCurrency(results.totalNetRevenueSinceBeginning);
    document.getElementById('totalTaxesSinceBeginning').textContent = formatCurrency(results.totalTaxesSinceBeginning);
    document.getElementById('refundedProjectsCountValue').textContent = formatNumber(results.refundedProjectsCount || 0);
    document.getElementById('fundingProjectsCountValue').textContent = formatNumber(results.fundingOrUpcomingProjectsCount || 0);

    logger.debug(LOG_CATEGORIES.UI, 'Stat cards updated');
}

/**
 * Met à jour la liste des propriétés avec tri et filtrage
 * @param {Array} properties - Liste des propriétés
 */
function updatePropertyList(properties) {
    const container = document.getElementById('propertiesList');
    const countElement = document.getElementById('propertyCount');

    if (!container) {
        logger.warn(LOG_CATEGORIES.UI, 'Properties list container not found');
        return;
    }

    // Appliquer le filtre
    let filteredProperties = filterProperties(properties, currentFilter);

    // Appliquer le tri
    let sortedProperties = sortProperties(filteredProperties, currentSortBy);

    // Mettre à jour le compteur
    if (countElement) {
        countElement.textContent = sortedProperties.length;
    }

    // Générer le HTML
    container.innerHTML = sortedProperties.map(property => createPropertyCard(property)).join('');

    logger.debug(LOG_CATEGORIES.UI, 'Property list updated', {
        total: properties.length,
        filtered: filteredProperties.length,
        displayed: sortedProperties.length,
        sortBy: currentSortBy,
        filter: currentFilter
    });
}

/**
 * Filtre les propriétés selon le critère
 * @param {Array} properties - Propriétés à filtrer
 * @param {string} filterType - Type de filtre
 * @returns {Array} Propriétés filtrées
 */
function filterProperties(properties, filterType) {
    switch (filterType) {
        case 'active':
            return properties.filter(p => !p.isRefunded && p.projectStatus === 'financed');
        case 'refunded':
            return properties.filter(p => p.isRefunded);
        case 'ongoing':
            return properties.filter(p => p.projectStatus === 'ongoing');
        case 'upcoming':
            return properties.filter(p => p.projectStatus === 'upcoming');
        case 'all':
        default:
            return properties;
    }
}

/**
 * Trie les propriétés selon le critère
 * @param {Array} properties - Propriétés à trier
 * @param {string} sortBy - Critère de tri
 * @returns {Array} Propriétés triées
 */
function sortProperties(properties, sortBy) {
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

        default:
            return sorted;
    }
}

/**
 * Exporte les fonctions pour mettre à jour le tri/filtrage
 * @param {string} sortBy - Nouveau critère de tri
 * @param {string} filter - Nouveau filtre
 */
export function updatePropertySortAndFilter(sortBy, filter) {
    if (sortBy !== undefined) {
        currentSortBy = sortBy;
        localStorage.setItem('propertySortBy', sortBy);
    }

    if (filter !== undefined) {
        currentFilter = filter;
        localStorage.setItem('propertyFilter', filter);
    }

    // Recréer la liste avec les nouveaux critères
    updatePropertyList(allProperties);

    logger.info(LOG_CATEGORIES.UI, 'Property sort/filter updated', {
        sortBy: currentSortBy,
        filter: currentFilter
    });
}

/**
 * Crée le HTML pour une carte de propriété
 * @param {Object} property - Données de la propriété
 * @returns {string} HTML de la carte
 */
function createPropertyCard(property) {
    const imageHtml = property.thumbnailUrl
        ? `<img src="${property.thumbnailUrl}" alt="Aperçu de la propriété ${property.name}" class="property-thumbnail">`
        : '';

    let cardClasses = "property-card";
    if (property.isRefunded) cardClasses += " property-refunded";
    if (property.projectStatus === 'ongoing') cardClasses += " property-ongoing";
    if (property.projectStatus === 'upcoming') cardClasses += " property-upcoming";

    let statusBadge = "";
    if (property.isRefunded) {
        statusBadge = '<span style="font-weight:normal; color:#5a6268; font-size: 0.9em;">(Remboursé)</span>';
    } else if (property.projectStatus === 'ongoing') {
        statusBadge = '<span style="font-weight:normal; color:#007bff; font-size: 0.9em;">(En Financement)</span>';
    } else if (property.projectStatus === 'upcoming') {
        statusBadge = '<span style="font-weight:normal; color:#ffc107; font-size: 0.9em;">(À Venir)</span>';
    }

    return `
        <div class="${cardClasses}">
            ${imageHtml}
            <div class="property-name">${property.name} ${statusBadge}</div>
            <div class="property-details">
                <div><strong>Adresse:</strong> ${property.address}</div>
                <div><strong>Briques:</strong> ${formatNumber(property.ownedBricks)}</div>
                <div><strong>Investissement:</strong> ${formatCurrency(property.investment)}</div>
                <div><strong>Rendement annuel:</strong> ${property.yearlyReturn}%</div>
                <div><strong>Revenus mensuels nets:</strong> ${formatCurrency(property.monthlyRevenue)}</div>
            </div>
        </div>
    `;
}

/**
 * Met à jour les projections de revenus
 * @param {Object} netRevenueData - Données de revenus nets
 */
function updateProjections(netRevenueData) {
    const container = document.getElementById('projectedRevenuesDisplay');

    if (!container) {
        logger.warn(LOG_CATEGORIES.UI, 'Projections container not found');
        return;
    }

    container.innerHTML = '';

    const currentMonth = getCurrentMonthYYYYMM();
    const monthLabels = ["Ce Mois-ci (est.)", "Mois M+1", "Mois M+2", "Mois M+3"];

    for (let i = 0; i < 4; i++) {
        const monthKey = addMonthsToYYYYMM(currentMonth, i);
        const value = netRevenueData[monthKey];
        const revenueDisplay = typeof value === 'number' ? formatCurrency(value) : 'N/D';

        const cardHtml = `
            <div class="stat-card" style="flex-basis: 200px; padding: 15px;">
                <div class="stat-value" style="font-size: 1.8rem; margin-bottom: 8px;">${revenueDisplay}</div>
                <div class="stat-label" style="font-size: 0.9rem;">${monthLabels[i]}</div>
            </div>
        `;
        container.innerHTML += cardHtml;
    }

    logger.debug(LOG_CATEGORIES.UI, 'Projections updated');
}

/**
 * Affiche la section des résultats
 */
export function showResults() {
    const resultsSection = document.getElementById('results');
    if (resultsSection) {
        resultsSection.classList.remove('hidden');
    }
}

/**
 * Cache la section des résultats
 */
export function hideResults() {
    const resultsSection = document.getElementById('results');
    if (resultsSection) {
        resultsSection.classList.add('hidden');
    }
}
