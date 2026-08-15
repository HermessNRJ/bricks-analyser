/**
 * D'où vient l'argent, mois par mois
 *
 * Trois sources alimentent le compte : vos versements, le parrainage et le
 * solde boosté. Le portefeuille les mélange — une brique achetée avec un
 * filleul ressemble à une brique achetée avec un virement — et seul ce
 * graphique les sépare.
 *
 * ## Pourquoi des barres, et non des courbes cumulées
 *
 * Une courbe cumulée ne redescend jamais. Passé les premiers mois elle ne dit
 * plus que « le temps passe », et deux portefeuilles très différents y
 * dessinent la même pente montante. Le rythme, lui, est une information : les
 * mois où l'on a mis de côté, ceux où l'on s'est arrêté, celui où un parrainage
 * est tombé. Chaque barre est un mois, et sa hauteur l'argent entré ce mois-là.
 *
 * ## Pourquoi empilées, et non côte à côte
 *
 * Les échelles sont incomparables : quelques centaines d'euros de versement
 * contre quelques centimes de solde boosté. Trois barres groupées en
 * laisseraient deux invisibles. Empilées, la hauteur totale garde un sens —
 * tout ce qui est entré ce mois-là — et chaque source occupe la place qu'elle
 * pèse vraiment. Un parrainage de 50 € sur un mois à 300 € se voit ; le solde
 * boosté ne se voit pas, et c'est la vérité de sa taille. L'infobulle le dit
 * au centime.
 *
 * ## Le repère
 *
 * Un trait horizontal marque votre versement mensuel moyen. Sans lui, une barre
 * ne se compare qu'à ses voisines ; avec lui, chaque mois se lit au-dessus ou
 * en dessous de votre rythme habituel — ce qui est la question qu'on se pose en
 * regardant ses propres apports.
 */

import { state } from '../core/state.js';
import { logger, LOG_CATEGORIES } from '../utils/logger.js';

/** Une couleur par source, reprises du système visuel de l'application */
const SOURCES = [
    { cle: 'apports', libelle: 'Vos versements', couleur: '#1d5fb0' },
    { cle: 'parrainage', libelle: 'Parrainage', couleur: '#1f6f4a' },
    { cle: 'boost', libelle: 'Solde boosté', couleur: '#a97400' }
];

/**
 * Trace le repère du versement moyen par-dessus les barres
 *
 * Un plugin plutôt qu'une quatrième série : le repère n'est pas une donnée
 * mensuelle, et l'ajouter aux données l'aurait fait figurer dans la légende et
 * dans les infobulles, où il n'a rien à faire.
 */
const repereMoyenne = {
    id: 'repereMoyenne',
    afterDatasetsDraw(chart, args, options) {
        const moyenne = options?.valeur;

        if (!Number.isFinite(moyenne) || moyenne <= 0) {
            return;
        }

        const { ctx, chartArea, scales } = chart;
        const y = scales.y.getPixelForValue(moyenne);

        if (y < chartArea.top || y > chartArea.bottom) {
            return;
        }

        ctx.save();
        ctx.strokeStyle = '#5c6b77';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(chartArea.left, y);
        ctx.lineTo(chartArea.right, y);
        ctx.stroke();

        // Une barre haute passe souvent sous le repère : sans ce fond, le
        // libellé se lisait par-dessus le bleu et devenait illisible.
        ctx.setLineDash([]);
        ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'bottom';

        const texte = `moyenne ${Math.round(moyenne).toLocaleString('fr-FR')}€`;
        const largeur = ctx.measureText(texte).width;

        ctx.fillStyle = 'rgba(255, 255, 255, 0.88)';
        ctx.fillRect(chartArea.right - largeur - 6, y - 17, largeur + 6, 14);

        ctx.fillStyle = '#5c6b77';
        ctx.fillText(texte, chartArea.right - 3, y - 4);
        ctx.restore();
    }
};

/**
 * Crée le graphique de l'origine des fonds
 *
 * @param {Object|null} origine - Séries mensuelles { apports, parrainage, boost }
 * @param {Object} [options]
 * @param {boolean} [options.apportsConnus] - false si le journal manque : la
 *   série des versements est alors tue plutôt que tracée à plat sur zéro
 * @param {number} [options.moyenneApports] - Versement mensuel moyen, en repère
 */
