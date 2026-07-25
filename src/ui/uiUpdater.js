/**
 * Mise à jour de l'interface utilisateur
 */

import { formatCurrency, formatNumber, truncate, formatMonthName } from '../utils/formatters.js';
import { getCurrentMonthYYYYMM, addMonthsToYYYYMM, subtractMonths } from '../utils/dateHelpers.js';
import { escapeHtml, safeUrl, stripTags } from '../utils/html.js';
import { CONFIG } from '../core/config.js';
import { logger, LOG_CATEGORIES } from '../utils/logger.js';

// Stocker les propriétés pour le tri/filtrage
let allProperties = [];
let currentSortBy = 'investment-desc';
let currentFilter = 'all';
let currentDateFilter = 'all';
let currentWarningFilter = 'all';
let currentCountryFilter = 'all';

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
    currentDateFilter = localStorage.getItem('propertyDateFilter') || 'all';
    currentWarningFilter = localStorage.getItem('propertyWarningFilter') || 'all';
    currentCountryFilter = localStorage.getItem('propertyCountryFilter') || 'all';

    // Remplir le dropdown des pays disponibles
    populateCountryFilter(allProperties);

    updatePropertyList(allProperties);
    updateProjections(results.netRevenueEvolutionData);

    logger.info(LOG_CATEGORIES.UI, 'UI updated successfully');
}

/**
 * Remplit le dropdown des pays avec les pays disponibles
 * @param {Array} properties - Liste des propriétés
 */
function populateCountryFilter(properties) {
    const countryFilterSelect = document.getElementById('propertyCountryFilter');
    if (!countryFilterSelect) return;

    // Extraire les pays uniques
    const countries = [...new Set(properties.map(p => p.country))].sort();

    // Garder l'option "Tous les pays" et ajouter les pays
    countryFilterSelect.innerHTML = '<option value="all">Tous les pays</option>';

    countries.forEach(country => {
        const option = document.createElement('option');
        option.value = country;
        option.textContent = country;
        countryFilterSelect.appendChild(option);
    });

    // Restaurer la sélection sauvegardée
    countryFilterSelect.value = currentCountryFilter;

    logger.debug(LOG_CATEGORIES.UI, 'Country filter populated', { countries: countries.length });
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

    // Appliquer les filtres
    let filteredProperties = filterProperties(properties, currentFilter, currentDateFilter, currentWarningFilter, currentCountryFilter);

    // Appliquer le tri
    let sortedProperties = sortProperties(filteredProperties, currentSortBy);

    // Mettre à jour le compteur
    if (countElement) {
        countElement.textContent = sortedProperties.length;
    }

    // Générer le HTML
    container.innerHTML = sortedProperties.map(property => createPropertyCard(property)).join('');

    // Les cartes sont recréées à chaque tri/filtre : un seul listener délégué suffit
    attachPropertyCardListener(container);

    logger.debug(LOG_CATEGORIES.UI, 'Property list updated', {
        total: properties.length,
        filtered: filteredProperties.length,
        displayed: sortedProperties.length,
        sortBy: currentSortBy,
        filter: currentFilter,
        countryFilter: currentCountryFilter
    });
}

/**
 * Installe (une seule fois) le listener délégué d'ouverture des fiches propriété
 * @param {HTMLElement} container - Conteneur de la liste des propriétés
 */
function attachPropertyCardListener(container) {
    if (container.dataset.cardListenerAttached === 'true') {
        return;
    }

    container.addEventListener('click', (event) => {
        const card = event.target.closest('[data-project-url]');
        if (card) {
            window.open(card.dataset.projectUrl, '_blank', 'noopener');
        }
    });

    container.dataset.cardListenerAttached = 'true';
}

/**
 * Filtre les propriétés selon le critère
 * @param {Array} properties - Propriétés à filtrer
 * @param {string} filterType - Type de filtre
 * @param {string} dateFilterType - Type de filtre de date
 * @param {string} warningFilterType - Type de filtre de warning
 * @param {string} countryFilterType - Type de filtre de pays
 * @returns {Array} Propriétés filtrées
 */
