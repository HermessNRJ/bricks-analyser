/**
 * Camembert de la répartition des versements
 *
 * Il a remplacé la répartition par propriété, qui découpait l'investissement
 * en une tranche par bien. Ce découpage-là est déjà celui du portefeuille en
 * surface, en mieux : la treemap montre les 241 propriétés d'un coup là où le
 * donut en montrait neuf et repliait le reste dans « Autres ».
 *
 * Ce qui manquait, en revanche, c'était la vue d'ensemble du carnet de
 * versements : le bilan du mois donne les comptes en chiffres, la fiche donne
 * le détail propriété par propriété, mais rien ne disait quelle part du
 * portefeuille verse et quelle part se tait.
 *
 * Les quatre états forment une partition — chaque propriété en occupe un et un
 * seul — et c'est ce qui rend le camembert lisible ici : les tranches se
 * complètent au lieu de se recouvrir. Aucune n'est masquée quand elle vaut
 * zéro : « en retard : 0 » est une information, et une ligne qui disparaît de
 * la légende se lit comme un oubli.
 */

import { state } from '../core/state.js';
import { logger, LOG_CATEGORIES } from '../utils/logger.js';
import { formatNumber, formatPercentage } from '../utils/formatters.js';
import { ETATS } from '../business/versements.js';
import { couleur } from './theme.js';

/**
 * Les quatre états, dans l'ordre du cycle de vie d'une propriété
 *
 * `masque` sort la tranche du tracé au premier affichage sans la retirer du
 * graphique : un portefeuille ancien compte plus de projets soldés que de
 * projets vivants, et les laisser occuper la moitié du disque écrasait les
 * trois états sur lesquels on a prise. Un clic sur la légende les rappelle.
 */
export const SEGMENTS = [
    { etat: ETATS.VERSE, libelle: 'À jour', jeton: '--statut-actif' },
    { etat: ETATS.ATTENDU, libelle: 'Démarrage en attente', jeton: '--statut-avenir' },
    { etat: ETATS.MANQUANT, libelle: 'En retard', jeton: '--alerte' },
    { etat: ETATS.SOLDE, libelle: 'Déjà remboursé', jeton: '--statut-rembourse', masque: true }
];

/**
 * Traduit les comptes de versements en tranches du camembert
 *
 * Sépare le calcul du tracé : c'est la seule partie qui mérite un test, et
 * Chart.js n'a rien à faire dans un test unitaire.
 *
 * @param {Object|null} comptes - { verse, manquant, attendu, solde }
 * @returns {Array<Object>|null} Tranches dans l'ordre, null si rien à montrer
 */
export function tranchesVersements(comptes) {
    if (!comptes || typeof comptes !== 'object') {
        return null;
    }

    const tranches = SEGMENTS.map(segment => ({
        ...segment,
        valeur: Number.isFinite(comptes[segment.etat]) ? comptes[segment.etat] : 0
    }));

    // Un relevé qui ne classe aucune propriété ne dit rien : mieux vaut ne rien
    // afficher qu'un disque vide accompagné de quatre zéros.
    if (tranches.every(t => t.valeur === 0)) {
        return null;
    }

    return tranches;
}

/**
 * Total des tranches encore visibles
 *
 * Les pourcentages se lisent sur ce total, et non sur l'effectif complet :
 * décocher les projets soldés doit répondre à « quelle part de ce qui doit
 * verser verse », pas laisser des parts qui ne font plus cent.
 *
 * @param {Object} graphique - Instance Chart.js
 * @returns {number} Somme des tranches affichées
 */
function totalVisible(graphique) {
    return graphique.data.datasets[0].data.reduce(
        (somme, valeur, i) => (graphique.getDataVisibility(i) ? somme + valeur : somme),
        0
    );
}

/**
 * Écrit l'effectif affiché dans le trou du camembert
 *
 * Le nombre suit les tranches cochées : il répond à la même question que les
 * pourcentages de la légende, sur le même périmètre.
 */