export function createOrigineFondsChart(origine, { apportsConnus = true, moyenneApports = 0 } = {}) {
    const ctx = document.getElementById('origineFondsChart')?.getContext('2d');

    if (!ctx) {
        logger.error(LOG_CATEGORIES.CHART, 'Canvas origineFondsChart not found');
        return;
    }

    const charts = state.get('charts');

    if (charts.origineFonds) {
        charts.origineFonds.destroy();
        charts.origineFonds = null;
    }

    const conteneur = document.getElementById('origineFondsContainer');
    const labels = Object.keys(origine?.parrainage || {}).sort();

    majNote(origine, apportsConnus, labels);

    if (labels.length === 0) {
        logger.info(LOG_CATEGORIES.CHART, 'No data for funding source chart, hiding');
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        if (conteneur) conteneur.style.display = 'none';
        return;
    }

    if (conteneur) conteneur.style.display = 'block';

    const retenues = SOURCES.filter(source => source.cle !== 'apports' || apportsConnus);

    const datasets = retenues.map(source => ({
        label: source.libelle,
        data: labels.map(mois => origine[source.cle]?.[mois] ?? 0),
        backgroundColor: source.couleur,
        borderWidth: 0,
        // Une barre par mois sur trois ans : le moindre espace les efface
        categoryPercentage: 0.86,
        barPercentage: 0.94
    }));

    try {
        const chart = new Chart(ctx, {
            type: 'bar',
            data: { labels, datasets },
            plugins: [repereMoyenne],
            options: {
                responsive: true,
                maintainAspectRatio: true,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { display: true, position: 'bottom' },
                    repereMoyenne: { valeur: apportsConnus ? moyenneApports : 0 },
                    tooltip: {
                        callbacks: {
                            // Une source à zéro n'apprend rien : on ne l'écrit pas
                            label: context => context.parsed.y > 0
                                ? `${context.dataset.label} : ${context.parsed.y.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}€`
                                : null,
                            footer: articles => {
                                const total = articles.reduce((somme, a) => somme + a.parsed.y, 0);
                                return total > 0
                                    ? `Entré ce mois-là : ${total.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}€`
                                    : 'Rien versé ce mois-là';
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        stacked: true,
                        grid: { display: false },
                        ticks: {
                            // 33 mois d'étiquettes se chevauchent : une sur trois suffit
                            autoSkip: true,
                            maxRotation: 0,
                            maxTicksLimit: 8
                        }
                    },
                    y: {
                        stacked: true,
                        beginAtZero: true,
                        ticks: {
                            callback: value => `${value.toLocaleString('fr-FR')}€`
                        }
                    }
                }
            }
        });

        charts.origineFonds = chart;
        state.set('charts', charts);

        logger.info(LOG_CATEGORIES.CHART, 'Funding source chart created', {
            months: labels.length,
            series: datasets.length
        });

    } catch (err) {
        logger.error(LOG_CATEGORIES.CHART, 'Error creating funding source chart', err);
    }
}

/**
 * Dit ce que la fenêtre affichée additionne, et ce qui manque à l'appel
 *
 * @param {Object|null} origine - Séries mensuelles
 * @param {boolean} apportsConnus - true si le journal a été lu
 * @param {Array<string>} labels - Mois affichés
 */
function majNote(origine, apportsConnus, labels) {
    const note = document.getElementById('origineFondsNote');

    if (!note) {
        return;
    }

    if (!apportsConnus) {
        note.textContent = 'Vos versements ne figurent pas ici : ils ne se lisent que dans le'
            + ' journal des mouvements. Rechargez depuis l\'API pour les faire apparaître.';
        return;
    }

    const somme = cle => labels.reduce((total, m) => total + (origine[cle]?.[m] || 0), 0);
    const verse = somme('apports');
    const offert = somme('parrainage') + somme('boost');

    const euros = (montant, decimales = 2) => montant.toLocaleString('fr-FR', {
        minimumFractionDigits: decimales, maximumFractionDigits: decimales
    });

    const phrases = ['Chaque barre est un mois : l\'argent entré, non le cumul depuis l\'origine.'];

    if (verse > 0) {
        phrases.push(`Sur la période affichée, Bricks vous a offert ${euros(offert)}€`
            + ` pour ${euros(verse, 0)}€ versés de votre poche.`);
    }

    phrases.push('Le solde boosté se compte en centimes : il ne se voit pas à cette échelle,'
        + ' mais l\'infobulle du mois le donne.');

    note.textContent = phrases.join(' ');
}
