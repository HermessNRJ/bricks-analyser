/**
 * Graphique d'évolution de l'investissement cumulé
 */

import { state } from '../core/state.js';
import { logger, LOG_CATEGORIES } from '../utils/logger.js';

/**
 * Périodes proposées par le filtre, en nombre de mois affichés
 * 'all' conserve l'intégralité de l'historique.
 */
export const INVESTMENT_RANGES = {
    '3': 3,
    '6': 6,
    '12': 12,
    'all': Infinity
};

export const DEFAULT_INVESTMENT_RANGE = 'all';

// Dernières données reçues : le filtre de période redessine sans recalculer.
let lastEvolutionData = null;
let currentRange = DEFAULT_INVESTMENT_RANGE;

/**
 * Restreint les données d'évolution aux N derniers mois
 * La courbe étant cumulative, tronquer le début ne fausse pas les valeurs :
 * chaque point reste le cumul depuis l'origine.
 * @param {Object} evolutionData - Données d'évolution { 'YYYY-MM': montant }
 * @param {string} range - Clé de INVESTMENT_RANGES
 * @returns {{labels: string[], data: number[]}} Séries prêtes pour Chart.js
 */
export function sliceEvolutionRange(evolutionData, range) {
    const labels = Object.keys(evolutionData || {}).sort();
    const months = INVESTMENT_RANGES[range] ?? INVESTMENT_RANGES[DEFAULT_INVESTMENT_RANGE];

    const kept = Number.isFinite(months) ? labels.slice(-months) : labels;

    return {
        labels: kept,
        data: kept.map(label => evolutionData[label])
    };
}

/**
 * Change la période affichée et redessine le graphique
 * @param {string} range - Clé de INVESTMENT_RANGES
 */
export function setInvestmentRange(range) {
    currentRange = range in INVESTMENT_RANGES ? range : DEFAULT_INVESTMENT_RANGE;

    logger.debug(LOG_CATEGORIES.CHART, 'Investment chart range changed', { range: currentRange });

    if (lastEvolutionData) {
        createInvestmentChart(lastEvolutionData, currentRange);
    }
}

/**
 * Crée le graphique d'évolution de l'investissement
 * @param {Object} evolutionData - Données d'évolution { 'YYYY-MM': montant }
 * @param {string} [range] - Période à afficher (par défaut, la dernière choisie)
 */
export function createInvestmentChart(evolutionData, range = currentRange) {
    const ctx = document.getElementById('investmentChart')?.getContext('2d');
    if (!ctx) {
        logger.error(LOG_CATEGORIES.CHART, 'Canvas investmentChart not found');
        return;
    }

    lastEvolutionData = evolutionData;
    currentRange = range in INVESTMENT_RANGES ? range : DEFAULT_INVESTMENT_RANGE;

    // Détruire l'instance existante
    const charts = state.get('charts');
    if (charts.investment) {
        charts.investment.destroy();
    }

    const chartContainer = ctx.canvas.closest('.chart-container');

    // Vérifier si on a des données
    if (!evolutionData || Object.keys(evolutionData).length === 0) {
        logger.info(LOG_CATEGORIES.CHART, 'No data for investment chart, hiding');
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        if (chartContainer) chartContainer.style.display = 'none';
        return;
    }

    if (chartContainer) chartContainer.style.display = 'block';

    const { labels, data } = sliceEvolutionRange(evolutionData, currentRange);

    // Sur l'historique complet, partir de zéro donne l'échelle réelle du portefeuille.
    // Sur une fenêtre courte, cela écraserait la courbe : on laisse Chart.js cadrer.
    const beginAtZero = currentRange === 'all';

    try {
        const chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Investissement cumulé',
                    data: data,
                    borderColor: '#1d5fb0',
                    backgroundColor: 'rgba(29, 95, 176, 0.08)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.25,
                    pointBackgroundColor: '#1d5fb0',
                    pointBorderColor: '#ffffff',
                    pointBorderWidth: 1.5,
                    // 37 gros points font une chenille : le repère suffit au survol
                    pointRadius: labels.length > 14 ? 0 : 4,
                    pointHoverRadius: 5
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    // Une seule série : sa légende ne dit rien que le titre ne dise déjà
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return `Investissement: ${context.parsed.y.toLocaleString()}€`;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: beginAtZero,
                        ticks: {
                            callback: function(value) {
                                return value.toLocaleString() + '€';
                            }
                        }
                    }
                }
            }
        });

        // Sauvegarder dans l'état
        charts.investment = chart;
        state.set('charts', charts);

        logger.info(LOG_CATEGORIES.CHART, 'Investment chart created', {
            dataPoints: labels.length,
            range: currentRange
        });

    } catch (err) {
        logger.error(LOG_CATEGORIES.CHART, 'Error creating investment chart', err);
    }
}
