/**
 * Graphique d'évolution du montant de l'impôt mensuel
 */

import { state } from '../core/state.js';
import { logger, LOG_CATEGORIES } from '../utils/logger.js';

/**
 * Crée le graphique d'évolution des taxes
 * @param {Object} taxData - Données de taxes { 'YYYY-MM': montant }
 */
export function createTaxChart(taxData) {
    const ctx = document.getElementById('taxAmountChart')?.getContext('2d');
    if (!ctx) {
        logger.error(LOG_CATEGORIES.CHART, 'Canvas taxAmountChart not found');
        return;
    }

    // Détruire l'instance existante
    const charts = state.get('charts');
    if (charts.taxAmount) {
        charts.taxAmount.destroy();
    }

    const chartContainer = ctx.canvas.closest('.chart-container');

    // Vérifier si on a des données
    if (!taxData || Object.keys(taxData).length === 0) {
        logger.info(LOG_CATEGORIES.CHART, 'No data for tax amount chart, hiding');
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        if (chartContainer) chartContainer.style.display = 'none';
        return;
    }

    if (chartContainer) chartContainer.style.display = 'block';

    const labels = Object.keys(taxData).sort();
    const data = labels.map(label => taxData[label]);

    try {
        const chart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: "Montant de l'Impôt (est. 30%)",
                    data: data,
                    backgroundColor: 'rgba(255, 99, 132, 0.2)',
                    borderColor: 'rgba(255, 99, 132, 1)',
                    borderWidth: 1
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
                                return `Impôt: ${context.parsed.y.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}`;
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
        charts.taxAmount = chart;
        state.set('charts', charts);

        logger.info(LOG_CATEGORIES.CHART, 'Tax amount chart created', { dataPoints: labels.length });

    } catch (err) {
        logger.error(LOG_CATEGORIES.CHART, 'Error creating tax amount chart', err);
    }
}
