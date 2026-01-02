/**
 * Graphique d'évolution de l'investissement cumulé
 */

import { state } from '../core/state.js';
import { logger, LOG_CATEGORIES } from '../utils/logger.js';

/**
 * Crée le graphique d'évolution de l'investissement
 * @param {Object} evolutionData - Données d'évolution { 'YYYY-MM': montant }
 */
export function createInvestmentChart(evolutionData) {
    const ctx = document.getElementById('investmentChart')?.getContext('2d');
    if (!ctx) {
        logger.error(LOG_CATEGORIES.CHART, 'Canvas investmentChart not found');
        return;
    }

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

    const labels = Object.keys(evolutionData).sort();
    const data = labels.map(label => evolutionData[label]);

    try {
        const chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Investissement Cumulé (€)',
                    data: data,
                    borderColor: '#667eea',
                    backgroundColor: 'rgba(102, 126, 234, 0.1)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4,
                    pointBackgroundColor: '#667eea',
                    pointBorderColor: '#ffffff',
                    pointBorderWidth: 2,
                    pointRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: { display: true, position: 'top' },
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
                        beginAtZero: true,
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

        logger.info(LOG_CATEGORIES.CHART, 'Investment chart created', { dataPoints: labels.length });

    } catch (err) {
        logger.error(LOG_CATEGORIES.CHART, 'Error creating investment chart', err);
    }
}
