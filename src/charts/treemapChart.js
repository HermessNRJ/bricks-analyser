/**
 * Graphique Treemap - Vue complète du portefeuille
 * Affiche TOUTES les propriétés avec taille proportionnelle à l'investissement
 */

import { state } from '../core/state.js';
import { logger, LOG_CATEGORIES } from '../utils/logger.js';
import { formatCurrency, truncate } from '../utils/formatters.js';

/**
 * Interpole entre deux couleurs RGB
 * @param {Array} color1 - [r, g, b]
 * @param {Array} color2 - [r, g, b]
 * @param {number} factor - 0 à 1
 * @returns {Array} [r, g, b]
 */
function interpolateColor(color1, color2, factor) {
    return color1.map((channel, i) =>
        Math.round(channel + factor * (color2[i] - channel))
    );
}

/**
 * Obtenir la couleur selon le rendement annuel avec gradient continu
 * @param {number} yieldRate - Rendement annuel
 * @param {number} minYield - Rendement minimum du portefeuille
 * @param {number} maxYield - Rendement maximum du portefeuille
 * @returns {string} Couleur rgba
 */
function getColorByYield(yieldRate, minYield, maxYield) {
    // Points de couleur : Rouge → Orange → Jaune → Vert
    const colorStops = [
        [220, 53, 69],    // Rouge
        [253, 126, 20],   // Orange
        [255, 193, 7],    // Jaune
        [40, 167, 69]     // Vert
    ];

    // Normaliser le rendement entre 0 et 1
    const range = maxYield - minYield;
    if (range === 0) {
        // Si tous les rendements sont identiques, utiliser la couleur du milieu
        const [r, g, b] = colorStops[1];
        return `rgba(${r}, ${g}, ${b}, 0.8)`;
    }

    const normalized = Math.max(0, Math.min(1, (yieldRate - minYield) / range));

    // Déterminer entre quels points de couleur on se trouve
    const numStops = colorStops.length;
    const scaledPosition = normalized * (numStops - 1);
    const stopIndex = Math.floor(scaledPosition);
    const factor = scaledPosition - stopIndex;

    // Gérer le cas où on est exactement au dernier point
    if (stopIndex >= numStops - 1) {
        const [r, g, b] = colorStops[numStops - 1];
        return `rgba(${r}, ${g}, ${b}, 0.8)`;
    }

    // Interpoler entre les deux couleurs
    const [r, g, b] = interpolateColor(
        colorStops[stopIndex],
        colorStops[stopIndex + 1],
        factor
    );

    return `rgba(${r}, ${g}, ${b}, 0.8)`;
}

/**
 * Obtenir une couleur plus foncée pour la bordure
 * @param {string} color - Couleur rgba
 * @returns {string} Couleur plus foncée
 */
function getDarkerColor(color) {
    // Convertir rgba en couleur plus foncée
    return color.replace('0.8', '1');
}

/**
 * Crée le graphique Treemap
 * @param {Array} properties - Liste des propriétés
 */