function filterProperties(properties, filterType, dateFilterType = 'all', warningFilterType = 'all', countryFilterType = 'all') {
    let filtered = properties;

    // Filtre par statut
    switch (filterType) {
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

    // Filtre par date
    switch (dateFilterType) {
        case 'has-revenue-date':
            filtered = filtered.filter(p => p.revenueStartDate);
            break;
        case 'no-revenue-date':
            filtered = filtered.filter(p => !p.revenueStartDate);
            break;
        case 'has-refund-date':
            filtered = filtered.filter(p => p.refundDate);
            break;
        case 'no-refund-date':
            filtered = filtered.filter(p => !p.refundDate);
            break;
    }

    // Filtre par warning
    switch (warningFilterType) {
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
    }

    // Filtre par pays
    if (countryFilterType !== 'all') {
        filtered = filtered.filter(p => p.country === countryFilterType);
    }

    return filtered;
}

/**
 * Vérifie si une propriété a un warning dans le dernier mois
 * @param {Object} property - Propriété
 * @returns {boolean}
 */
function hasWarningInLastMonth(property) {
    if (!property.warnings || property.warnings.length === 0) return false;

    const oneMonthAgo = subtractMonths(new Date(), 1);

    return property.warnings.some(w => {
        const warningDate = new Date(w.date);
        return warningDate >= oneMonthAgo;
    });
}

/**
 * Vérifie si une propriété a un warning entre -2 mois et -1 mois
 * @param {Object} property - Propriété
 * @returns {boolean}
 */
function hasWarningInMonthBefore(property) {
    if (!property.warnings || property.warnings.length === 0) return false;

    const now = new Date();
    const twoMonthsAgo = subtractMonths(now, 2);
    const oneMonthAgo = subtractMonths(now, 1);

    return property.warnings.some(w => {
        const warningDate = new Date(w.date);
        return warningDate >= twoMonthsAgo && warningDate < oneMonthAgo;
    });
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

/**
 * Exporte les fonctions pour mettre à jour le tri/filtrage
 * @param {string} sortBy - Nouveau critère de tri
 * @param {string} filter - Nouveau filtre
 * @param {string} dateFilter - Nouveau filtre de date
 * @param {string} warningFilter - Nouveau filtre de warning
 * @param {string} countryFilter - Nouveau filtre de pays
 */
export function updatePropertySortAndFilter(sortBy, filter, dateFilter, warningFilter, countryFilter) {
    if (sortBy !== undefined) {
        currentSortBy = sortBy;
        localStorage.setItem('propertySortBy', sortBy);
    }

    if (filter !== undefined) {
        currentFilter = filter;
        localStorage.setItem('propertyFilter', filter);
    }

    if (dateFilter !== undefined) {
        currentDateFilter = dateFilter;
        localStorage.setItem('propertyDateFilter', dateFilter);
    }

    if (warningFilter !== undefined) {
        currentWarningFilter = warningFilter;
        localStorage.setItem('propertyWarningFilter', warningFilter);
    }

    if (countryFilter !== undefined) {
        currentCountryFilter = countryFilter;
        localStorage.setItem('propertyCountryFilter', countryFilter);
    }

    // Recréer la liste avec les nouveaux critères
    updatePropertyList(allProperties);

    logger.info(LOG_CATEGORIES.UI, 'Property sort/filter updated', {
        sortBy: currentSortBy,
        filter: currentFilter,
        countryFilter: currentCountryFilter
    });
}

/**
 * Crée le HTML pour une carte de propriété
 * @param {Object} property - Données de la propriété
 * @returns {string} HTML de la carte
 */
function createPropertyCard(property) {
    const thumbnailUrl = safeUrl(property.thumbnailUrl);
    const imageHtml = thumbnailUrl
        ? `<img src="${escapeHtml(thumbnailUrl)}" alt="Aperçu de la propriété ${escapeHtml(property.name)}" class="property-thumbnail">`
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

    // Formatage des dates
    const revenueStartDisplay = property.revenueStartDate
        ? formatMonthName(property.revenueStartDate)
        : 'N/D';
    const refundDateDisplay = property.refundDate
        ? `${formatMonthName(property.refundDate)} (est.)`
        : (property.isRefunded ? 'Remboursé' : 'N/D');

    // URL du projet sur Bricks.co
    const projectUrl = `https://app.bricks.co/project/${encodeURIComponent(property.id)}`;

    // Générer le badge de warning si nécessaire
    let warningSection = '';
    if (property.warningsCount > 0) {
        const hasRecent = hasWarningInLastMonth(property);
        const badgeColor = hasRecent ? '#ff6b6b' : '#ffa726';
        const badgeText = hasRecent ? 'Récent' : 'Ancien';

        // Créer la liste des warnings
        const warningsList = property.warnings
            .map(w => {
                const warningDate = new Date(w.date);
                const formattedDate = Number.isNaN(warningDate.getTime())
                    ? 'Date inconnue'
                    : warningDate.toLocaleDateString('fr-FR', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                    });
                // Nettoyer le HTML de la description pour l'affichage
                const cleanDescription = stripTags(w.description).substring(0, 150);
                const ellipsis = cleanDescription.length >= 150 ? '...' : '';

                return `
                    <div style="margin-bottom: 8px; padding: 8px; background: #f8f9fa; border-radius: 4px; font-size: 0.85em;">
                        <div style="font-weight: 600; color: #495057; margin-bottom: 4px;">${escapeHtml(formattedDate)}</div>
                        <div style="color: #6c757d;">${escapeHtml(cleanDescription)}${ellipsis}</div>
                    </div>
                `;
            })
            .join('');

        warningSection = `
            <div style="margin-top: 12px; padding: 10px; background: ${badgeColor}15; border-left: 4px solid ${badgeColor}; border-radius: 4px;">
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                    <span style="font-size: 1.2em;">⚠️</span>
                    <strong style="color: ${badgeColor};">${property.warningsCount} Warning(s) ${badgeText}</strong>
                </div>
                <div style="max-height: 200px; overflow-y: auto;">
                    ${warningsList}
                </div>
            </div>
        `;
    }

    return `
        <div class="${cardClasses}" data-project-url="${escapeHtml(projectUrl)}" style="cursor: pointer;">
            ${imageHtml}
            <div class="property-name">${escapeHtml(property.name)} ${statusBadge}</div>
            <div class="property-details">
                <div><strong>Adresse:</strong> ${escapeHtml(property.address)}</div>
                <div><strong>Briques:</strong> ${formatNumber(property.ownedBricks)}</div>
                <div><strong>Investissement:</strong> ${formatCurrency(property.investment)}</div>
                <div><strong>Rendement annuel:</strong> ${escapeHtml(property.yearlyReturn)}%</div>
                <div><strong>Revenus mensuels nets:</strong> ${formatCurrency(property.monthlyRevenue)}</div>
                <div><strong>Premier versement:</strong> ${escapeHtml(revenueStartDisplay)}</div>
                <div><strong>Date de remboursement:</strong> ${escapeHtml(refundDateDisplay)}</div>
            </div>
            ${warningSection}
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

    const currentMonth = getCurrentMonthYYYYMM();
    const revenueData = netRevenueData || {};
    const cards = [];

    for (let i = 0; i < CONFIG.PROJECTIONS_MONTHS; i++) {
        const monthKey = addMonthsToYYYYMM(currentMonth, i);
        const value = revenueData[monthKey];
        const revenueDisplay = typeof value === 'number' ? formatCurrency(value) : 'N/D';
        const label = i === 0 ? 'Ce Mois-ci (est.)' : `Mois M+${i}`;

        cards.push(`
            <div class="stat-card" style="flex-basis: 200px; padding: 15px;">
                <div class="stat-value" style="font-size: 1.8rem; margin-bottom: 8px;">${revenueDisplay}</div>
                <div class="stat-label" style="font-size: 0.9rem;">${label}</div>
            </div>
        `);
    }

    container.innerHTML = cards.join('');

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
