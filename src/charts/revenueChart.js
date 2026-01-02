/**
 * Graphique d'évolution des revenus mensuels nets
 */

import { state } from '../core/state.js';
import { logger, LOG_CATEGORIES } from '../utils/logger.js';

/**
 * Crée le graphique d'évolution des revenus nets
 * @param {Object} netRevenueData - Données de revenus nets { 'YYYY-MM': montant }
 */
export function createRevenueChart(netRevenueData) {
    const ctx = document.getElementById('revenueEvolutionChart')?.getContext('2d');
    if (!ctx) {
        logger.error(LOG_CATEGORIES.CHART, 'Canvas revenueEvolutionChart not found');
        return;
    }

    // Détruire l'instance existante
    const charts = state.get('charts');
    if (charts.revenueEvolution) {
        charts.revenueEvolution.destroy();
    }

    const chartContainer = ctx.canvas.closest('.chart-container');

    // Vérifier si on a des données
    if (!netRevenueData || Object.keys(netRevenueData).length === 0) {
        logger.info(LOG_CATEGORIES.CHART, 'No data for revenue evolution chart, hiding');
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        if (chartContainer) chartContainer.style.display = 'none';
        return;
    }

    if (chartContainer) chartContainer.style.display = 'block';

    const labels = Object.keys(netRevenueData).sort();
    const data = labels.map(label => netRevenueData[label]);

    try {
        const chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Revenus Mensuels Nets Cumulés (€)',
                    data: data,
                    borderColor: '#4bc0c0',
                    backgroundColor: 'rgba(75, 192, 192, 0.1)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.1,
                    pointBackgroundColor: '#4bc0c0',
                    pointBorderColor: '#ffffff',
                    pointBorderWidth: 2,
                    pointRadius: 4
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
                                return `Revenus: ${context.parsed.y.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}`;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function(value) {
                                return value.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
                            }
                        }
                    }
                }
            }
        });

        // Sauvegarder dans l'état
        charts.revenueEvolution = chart;
        state.set('charts', charts);

        logger.info(LOG_CATEGORIES.CHART, 'Revenue chart created', { dataPoints: labels.length });

    } catch (err) {
        logger.error(LOG_CATEGORIES.CHART, 'Error creating revenue chart', err);
    }
}
