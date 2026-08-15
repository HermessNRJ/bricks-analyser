/**
 * Ce que le capital rapporte réellement, ramené à l'année
 *
 * Le taux affiché par Bricks est un taux promis, projet par projet. Celui-ci
 * est constaté : ce qui est tombé sur le compte, divisé par ce qui était placé
 * pour le gagner. L'écart entre les deux est la somme des échéances impayées,
 * des mois où un projet s'est tu, et des semaines pendant lesquelles l'argent
 * attendait dans une propriété encore en financement.
 *
 * Le lire sur plusieurs fenêtres montre le sens de la pente. Un mois seul est
 * bruyant — un remboursement de capital tombé au bon moment, un parrainage —
 * là où douze mois lissent tout et masquent une dégradation récente.
 *
 * ## Le dénominateur
 *
 * Diviser par l'investissement d'aujourd'hui fausserait toutes les fenêtres
 * sauf la plus courte : un portefeuille qui a doublé en un an rapporterait
 * moitié moins qu'en vérité, ses revenus anciens étant rapportés à un capital
 * qui n'existait pas encore. On reconstruit donc le capital réellement placé
 * mois par mois.
 *
 * `investmentEvolution` ne suffit pas : un projet remboursé vaut zéro euro
 * aujourd'hui et pèse donc zéro sur toute la série, y compris sur les mois où
 * il était détenu et versait. Le capital rendu depuis, lu dans le journal des
 * mouvements, est réinjecté pour combler ce trou — ce qui a été remboursé
 * après un mois donné était forcément placé pendant ce mois.
 *
 * ## Le numérateur
 *
 * L'état de compte range les remboursements de capital AVEC les coupons : en
 * juin 2026, Villa Gypsea y figure pour 34,67 € quand son coupon mensuel vaut
 * 4,33 €. Les prendre pour du revenu ferait bondir le rendement d'un projet qui
 * vient de rendre la mise.
 *
 * Ils ne sont pas défalqués depuis le journal des mouvements. Essayé, et faux :
 * le journal compte des remboursements que la ligne de coupons ne contient pas,
 * au point de la vider entièrement — le rendement tombait à 0,0 % sur un
 * portefeuille qui verse tous les mois.
 *
 * Le prélèvement, lui, se lit. Bricks retient à la source sur les intérêts
 * français, un remboursement de capital n'étant pas imposable : le prélèvement
 * du mois divisé par le barème de ce mois-là rend ces intérêts-là.
 *
 * Tout ce qui échappe au prélèvement n'est pas du capital pour autant. Les
 * projets étrangers versent sans retenue à la source — l'impôt sera réclamé
 * plus tard, sur la déclaration — et passeraient sinon pour une mise remboursée.
 * Ils sont identifiables par le pays de la propriété et rendus au numérateur.
 *
 * Reste un écart résiduel, de l'ordre de quelques points sur un portefeuille
 * réel, qu'on impute au capital faute de mieux. Il est affiché au survol de
 * chaque fenêtre, pour que personne n'ait à le croire sur parole.
 */

import { logger, LOG_CATEGORIES } from '../utils/logger.js';
import { generateMonthRange, getCurrentMonthYYYYMM } from '../utils/dateHelpers.js';
import { tauxImpositionPour } from '../core/config.js';
import { moisEncoreOuvert } from './revenueHistory.js';

/**
 * Fenêtres proposées, en nombre de mois révolus
 * `null` désigne tout l'historique disponible.
 */
export const FENETRES = [1, 3, 6, 12, null];

/**
 * Reconstruit le capital placé mois par mois
 *
 * @param {Object} investmentEvolution - Investissement cumulé { 'YYYY-MM': € }
 * @param {Object} [capitalParMois] - Capital remboursé par mois, en euros
 * @param {Array<string>} mois - Mois à couvrir, triés
 * @returns {Object} Série { 'YYYY-MM': capital placé ce mois-là }
 */
