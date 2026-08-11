/**
 * Graphique d'évolution de l'investissement cumulé
 */

import { state } from '../core/state.js';
import { logger, LOG_CATEGORIES } from '../utils/logger.js';

/**
 * Crée le graphique d'évolution de l'investissement
 * La fenêtre temporelle est appliquée en amont, par le sélecteur commun aux
 * graphiques datés : ce module dessine ce qu'on lui donne.
 * @param {Object} evolutionData - Données d'évolution { 'YYYY-MM': montant }
 * @param {boolean} [historiqueComplet] - true si la fenêtre couvre tout
 */
export function createInvestmentChart(evolutionData, historiqueComplet = true) {
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
    const data = labels.map(mois => evolutionData[mois]);

    // Sur l'historique complet, partir de zéro donne l'échelle réelle du portefeuille.
    // Sur une fenêtre courte, cela écraserait la courbe : on laisse Chart.js cadrer.
    const beginAtZero = historiqueComplet;

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
            fullHistory: historiqueComplet
        });

    } catch (err) {
        logger.error(LOG_CATEGORIES.CHART, 'Error creating investment chart', err);
    }
}