const texteCentre = {
    id: 'texteCentreStatuts',
    afterDatasetsDraw: (graphique) => {
        const { ctx, chartArea } = graphique;

        if (!chartArea) {
            return;
        }

        const centreX = (chartArea.left + chartArea.right) / 2;
        const centreY = (chartArea.top + chartArea.bottom) / 2;

        // Le texte doit tenir dans le trou, jamais déborder sur les tranches
        const rayon = Math.min(
            chartArea.right - chartArea.left,
            chartArea.bottom - chartArea.top
        ) / 2 * 0.55;

        const total = totalVisible(graphique);
        const taille = Math.max(12, Math.min(28, Math.floor(rayon * 0.5)));

        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        ctx.font = `600 ${taille}px ui-monospace, SFMono-Regular, Menlo, monospace`;
        ctx.fillStyle = couleur('--ink');
        ctx.fillText(formatNumber(total), centreX, centreY - taille * 0.35);

        ctx.font = `500 ${Math.max(9, Math.round(taille * 0.42))}px system-ui, sans-serif`;
        ctx.fillStyle = couleur('--ink-muted');
        ctx.fillText(total === 1 ? 'propriété' : 'propriétés', centreX, centreY + taille * 0.7);

        ctx.restore();
    }
};

/**
 * Crée le camembert de répartition des versements
 * @param {Object|null} versements - { moisReference, comptes } issus du calcul
 */
export function createStatutsChart(versements) {
    const canevas = document.getElementById('statutsChart');
    const ctx = canevas?.getContext('2d');

    if (!ctx) {
        logger.error(LOG_CATEGORIES.CHART, 'Canvas statutsChart not found');
        return;
    }

    const charts = state.get('charts');
    if (charts.statuts) {
        charts.statuts.destroy();
        charts.statuts = null;
    }

    const conteneur = canevas.closest('.chart-container');
    const tranches = tranchesVersements(versements?.comptes);

    // Sans état de compte, aucune propriété ne porte d'état de versement : le
    // graphique n'a pas de repli à afficher, comme le bilan du mois qui se cache.
    if (!tranches) {
        logger.info(LOG_CATEGORIES.CHART, 'No payment states for statuts chart, hiding');
        ctx.clearRect(0, 0, canevas.width, canevas.height);
        if (conteneur) conteneur.style.display = 'none';
        return;
    }

    if (conteneur) conteneur.style.display = 'block';

    try {
        const chart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: tranches.map(t => t.libelle),
                datasets: [{
                    data: tranches.map(t => t.valeur),
                    backgroundColor: tranches.map(t => couleur(t.jeton)),
                    borderWidth: 3,
                    borderColor: couleur('--surface'),
                    hoverOffset: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                cutout: '58%',
                animation: {
                    animateRotate: true,
                    animateScale: false,
                    duration: 800,
                    easing: 'easeOutQuart'
                },
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            padding: 12,
                            usePointStyle: true,
                            font: { size: 11 },
                            // Recalculée à chaque tracé : décocher une tranche
                            // change le total, donc tous les pourcentages.
                            generateLabels: (graphique) => {
                                const total = totalVisible(graphique);
                                const jeu = graphique.data.datasets[0];

                                return graphique.data.labels.map((libelle, i) => {
                                    const valeur = jeu.data[i];
                                    const visible = graphique.getDataVisibility(i);
                                    const part = total > 0 && visible
                                        ? ` (${formatPercentage(valeur / total * 100, 0)})`
                                        : '';

                                    return {
                                        text: `${libelle} — ${formatNumber(valeur)}${part}`,
                                        fillStyle: jeu.backgroundColor[i],
                                        strokeStyle: jeu.backgroundColor[i],
                                        hidden: !visible,
                                        index: i
                                    };
                                });
                            }
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: (contexte) => {
                                const total = totalVisible(contexte.chart);
                                const valeur = contexte.parsed;
                                const part = total > 0 ? formatPercentage(valeur / total * 100) : '0 %';
                                return ` ${formatNumber(valeur)} sur ${formatNumber(total)} (${part})`;
                            }
                        }
                    }
                }
            },
            plugins: [texteCentre]
        });

        // Décochage initial. Fait après construction parce que Chart.js n'expose
        // la visibilité qu'une fois le graphique monté ; `update('none')` évite
        // que la tranche apparaisse le temps d'une animation avant de sortir.
        tranches.forEach((tranche, i) => {
            if (tranche.masque && chart.getDataVisibility(i)) {
                chart.toggleDataVisibility(i);
            }
        });
        chart.update('none');

        charts.statuts = chart;
        state.set('charts', charts);

        logger.info(LOG_CATEGORIES.CHART, 'Payment status chart created', {
            month: versements.moisReference,
            ...versements.comptes
        });

    } catch (err) {
        logger.error(LOG_CATEGORIES.CHART, 'Error creating payment status chart', err);
    }
}
