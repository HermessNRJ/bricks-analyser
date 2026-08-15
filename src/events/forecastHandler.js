/**
 * Gestionnaire du simulateur de projection
 */

import {
    simulerProjection,
    rendementMoyenPondere,
    horizonMoyenPondere,
    rendementsNets
} from '../business/forecast.js';
import { moyenneVersements } from '../business/apports.js';
import { createForecastChart } from '../charts/forecastChart.js';
import { formatCurrency, formatPercentage } from '../utils/formatters.js';
import { CONFIG } from '../core/config.js';
import { logger, LOG_CATEGORIES } from '../utils/logger.js';

// Dernier portefeuille connu : sert de point de départ à la simulation
let contexte = {
    capitalInitial: 0,
    rendementMoyen: 0,
    rendementConstate: 0,
    rendementConstateNet: 0,
    fenetreConstatee: null,
    tauxImpayeObserve: 0,
    apportMoyen: 0,
    moisObserves: 0,
    apportsConnus: false,
    horizonMoyen: 0
};

const CHAMPS = ['simApport', 'simHorizon', 'simRendement', 'simImpaye', 'simReinvestir'];

/**
 * Lit les hypothèses saisies
 * @returns {Object} Hypothèses prêtes pour simulerProjection
 */
function lireHypotheses() {
    const valeur = (id) => Number(document.getElementById(id)?.value);

    return {
        capitalInitial: contexte.capitalInitial,
        apportMensuel: valeur('simApport'),
        horizonMois: valeur('simHorizon') * 12,
        tauxAnnuelBrut: valeur('simRendement'),
        tauxImpaye: valeur('simImpaye'),
        reinvestir: document.getElementById('simReinvestir')?.checked
    };
}

/**
 * Construit une tuile de résultat
 * @param {string} valeur - Valeur mise en forme
 * @param {string} libelle - Libellé de la tuile
 * @param {string} [detail] - Précision optionnelle
 * @returns {string} HTML de la tuile
 */
function tuile(valeur, libelle, detail = '') {
    return `
        <div class="stat-card">
            <div class="stat-value">${valeur}</div>
            <div class="stat-label">${libelle}</div>
            ${detail ? `<div class="stat-detail">${detail}</div>` : ''}
        </div>
    `;
}

/**
 * Relance la simulation et rafraîchit l'affichage
 */
function rejouer() {
    const hypotheses = lireHypotheses();
    const resultat = simulerProjection(hypotheses);
    const zone = document.getElementById('simResultats');

    if (!zone) {
        return;
    }

    const annees = Math.round(resultat.horizonMois / 12);
    const argentMis = resultat.capitalInitial + resultat.totalApporte;

    zone.innerHTML = [
        tuile(
            formatCurrency(resultat.capitalFinal, 0),
            `Capital dans ${annees} an${annees > 1 ? 's' : ''}`,
            `${formatCurrency(argentMis, 0)} sortis de votre poche`
        ),
        tuile(
            formatCurrency(resultat.revenuNetMensuelFinal),
            'Revenus nets le dernier mois',
            `contre ${formatCurrency(resultat.capitalInitial * (hypotheses.tauxAnnuelBrut / 100 / 12) * (1 - hypotheses.tauxImpaye / 100) * (1 - CONFIG.TAX_RATE))} aujourd'hui`
        ),
        tuile(
            formatCurrency(resultat.cumulNet, 0),
            'Revenus nets cumulés',
            `soit ${formatPercentage(resultat.rendementNetCumule)} de l'argent investi`
        ),
        tuile(
            formatCurrency(resultat.cumulImpots, 0),
            'Impôts cumulés',
            `flat tax ${formatPercentage(CONFIG.TAX_RATE * 100)}`
        )
    ].join('');

    afficherCorrespondanceRendement(hypotheses);

    // Ce que les impayés coûtent ne se voit nulle part ailleurs
    const note = document.getElementById('simHypotheses');
    if (note) {
        const perdu = resultat.cumulPerdu > 0
            ? ` Les impayés vous privent de ${formatCurrency(resultat.cumulPerdu, 0)} de revenus bruts sur la période.`
            : '';
        note.textContent = `Départ à ${formatCurrency(resultat.capitalInitial, 0)} de capital déjà investi.${perdu}`;
    }

    createForecastChart(resultat);

    logger.debug(LOG_CATEGORIES.UI, 'Forecast refreshed', { annees });
}

/**
 * Traduit le rendement brut saisi en ce qui reste après prélèvement
 *
 * Le champ se saisit en brut, comme l'annonce Bricks : la correspondance nette
 * est donc affichée en lecture seule, et suit la saisie. La ligne mentionne
 * aussi l'effet des impayés lorsqu'ils sont non nuls, sans quoi on croirait
 * toucher le net d'impôt alors que la simulation retient moins.
 *
 * Elle rappelle d'abord le taux saisi. Écrite « soit 4,8 % net », elle
 * s'enchaînait au repère juste au-dessus et paraissait qualifier le dernier
 * chiffre qu'on venait d'y lire — celui de Bricks — alors qu'elle découle de la
 * saisie.
 *
 * @param {Object} hypotheses - Hypothèses courantes du simulateur
 */
