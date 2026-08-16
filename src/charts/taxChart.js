/**
 * Graphique d'évolution du montant de l'impôt mensuel
 */

import { state } from '../core/state.js';
import { CONFIG } from '../core/config.js';
import { formatPercentage } from '../utils/formatters.js';
import { logger, LOG_CATEGORIES } from '../utils/logger.js';

/**
 * Met le taux courant dans le titre de la section
 *
 * Le barème peut changer : aucun taux ne doit rester figé dans le HTML. Et le
 * prélèvement réellement retenu par Bricks ne tombe pas sur le taux affiché —
 * un remboursement de capital glissé dans un coupon n'est pas imposable —, donc
 * le taux ne s'annonce que tant qu'on en est réduit à l'estimer.
 *
 * @param {boolean} reel - true si les montants viennent de l'état de compte
 */
function majTitreImpot(reel) {
    const titre = document.getElementById('titreImpot');

    if (titre) {
        titre.textContent = reel
            ? 'Impôt mensuel prélevé'
            : `Impôt mensuel estimé (${formatPercentage(CONFIG.TAX_RATE * 100)})`;
    }
}

/**
 * Crée le graphique d'évolution des taxes
 * @param {Object} taxData - Données de taxes { 'YYYY-MM': montant }
 * @param {Object} [options]
 * @param {boolean} [options.reel] - true si les montants viennent de l'état de
 *   compte Bricks, false s'ils sont estimés depuis les taux affichés
 */
export function createTaxChart(taxData, { reel = false } = {}) {
    majTitreImpot(reel);

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
                    label: reel
                        ? 'Impôt prélevé par Bricks (€)'
                        : `Montant de l'impôt (est. ${formatPercentage(CONFIG.TAX_RATE * 100)})`,
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
