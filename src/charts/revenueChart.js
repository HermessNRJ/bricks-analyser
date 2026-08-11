/**
 * Graphique d'évolution des revenus mensuels nets
 */

import { state } from '../core/state.js';
import { logger, LOG_CATEGORIES } from '../utils/logger.js';

/**
 * Crée le graphique d'évolution des revenus nets
 * @param {Object} netRevenueData - Données de revenus nets { 'YYYY-MM': montant }
 * @param {Object} [options]
 * @param {boolean} [options.reel] - true si les montants viennent de l'état de
 *   compte Bricks, false s'ils sont estimés depuis les taux affichés
 * @param {string|null} [options.moisPartiel] - Mois encore en cours, dont le
 *   montant n'est pas comparable aux précédents
 */
export function createRevenueChart(netRevenueData, { reel = false, moisPartiel = null } = {}) {
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

    // Un mois inachevé ne se lit pas comme les autres : son point est creux et
    // le trait qui y mène pointillé, pour qu'une chute de fin de série ne passe
    // pas pour une perte de revenus.
    const indexPartiel = moisPartiel ? labels.indexOf(moisPartiel) : -1;
    const couleur = '#4bc0c0';

    const legende = reel
        ? 'Revenus nets encaissés (€)'
        : 'Revenus nets mensuels estimés (€)';

    majNoteRevenus(reel, moisPartiel);

    try {
        const chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: legende,
                    data: data,
                    borderColor: couleur,
                    backgroundColor: 'rgba(75, 192, 192, 0.1)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.1,
                    pointBackgroundColor: (context) =>
                        context.dataIndex === indexPartiel ? '#ffffff' : couleur,
                    pointBorderColor: (context) =>
                        context.dataIndex === indexPartiel ? couleur : '#ffffff',
                    pointBorderWidth: 2,
                    pointRadius: 4,
                    segment: {
                        borderDash: (context) =>
                            context.p1DataIndex === indexPartiel ? [5, 4] : undefined
                    }
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
                                const montant = context.parsed.y.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
                                const suffixe = context.dataIndex === indexPartiel ? ' (mois en cours)' : '';
                                return `Revenus: ${montant}${suffixe}`;
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

        logger.info(LOG_CATEGORIES.CHART, 'Revenue chart created', {
            dataPoints: labels.length,
            source: reel ? 'bricks-statement' : 'estimate'
        });

    } catch (err) {
        logger.error(LOG_CATEGORIES.CHART, 'Error creating revenue chart', err);
    }
}

/**
 * Dit d'où viennent les montants tracés
 * L'écart entre encaissé et estimé est la question même que pose ce graphique :
 * mieux vaut l'écrire sous la courbe que laisser deviner.
 * @param {boolean} reel - true si les montants viennent de l'état de compte
 * @param {string|null} moisPartiel - Mois encore en cours, s'il y en a un
 */
function majNoteRevenus(reel, moisPartiel) {
    const note = document.getElementById('revenusSourceNote');

    if (!note) {
        return;
    }

    const partiel = moisPartiel ? ' Le dernier point porte sur un mois non terminé.' : '';

    note.textContent = reel
        ? `Montants réellement versés par Bricks, prélèvement déduit : les échéances impayées ne sont pas comptées.${partiel}`
        : 'Estimation déduite des taux affichés : les échéances impayées y sont comptées comme versées. Rechargez depuis l\'API pour obtenir les montants réellement encaissés.';
}