function afficherCorrespondanceRendement(hypotheses) {
    const ligne = document.getElementById('correspondanceRendement');

    if (!ligne) {
        return;
    }

    const { apresImpot, apresTout } = rendementsNets(
        hypotheses.tauxAnnuelBrut,
        hypotheses.tauxImpaye
    );

    const saisi = formatPercentage(hypotheses.tauxAnnuelBrut || 0);
    const prelevement = formatPercentage(CONFIG.TAX_RATE * 100);
    let texte = `${saisi} saisis → ${formatPercentage(apresImpot)} net`
        + ` après ${prelevement} de prélèvement`;

    if (hypotheses.tauxImpaye > 0) {
        texte += ` · ${formatPercentage(apresTout)} une fois les impayés déduits`;
    }

    ligne.textContent = texte;
}

/**
 * Ce que vous versez réellement de votre poche, par mois
 *
 * Se lisait auparavant dans la courbe d'investissement cumulé, ce qui était
 * faux deux fois. Cette courbe additionne `briques × prix de la brique`, un prix
 * qui baisse à mesure que le principal est remboursé : son écart sur douze mois
 * mêle les achats nouveaux à l'érosion des anciens. Et elle compte les briques
 * achetées avec les coupons réinvestis, que la case « Réinvestir les revenus
 * nets » ajoute déjà par ailleurs — le même argent entrait donc deux fois dans
 * la projection.
 *
 * Le journal des mouvements, lui, sait ce qui est venu de votre banque. C'est
 * la seule source, et c'est celle du graphique « D'où vient l'argent » : les
 * deux chiffres s'accordent désormais par construction.
 *
 * @param {Object|null} origineFonds - Séries d'origine des fonds
 * @returns {Object} { apportMoyen, moisObserves, apportsConnus }
 */
function rythmeDeVersement(origineFonds) {
    const apportsConnus = Boolean(origineFonds?.apportsConnus);
    const serie = apportsConnus ? origineFonds.apports : null;
    const mois = Object.keys(serie || {}).sort().slice(-12);

    return {
        apportMoyen: moyenneVersements(serie, mois),
        moisObserves: mois.length,
        apportsConnus
    };
}

/**
 * Introduit la fenêtre de mesure par la bonne préposition
 *
 * Coller « sur » devant le libellé donnait « constaté sur depuis le début » dès
 * que le portefeuille avait moins de douze mois révolus.
 *
 * @param {number|null} fenetre - Nombre de mois, null pour tout l'historique
 * @returns {string} Par exemple « sur 12 mois » ou « depuis le début »
 */
function surLaFenetre(fenetre) {
    return fenetre ? `sur ${fenetre} mois` : 'depuis le début';
}

/**
 * Rédige le repère du champ « apport mensuel »
 *
 * La fenêtre annoncée est celle réellement mesurée : un portefeuille de cinq
 * mois n'a pas douze mois à moyenner, et écrire « vos 12 derniers mois » lui
 * aurait fait dire le contraire de ce qu'il calcule.
 *
 * @returns {string} Repère à afficher, vide si rien ne peut être dit
 */
function repereApport() {
    if (!contexte.apportsConnus) {
        return 'vos versements se lisent dans le journal des mouvements :'
            + ' rechargez depuis l\'API';
    }

    const fenetre = contexte.moisObserves > 1
        ? `vos ${contexte.moisObserves} derniers mois`
        : 'votre dernier mois';

    return contexte.apportMoyen > 0
        ? `${fenetre} : ${formatCurrency(contexte.apportMoyen, 0)} / mois versés de votre poche`
        : `${fenetre} : rien versé de votre poche`;
}

/**
 * Affiche, sous chaque champ, ce que fait réellement le portefeuille
 * Une hypothèse ne se juge que comparée au constat.
 */