export function capitalDeploye(investmentEvolution, capitalParMois, mois) {
    const serie = {};

    if (!Array.isArray(mois) || mois.length === 0) {
        return serie;
    }

    const investissements = investmentEvolution || {};
    const remboursements = capitalParMois || {};

    // Le capital encore à rendre après un mois donné était placé pendant ce
    // mois : on parcourt à rebours en défalquant au fur et à mesure.
    let resteARendre = Object.keys(remboursements)
        .filter(m => m > mois[0])
        .reduce((somme, m) => somme + (remboursements[m] || 0), 0);

    // L'investissement cumulé n'est renseigné que les mois d'achat : entre
    // deux, le capital placé ne bouge pas.
    let cumul = Object.keys(investissements)
        .filter(m => m <= mois[0])
        .reduce((max, m) => Math.max(max, investissements[m] || 0), 0);

    // Le capital à rendre ne peut pas être réinjecté tel quel : il comprend des
    // projets achetés bien après le mois qu'on regarde. Ajouter 3 520 € à
    // décembre 2023, où le portefeuille pesait 750 €, en faisait un capital de
    // 4 271 € pour 250 € réellement déposés — et le rendement s'effondrait.
    //
    // Faute de savoir dater l'achat de chaque projet remboursé, on le réinjecte
    // au prorata de la taille qu'avait le portefeuille ce mois-là : un mois où
    // l'on détenait 7 % de ce qu'on détient aujourd'hui reçoit 7 % du capital
    // restant à rendre. C'est une approximation, mais elle a le bon ordre de
    // grandeur et retombe exactement sur l'investissement au dernier mois.
    const invFinal = Object.values(investissements)
        .reduce((max, valeur) => Math.max(max, valeur || 0), 0);

    mois.forEach((m, index) => {
        if (Number.isFinite(investissements[m])) {
            cumul = investissements[m];
        }

        if (index > 0) {
            resteARendre -= remboursements[m] || 0;
        }

        const prorata = invFinal > 0 ? Math.min(1, cumul / invFinal) : 0;

        serie[m] = Math.round(Math.max(0, cumul + Math.max(0, resteARendre) * prorata) * 100) / 100;
    });

    return serie;
}

/**
 * Calcule le rendement annualisé sur plusieurs fenêtres
 *
 * Le mois courant est écarté : il n'est pas terminé, et l'y inclure ferait
 * plonger toutes les fenêtres au début de chaque mois.
 *
 * @param {Object} options
 * @param {Object} options.mensuel - Revenus perçus par mois
 * @param {string} [options.moisPartiel] - Mois entamé, à écarter
 * @param {Object} options.investmentEvolution - Investissement cumulé
 * @param {Object} [options.capitalParMois] - Capital remboursé par mois
 * @param {number} [options.tauxPromis] - Rendement brut moyen annoncé par Bricks
 * @param {Object} [options.etrangerParMois] - Coupons versés sans retenue à la source
 * @returns {Object|null} { fenetres, journalLu, tauxPromis } ou null faute de mois
 */
export function calculerRendements({
    mensuel, moisPartiel, investmentEvolution, capitalParMois, tauxPromis, etrangerParMois
} = {}) {
    // Le mois courant compte dès qu'il a reçu son règlement : l'écarter au seul
    // motif que le calendrier ne l'a pas refermé privait les fenêtres de leur
    // donnée la plus fraîche pendant les trois semaines suivant le 8.
    const revolus = Object.keys(mensuel || {})
        .sort()
        .filter(m => m !== moisPartiel && !moisEncoreOuvert(mensuel, m));

    if (revolus.length === 0) {
        return null;
    }

    const premier = revolus[0];
    const dernier = revolus[revolus.length - 1];
    const couverture = generateMonthRange(premier, dernier);
    const capital = capitalDeploye(investmentEvolution, capitalParMois, couverture);

    const fenetres = FENETRES
        .filter(nombre => nombre === null || nombre <= revolus.length)
        .map(nombre => mesurer(nombre, revolus, mensuel, capital, etrangerParMois))
        .filter(Boolean);

    if (fenetres.length === 0) {
        return null;
    }

    logger.info(LOG_CATEGORIES.CALC_STATS, 'Annualised yield computed', {
        windows: fenetres.length,
        lastCompleteMonth: dernier,
        capitalReconstructed: Boolean(capitalParMois)
    });

    return {
        fenetres,
        dernierMois: dernier,
        tauxPromis: Number.isFinite(tauxPromis) && tauxPromis > 0 ? tauxPromis : null,
        // Le journal ne sert plus qu'au dénominateur. Sans lui, le capital des
        // mois anciens ignore les projets remboursés depuis, et les fenêtres
        // longues s'en trouvent flattées : l'écran doit pouvoir le dire.
        journalLu: Boolean(capitalParMois && Object.keys(capitalParMois).length > 0)
    };
}