export function createTreemapChart(properties) {
    const ctx = document.getElementById('treemapChart')?.getContext('2d');
    if (!ctx) {
        logger.error(LOG_CATEGORIES.CHART, 'Canvas treemapChart not found');
        return;
    }

    // Détruire l'instance existante
    const charts = state.get('charts');
    if (charts.treemap) {
        charts.treemap.destroy();
    }

    const chartContainer = ctx.canvas.closest('div');

    // Vérifier si on a des données
    if (!properties || properties.length === 0) {
        logger.info(LOG_CATEGORIES.CHART, 'No data for treemap chart, hiding');
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        if (chartContainer) chartContainer.style.display = 'none';
        return;
    }

    if (chartContainer) chartContainer.style.display = 'block';

    // Filtrer les propriétés non remboursées uniquement
    const activeProperties = properties.filter(p => !p.isRefunded && p.investment > 0);

    if (activeProperties.length === 0) {
        logger.warn(LOG_CATEGORIES.CHART, 'No active properties for treemap');
        if (chartContainer) chartContainer.style.display = 'none';
        return;
    }

    // Calculer les rendements min/max pour le gradient
    const yields = activeProperties.map(p => p.yearlyReturn || 0);
    const minYield = Math.min(...yields);
    const maxYield = Math.max(...yields);

    logger.debug(LOG_CATEGORIES.CHART, 'Yield range for color gradient', {
        minYield: minYield.toFixed(2),
        maxYield: maxYield.toFixed(2)
    });

    // Préparer les données pour le treemap
    const treemapData = activeProperties.map(property => ({
        name: property.name,
        value: property.investment,
        property: property, // Stocker toute la propriété pour le tooltip
        color: getColorByYield(property.yearlyReturn || 0, minYield, maxYield)
    }));

    // Trier par investissement décroissant pour un meilleur rendu
    treemapData.sort((a, b) => b.value - a.value);

    try {
        const chart = new Chart(ctx, {
            type: 'treemap',
            data: {
                datasets: [{
                    label: 'Investissement par Propriété',
                    tree: treemapData,
                    key: 'value',
                    groups: ['name'],
                    spacing: 1,
                    borderWidth: 2,
                    borderColor: 'white',
                    backgroundColor: (ctx) => {
                        if (ctx.type !== 'data') return 'transparent';
                        const dataIndex = ctx.dataIndex;
                        const data = ctx.dataset.tree[dataIndex];
                        return data ? data.color : 'rgba(102, 126, 234, 0.8)';
                    },
                    hoverBackgroundColor: (ctx) => {
                        if (ctx.type !== 'data') return 'transparent';
                        const dataIndex = ctx.dataIndex;
                        const data = ctx.dataset.tree[dataIndex];
                        return data ? getDarkerColor(data.color) : 'rgba(102, 126, 234, 1)';
                    },
                    captions: {
                        align: 'center',
                        display: true,
                        color: 'white',
                        font: {
                            size: 11,
                            weight: 'bold'
                        },
                        padding: 4
                    },
                    labels: {
                        display: true,
                        align: 'center',
                        position: 'middle',
                        color: 'white',
                        font: {
                            size: 11,
                            weight: 'bold'
                        },
                        padding: 4,
                        formatter: (ctx) => {
                            if (ctx.type !== 'data') return '';
                            const data = ctx.dataset.tree[ctx.dataIndex];
                            if (!data) return '';

                            // Calculer la surface du rectangle
                            const element = ctx.chart.getDatasetMeta(0).data[ctx.dataIndex];
                            if (!element || !element.width || !element.height) return '';

                            const area = element.width * element.height;

                            // Si très grand rectangle (>5000px²), afficher nom + montant
                            if (area > 5000) {
                                return [truncate(data.name, 25), formatCurrency(data.value, 0)];
                            }
                            // Si grand rectangle (>2000px²), afficher nom
                            else if (area > 2000) {
                                return truncate(data.name, 20);
                            }
                            // Si moyen rectangle (>800px²), afficher nom court
                            else if (area > 800) {
                                return truncate(data.name, 12);
                            }
                            // Sinon, ne rien afficher (trop petit)
                            return '';
                        }
                    }
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        backgroundColor: 'rgba(0, 0, 0, 0.9)',
                        padding: 15,
                        titleFont: { size: 14, weight: 'bold' },
                        bodyFont: { size: 13 },
                        bodySpacing: 6,
                        callbacks: {
                            title: (tooltipItems) => {
                                if (tooltipItems.length === 0) return '';
                                const item = tooltipItems[0];
                                const data = item.dataset.tree[item.dataIndex];
                                return data ? data.name : '';
                            },
                            label: (context) => {
                                const data = context.dataset.tree[context.dataIndex];
                                if (!data || !data.property) return '';

                                const prop = data.property;
                                const total = activeProperties.reduce((sum, p) => sum + p.investment, 0);
                                const percentage = ((prop.investment / total) * 100).toFixed(1);

                                return [
                                    `💰 Investissement: ${formatCurrency(prop.investment)}`,
                                    `📊 Part du portefeuille: ${percentage}%`,
                                    `🧱 Briques: ${prop.ownedBricks.toLocaleString()}`,
                                    `📈 Rendement annuel: ${prop.yearlyReturn}%`,
                                    `💵 Revenus mensuels: ${formatCurrency(prop.monthlyRevenue)}`,
                                    `📍 Adresse: ${truncate(prop.address, 40)}`
                                ];
                            }
                        }
                    }
                }
            }
        });

        // Sauvegarder dans l'état
        charts.treemap = chart;
        state.set('charts', charts);

        logger.info(LOG_CATEGORIES.CHART, 'Treemap chart created', {
            properties: activeProperties.length,
            totalInvestment: activeProperties.reduce((sum, p) => sum + p.investment, 0)
        });

    } catch (err) {
        logger.error(LOG_CATEGORIES.CHART, 'Error creating treemap chart', err);
    }
}