function afficherReperes() {
    const ecrire = (id, texte) => {
        const element = document.getElementById(id);
        if (element) element.textContent = texte;
    };

    // Trois cas, et non deux : ne rien avoir versé et ne pas savoir ce qui a été
    // versé se lisaient pareil, alors que le second n'autorise aucune conclusion.
    ecrire('repereApport', repereApport());

    ecrire('repereHorizon', contexte.horizonMoyen > 0
        ? `durée moyenne de vos projets : ${(contexte.horizonMoyen / 12).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} ans`
        : '');

    // Le net du constaté est rappelé ici parce que c'est lui, et non le brut,
    // que la section « Rendement annualisé » met en grand : sans le pont, les
    // deux blocs affichaient deux chiffres qui semblaient se contredire.
    const constateNet = contexte.rendementConstateNet > 0
        ? `, ${formatPercentage(contexte.rendementConstateNet)} net`
        : '';

    ecrire('repereRendement', contexte.rendementConstate > 0
        ? `constaté ${surLaFenetre(contexte.fenetreConstatee)} :`
          + ` ${formatPercentage(contexte.rendementConstate)} brut${constateNet}`
          + ` · annoncé par Bricks : ${formatPercentage(contexte.rendementMoyen)} brut`
        : (contexte.rendementMoyen > 0
            ? `annoncé par Bricks : ${formatPercentage(contexte.rendementMoyen)} brut`
            : ''));

    ecrire('repereImpaye', `constaté aujourd'hui : ${formatPercentage(contexte.tauxImpayeObserve)} du capital en difficulté`);
}

/**
 * Taux dont part la simulation
 *
 * Le constaté quand on l'a : partir du taux promis faisait dérouler une
 * projection que le portefeuille n'a jamais tenue, et l'écart se retrouvait
 * intégralement dans le résultat final.
 *
 * @returns {number} Rendement annuel brut, en pourcentage
 */
function tauxDeDepart() {
    return contexte.rendementConstate > 0 ? contexte.rendementConstate : contexte.rendementMoyen;
}

/**
 * Réaligne les hypothèses sur le portefeuille réel
 */
function repartirDuPortefeuille() {
    const appliquer = (id, valeur) => {
        const champ = document.getElementById(id);
        if (champ) champ.value = valeur;
    };

    appliquer('simRendement', tauxDeDepart().toFixed(1));
    appliquer('simImpaye', contexte.tauxImpayeObserve.toFixed(1));

    if (contexte.apportMoyen > 0) {
        appliquer('simApport', Math.round(contexte.apportMoyen));
    }

    if (contexte.horizonMoyen > 0) {
        appliquer('simHorizon', Math.max(1, Math.round(contexte.horizonMoyen / 12)));
    }

    rejouer();
}

/**
 * Injecte le portefeuille courant dans le simulateur et le relance
 * Appelé à chaque recalcul des statistiques.
 * @param {Object} results - Résultats des calculs
 */
export function updateForecastContext(results) {
    // Le taux constaté sur douze mois prime sur celui qu'annonce Bricks : les
    // hypothèses du simulateur doivent partir de ce que le portefeuille fait,
    // non de ce qu'il promet. Le second reste affiché en repère.
    const douzeMois = (results.rendements?.fenetres || []).find(f => f.fenetre === 12)
        || (results.rendements?.fenetres || []).find(f => f.fenetre === null);

    contexte = {
        capitalInitial: results.totalInvestment || 0,
        rendementMoyen: rendementMoyenPondere(results.properties),
        rendementConstate: douzeMois?.tauxBrut || 0,
        rendementConstateNet: douzeMois?.taux || 0,
        fenetreConstatee: douzeMois?.fenetre ?? null,
        // Part du capital détenu actuellement en difficulté : une hypothèse
        // d'impayés ancrée sur les faits plutôt que sur un chiffre rond
        tauxImpayeObserve: results.risque?.enDifficulte?.partCapital || 0,
        ...rythmeDeVersement(results.origineFonds),
        horizonMoyen: horizonMoyenPondere(results.properties)
    };

    afficherReperes();

    // Ne pas écraser une hypothèse que l'utilisateur a lui-même ajustée
    const preremplir = (id, valeur) => {
        const champ = document.getElementById(id);
        if (champ && champ.dataset.touche !== 'true') {
            champ.value = valeur;
        }
    };

    preremplir('simRendement', tauxDeDepart().toFixed(1));
    preremplir('simImpaye', contexte.tauxImpayeObserve.toFixed(1));

    if (contexte.apportMoyen > 0) {
        preremplir('simApport', Math.round(contexte.apportMoyen));
    }

    rejouer();
}

/**
 * Configure le simulateur
 */
export function setupForecastHandler() {
    const zone = document.getElementById('simResultats');

    if (!zone) {
        return;
    }

    CHAMPS.forEach(id => {
        const champ = document.getElementById(id);

        if (!champ) {
            return;
        }

        const evenement = champ.type === 'checkbox' ? 'change' : 'input';

        champ.addEventListener(evenement, () => {
            champ.dataset.touche = 'true';
            rejouer();
        });
    });

    const reset = document.getElementById('simReset');
    if (reset) {
        reset.addEventListener('click', () => {
            CHAMPS.forEach(id => {
                const champ = document.getElementById(id);
                if (champ) delete champ.dataset.touche;
            });
            repartirDuPortefeuille();
        });
    }

    logger.debug(LOG_CATEGORIES.EVENT, 'Forecast handler configured');
}