/**
 * Capital rendu tel que l'état de compte le trahit, mois par mois
 *
 * Deux sources prétendent dire ce qui a été remboursé : le journal des
 * mouvements, qui le nomme, et l'état de compte, qui le laisse deviner par le
 * prélèvement manquant. Elles devraient s'accorder. Quand elles divergent, l'une
 * des deux est fausse — et comme la colonne « Capital rendu » du tableau annuel
 * lit le journal, la comparaison mérite d'être posée noir sur blanc.
 *
 * @param {Object} mensuel - Revenus par mois, issus de l'état de compte
 * @returns {Object} Capital implicite par mois, en euros
 */
export function capitalImpliciteParMois(mensuel, etrangerParMois) {
    const parMois = {};

    Object.keys(mensuel || {}).forEach(m => {
        const coupons = mensuel[m]?.coupons || 0;
        const interets = interetsDuMois(m, coupons, mensuel[m]?.impot || 0, etrangerParMois?.[m] || 0);

        parMois[m] = Math.round((coupons - interets) * 100) / 100;
    });

    return parMois;
}

/**
 * Retrouve les intérêts bruts d'un mois à partir du prélèvement retenu
 *
 * Bricks ne prélève que sur les intérêts. Le prélèvement divisé par le barème
 * du mois rend donc la part imposable de la ligne de coupons ; le reste est du
 * capital rendu.
 *
 * Deux garde-fous. Le résultat ne peut pas dépasser la ligne de coupons : un
 * barème mal aligné gonflerait sinon les intérêts au-delà de ce qui a été versé.
 * Et un mois sans le moindre prélèvement rend ses coupons entiers — n'ayant
 * aucune preuve qu'il s'y cache du capital, les effacer serait pire que les
 * garder.
 *
 * @param {string} mois - Mois au format YYYY-MM
 * @param {number} coupons - Ligne de coupons du mois, capital compris
 * @param {number} impot - Prélèvement retenu, en valeur absolue
 * @returns {number} Intérêts bruts du mois
 * @private
 */
function interetsDuMois(mois, coupons, impot, etranger = 0) {
    const taux = tauxImpositionPour(mois);

    if (impot <= 0 || taux <= 0) {
        return coupons;
    }

    // Les coupons étrangers n'ont subi aucune retenue à la source — l'impôt sera
    // réclamé plus tard, sur la déclaration. Ils échappent donc au prélèvement
    // sans être pour autant du capital : les rendre au numérateur, faute de quoi
    // un projet portugais passerait pour une mise remboursée.
    return Math.min(impot / taux + etranger, coupons);
}

/**
 * Mesure une fenêtre
 * @param {number|null} nombre - Nombre de mois, null pour tout l'historique
 * @param {Array<string>} revolus - Mois révolus disponibles, triés
 * @param {Object} mensuel - Revenus perçus par mois
 * @param {Object} capital - Capital placé par mois
 * @param {Object} [etranger] - Coupons sans retenue à la source, par mois
 * @returns {Object|null} Mesure de la fenêtre, null si le capital y est nul
 * @private
 */
function mesurer(nombre, revolus, mensuel, capital, etranger) {
    const mois = nombre === null ? revolus : revolus.slice(-nombre);

    if (mois.length === 0) {
        return null;
    }

    let net = 0;
    let brut = 0;
    let horsCoupons = 0;
    let capitalRendu = 0;
    let capitalCumule = 0;

    mois.forEach(m => {
        const entree = mensuel[m] || {};
        const coupons = entree.coupons || 0;
        const impot = entree.impot || 0;
        const extras = (entree.parrainage || 0) + (entree.boost || 0);

        const interetsBruts = interetsDuMois(m, coupons, impot, etranger?.[m] || 0);

        net += interetsBruts - impot + extras;
        brut += interetsBruts + extras;
        horsCoupons += extras;
        capitalRendu += coupons - interetsBruts;
        capitalCumule += capital[m] || 0;
    });

    const capitalMoyen = capitalCumule / mois.length;

    // Un capital moyen nul rendrait un taux infini : la fenêtre ne dit rien.
    if (capitalMoyen <= 0) {
        return null;
    }

    const annualiser = valeur => Math.round((valeur / capitalCumule) * 12 * 1000) / 10;

    return {
        fenetre: nombre,
        libelle: nombre === null ? 'Depuis le début' : `${nombre} mois`,
        mois,
        premierMois: mois[0],
        dernierMois: mois[mois.length - 1],
        net: Math.round(net * 100) / 100,
        brut: Math.round(brut * 100) / 100,
        horsCoupons: Math.round(horsCoupons * 100) / 100,
        capitalRendu: Math.round(capitalRendu * 100) / 100,
        capitalMoyen: Math.round(capitalMoyen * 100) / 100,
        taux: annualiser(net),
        tauxBrut: annualiser(brut)
    };
}
