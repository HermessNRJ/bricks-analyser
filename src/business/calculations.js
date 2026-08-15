/**
 * Calculs financiers et statistiques d'investissement
 */

import { CONFIG, tauxImpositionPour } from '../core/config.js';
import { logger, LOG_CATEGORIES } from '../utils/logger.js';
import { addMonthsToYYYYMM, generateMonthRange, getCurrentMonthYYYYMM, calculateRefundDate, isValidYYYYMM } from '../utils/dateHelpers.js';
import { detectCountryFromProject } from '../utils/countryHelpers.js';
import { repartitionRisque, niveauRisque, arrieresInvestisseur } from './riskAnalysis.js';
import { serieMensuelle, moisEncoreOuvert } from './revenueHistory.js';
import { annoterVersements } from './versements.js';
import { serieOrigineFonds } from './apports.js';
import { calculerRendements, capitalImpliciteParMois } from './rendement.js';
import { rendementMoyenPondere } from './forecast.js';
import { couponsEtrangersParMois, impotDifferre } from './fiscalite.js';

/**
 * Calcule les revenus mensuels (brut, net, taxe) pour un projet
 *
 * Hors de France, Bricks ne retient rien à la source : le coupon arrive brut et
 * l'impôt est réclamé plus tard, sur la déclaration. Annoncer un net amputé du
 * prélèvement forfaitaire y était doublement faux — le montant ne correspondait
 * ni à ce qui tombe sur le compte, ni à ce que la fiche affiche par ailleurs
 * pour les versements réellement reçus.
 *
 * @param {number} investment - Investissement total
 * @param {number} yearlyReturn - Rendement annuel en %
 * @param {string} [pays] - Pays du projet ; hors de France, aucune retenue
 * @returns {Object} { gross, net, tax }
 */
export function calculateMonthlyRevenue(investment, yearlyReturn, pays = 'France') {
    const grossYearly = (investment * yearlyReturn) / 100;
    const grossMonthly = grossYearly / 12;
    const taux = pays === 'France' ? CONFIG.TAX_RATE : 0;

    return {
        gross: grossMonthly,
        net: grossMonthly * (1 - taux),
        tax: grossMonthly * taux
    };
}

/**
 * Détermine le premier mois d'apparition d'un projet
 * Les mois non datés ('N/A' pour les projets en financement) ne sont retenus qu'à
 * défaut de mieux, et un vrai mois l'emporte toujours sur eux.
 * @param {string|undefined} knownMonth - Mois déjà retenu pour ce projet
 * @param {string} candidateMonth - Mois de l'entrée en cours de traitement
 * @returns {string} Mois à conserver
 */
function resolveFirstSeenMonth(knownMonth, candidateMonth) {
    if (!isValidYYYYMM(candidateMonth)) {
        return knownMonth ?? candidateMonth;
    }

    if (!isValidYYYYMM(knownMonth)) {
        return candidateMonth;
    }

    return candidateMonth < knownMonth ? candidateMonth : knownMonth;
}

/**
 * Fonction principale : calcule toutes les statistiques d'investissement
 * @param {Array} data - Données mensuelles des projets
 * @param {Array} warnings - Liste des warnings (optionnel)
 * @param {Object} [statuts] - Suivis officiels de projet, indexés par identifiant
 * @param {Object} [revenus] - Historique des revenus réellement versés (optionnel)
 * @param {Object} [capital] - Remboursements de capital, lus dans le journal
 * @param {Object} [apports] - Versements personnels, lus dans le journal
 * @returns {Object} Statistiques complètes
 */
export function calculateInvestmentStats(data, warnings = [], statuts = {}, revenus = null, capital = null, apports = null) {
    logger.info(LOG_CATEGORIES.CALC_STATS, 'Starting investment stats calculation', {
        monthEntries: data.length
    });

    let totalBricks = 0;
    let totalInvestment = 0;
    let monthlyRevenue = 0; // Revenus nets mensuels espérés
    let properties = [];
    let investmentEvolution = {};
    let uniqueProjects = new Map();
    let refundedProjectsCount = 0;
    let fundingOrUpcomingProjectsCount = 0;
    let projectNetRevenueEntries = [];
    let projectGrossRevenueEntries = [];

    // ========================================================================
    // PREMIÈRE PASSE : Collecter toutes les propriétés uniques
    // ========================================================================
    data.forEach((monthData, monthIndex) => {
        const monthKey = monthData.yearMonthDate;

        if (!monthData.projects) {
            logger.warn(LOG_CATEGORIES.CALC_STATS, `No projects for month: ${monthKey}`);
            return;
        }

        monthData.projects.forEach((project, projectIndex) => {
            try {
                const ownedBricks = project.ownedBricks || project.investorBricks?.owned || 0;

                if (ownedBricks > 0) {
                    // Déterminer le prix de la brique
                    let brickPrice = CONFIG.DEFAULT_BRICK_PRICE;
                    if (typeof project.brickPrice === 'number') {
                        brickPrice = project.brickPrice / 100;
                    }

                    // Détecter le pays depuis le nom du projet (emoji de drapeau)
                    const detectedCountry = detectCountryFromProject(project);

                    // Un projet apparaît sur plusieurs mois : on garde les données les
                    // plus récentes mais le PREMIER mois où il a été vu, car c'est lui qui
                    // datera l'investissement dans la courbe d'évolution.
                    const knownProject = uniqueProjects.get(project.id);
                    const firstSeenMonth = resolveFirstSeenMonth(knownProject?.firstSeenMonth, monthKey);

                    // Stocker le projet unique (Map = pas de doublons)
                    uniqueProjects.set(project.id, {
                        id: project.id,
                        name: project.name?.fr || project.name?.en || project.name || 'Propriété sans nom',
                        address: project.address?.fr || project.address?.en || project.address || 'Adresse non disponible',
                        country: detectedCountry,
                        ownedBricks: ownedBricks,
                        brickPrice: brickPrice,
                        yearlyReturn: project.yearlyTotalRentabilityPercentage || 0,
                        thumbnailUrl: project.thumbnailUrl || '',
                        firstSeenMonth: firstSeenMonth,
                        funding: project.funding,
                        projectStatus: project.projectStatus || 'financed',
                        investmentHorizonInMonths: project.investmentHorizonInMonths || 0
                    });
                }
            } catch (projectErr) {
                logger.error(LOG_CATEGORIES.CALC_STATS, `Error processing project ${projectIndex}`, projectErr);
            }
        });
    });

    logger.debug(LOG_CATEGORIES.CALC_STATS, 'Unique projects collected', {
        count: uniqueProjects.size,
        projectIds: Array.from(uniqueProjects.keys())
    });

    // Associer les warnings aux projets par propertyId
    const warningsByPropertyId = new Map();
    if (Array.isArray(warnings) && warnings.length > 0) {
        warnings.forEach(warning => {
            const propertyId = warning.propertyId;
            if (!warningsByPropertyId.has(propertyId)) {
                warningsByPropertyId.set(propertyId, []);
            }
            warningsByPropertyId.get(propertyId).push(warning);
        });

        logger.debug(LOG_CATEGORIES.CALC_STATS, 'Warnings grouped by property', {
            warningsCount: warnings.length,
            propertiesWithWarnings: warningsByPropertyId.size,
            warningPropertyIds: Array.from(warningsByPropertyId.keys())
        });
    } else {
        logger.warn(LOG_CATEGORIES.CALC_STATS, 'No warnings received or invalid warnings array', {
            warningsReceived: warnings
        });
    }

    // ========================================================================
    // DEUXIÈME PASSE : Calculer les statistiques par projet
    // ========================================================================
    uniqueProjects.forEach((project) => {
        const projectInvestment = project.ownedBricks * project.brickPrice;

        logger.debug(LOG_CATEGORIES.CALC_STATS, 'Processing project', {
            id: project.id,
            name: project.name,
            ownedBricks: project.ownedBricks,
            brickPrice: project.brickPrice,
            investment: projectInvestment
        });

        totalInvestment += projectInvestment;

        // Vérifier si le projet est remboursé
        const isRefunded = (project.ownedBricks > 0 && projectInvestment === 0);
        if (isRefunded) {
            refundedProjectsCount++;
        }

        // Compter les projets en financement/à venir
        if (project.projectStatus === 'ongoing' || project.projectStatus === 'upcoming') {
            fundingOrUpcomingProjectsCount++;
        }

        // Calculer les revenus
        const revenue = calculateMonthlyRevenue(projectInvestment, project.yearlyReturn, project.country);
        monthlyRevenue += revenue.net;

        // Calculer la date de remboursement estimée
        const estimatedRefundDate = calculateRefundDate(
            project.funding?.revenueStartDate,
            project.investmentHorizonInMonths
        );

        // Récupérer les warnings pour cette propriété
        const propertyWarnings = warningsByPropertyId.get(project.id) || [];

        // Log pour déboguer les warnings
        if (propertyWarnings.length > 0) {
            logger.debug(LOG_CATEGORIES.CALC_STATS, 'Warnings found for property', {
                projectId: project.id,
                projectName: project.name,
                warningsCount: propertyWarnings.length
            });
        }

        // Ajouter à la liste des propriétés
        properties.push({
            id: project.id,
            name: project.name,
            isRefunded: isRefunded,
            address: project.address,
            country: project.country,
            ownedBricks: project.ownedBricks,
            investment: projectInvestment,
            yearlyReturn: project.yearlyReturn,
            monthlyRevenue: revenue.net,
            thumbnailUrl: project.thumbnailUrl,
            projectStatus: project.projectStatus,
            revenueStartDate: project.funding?.revenueStartDate || null,
            refundDate: estimatedRefundDate,
            investmentHorizonInMonths: project.investmentHorizonInMonths,
            warnings: propertyWarnings,
            warningsCount: propertyWarnings.length
        });

        // Collecter les entrées de revenus pour l'évolution temporelle
        const revenueStartDate = project.funding?.revenueStartDate;
        if (revenueStartDate && typeof revenueStartDate === 'string' && revenueStartDate.match(/^\d{4}-\d{2}$/)) {
            if (revenue.net > 0) {
                projectNetRevenueEntries.push({
                    startDate: revenueStartDate,
                    revenue: revenue.net
                });
            }
            if (revenue.gross > 0) {
                projectGrossRevenueEntries.push({
                    startDate: revenueStartDate,
                    revenue: revenue.gross
                });
            }
        }
    });

    logger.debug(LOG_CATEGORIES.CALC_STATS, 'Revenue entries collected', {
        netEntries: projectNetRevenueEntries.length,
        grossEntries: projectGrossRevenueEntries.length
    });

    // Le niveau de risque est arrêté ici, une fois pour toutes : tuiles, filtres
    // et fiches lisent la même valeur. Le recalculer ailleurs les avait déjà fait
    // diverger — les tuiles comptaient 38 défauts quand le registre en filtrait 4.
    properties.forEach(p => {
        p.suivi = statuts?.[p.id] || null;
        p.niveauRisque = niveauRisque(p, p.suivi);
        // Ce que le projet vous doit, à vous : le suivi officiel ne connaît que
        // la dette envers l'ensemble des obligataires.
        p.arrieres = arrieresInvestisseur(p, p.suivi);
    });

    // Ce que chaque projet a réellement versé le mois dernier, d'après l'état
    // de compte. Sans relevé, aucune fiche n'est annotée : mieux vaut ne rien
    // dire que de peindre en rouge un portefeuille dont on ignore les recettes.
    const versements = annoterVersements(properties, revenus?.versements);

    // Recalculer totalBricks en excluant les projets remboursés
    totalBricks = 0;
    for (const prop of properties) {
        if (!prop.isRefunded) {
            totalBricks += prop.ownedBricks;
        }
    }

    const activePropertiesCount = properties.filter(p => !p.isRefunded).length;

    // Bricks amortit : le prix d'une brique baisse à mesure que le principal
    // revient, jusqu'à zéro quand le projet est soldé. `totalInvestment` est
    // donc le capital ENCORE engagé, pas la somme jamais investie — et l'écart
    // avec le nominal dit combien a déjà été rendu sur les projets détenus.
    const nominalBriques = properties
        .filter(p => !p.isRefunded)
        .reduce((somme, p) => somme + p.ownedBricks * CONFIG.DEFAULT_BRICK_PRICE, 0);

    logger.info(LOG_CATEGORIES.CALC_STATS, 'Project stats calculated', {
        totalBricks,
        totalInvestment,
        monthlyRevenue,
        totalProperties: properties.length,
        activeProperties: activePropertiesCount,
        refundedProjects: refundedProjectsCount
    });

    // ========================================================================
    // CALCUL DE L'ÉVOLUTION DE L'INVESTISSEMENT
    // ========================================================================
    const monthlyInvestments = {};
    const currentMonthKey = getCurrentMonthYYYYMM();

    uniqueProjects.forEach((project) => {
        // Les projets en financement/à venir arrivent avec yearMonthDate = 'N/A' :
        // aucune date ne les situe sur l'axe temporel, mais les briques sont déjà
        // payées. On les rattache au mois courant pour que le dernier point de la
        // courbe corresponde bien à totalInvestment.
        const monthKey = isValidYYYYMM(project.firstSeenMonth)
            ? project.firstSeenMonth
            : currentMonthKey;

        if (monthKey === currentMonthKey && !isValidYYYYMM(project.firstSeenMonth)) {
            logger.debug(LOG_CATEGORIES.CALC_STATS, 'Undated project placed on current month', {
                id: project.id,
                status: project.projectStatus
            });
        }

        const projectInvestment = project.ownedBricks * project.brickPrice;

        if (!monthlyInvestments[monthKey]) {
            monthlyInvestments[monthKey] = 0;
        }
        monthlyInvestments[monthKey] += projectInvestment;
    });

    // Créer l'évolution cumulative
    const sortedMonths = Object.keys(monthlyInvestments).sort();
    let cumulativeInvestment = 0;
    sortedMonths.forEach(month => {
        cumulativeInvestment += monthlyInvestments[month];
        investmentEvolution[month] = cumulativeInvestment;
    });

    // ========================================================================
    // CALCUL DE L'ÉVOLUTION DES REVENUS ET DES TAXES
    // ========================================================================
    const {
        netRevenueEvolutionData,
        grossRevenueEvolutionData,
        taxAmountEvolutionData,
        totalNetRevenueSinceBeginning,
        totalTaxesSinceBeginning
    } = calculateRevenueEvolution(
        projectNetRevenueEntries,
        projectGrossRevenueEntries,
        investmentEvolution
    );

    // ========================================================================
    // REVENUS RÉELLEMENT PERÇUS
    // ========================================================================
    // Les séries ci-dessus restent des ESPÉRANCES : elles supposent que chaque
    // projet détenu verse son coupon au taux affiché. Quand Bricks nous donne
    // son état de compte, c'est lui qui fait foi pour le passé — l'estimation
    // ne sert plus qu'aux mois à venir, où rien n'a encore été versé.
    const historiqueDisponible = Boolean(revenus?.mensuel && Object.keys(revenus.mensuel).length > 0);

    // Les projets étrangers versent sans retenue à la source : ni le rendement
    // ni la note fiscale ne peuvent les traiter comme les autres.
    const etrangerParMois = historiqueDisponible
        ? couponsEtrangersParMois(revenus.versements, properties)
        : {};

    const impotAVenir = historiqueDisponible
        ? impotDifferre(revenus.mensuel, etrangerParMois)
        : null;

    // Le « net cumulé perçu » de l'état de compte contient le capital amorti
    // qui voyage dans les coupons : c'est votre mise qui revient, pas un gain.
    // Le prélèvement, lui, n'a porté que sur les intérêts : il n'a rien à
    // corriger.
    const capitalDansCoupons = historiqueDisponible
        ? Object.values(capitalImpliciteParMois(revenus.mensuel, etrangerParMois))
            .reduce((somme, montant) => somme + montant, 0)
        : 0;

    const revenusReels = historiqueDisponible
        ? {
            mensuel: revenus.mensuel,
            parAnnee: fusionnerJournal(revenus.parAnnee, capital?.parAnnee, apports?.parAnnee, impotAVenir?.parAnnee),
            impotAVenir,
            capital: capital || null,
            apports: apports || null,
            premierMois: revenus.premierMois,
            dernierMois: revenus.dernierMois,
            total: revenus.total,
            capitalDansCoupons: Math.round(capitalDansCoupons * 100) / 100,
            net: serieMensuelle(revenus, 'net'),
            brut: serieMensuelle(revenus, 'brut'),
            impot: serieMensuelle(revenus, 'impot'),
            // Un mois qui n'a pas encore reçu son règlement n'est pas comparable
            // aux précédents et doit être signalé comme tel à l'écran. Passé le
            // 8, il l'est : Bricks a versé, et le mois cesse d'être une demi-mesure.
            moisPartiel: moisEncoreOuvert(revenus.mensuel, revenus.dernierMois)
                ? revenus.dernierMois
                : null,
            ...serieAttendue(revenus, netRevenueEvolutionData)
        }
        : null;

    if (historiqueDisponible) {
        logger.info(LOG_CATEGORIES.CALC_STATS, 'Using Bricks statement for realised revenue', {
            months: Object.keys(revenus.mensuel).length,
            netEstime: totalNetRevenueSinceBeginning,
            netReel: revenus.total.net
        });
    }

    // ========================================================================
    // RENDEMENT CONSTATÉ ET ORIGINE DES FONDS
    // ========================================================================
    // Les deux demandent l'état de compte : sans lui on ne connaît que des
    // revenus espérés, dont le rendement ne serait que le taux affiché
    // recopié, et l'origine des fonds serait muette.
    const rendements = historiqueDisponible
        ? calculerRendements({
            mensuel: revenus.mensuel,
            moisPartiel: revenusReels.moisPartiel,
            investmentEvolution,
            capitalParMois: capital?.parMois,
            // Le taux annoncé par Bricks sert de repère : l'écart avec le taux
            // constaté est ce que coûtent les échéances non versées.
            tauxPromis: rendementMoyenPondere(properties),
            etrangerParMois
        })
        : null;

    const origineFonds = historiqueDisponible
        ? serieOrigineFonds(apports, revenus.mensuel)
        : null;

    if (historiqueDisponible && capital?.parMois) {
        confronterCapital(revenus.mensuel, capital.parMois, etrangerParMois);
    }

    // ========================================================================
    // RETOUR DES RÉSULTATS
    // ========================================================================
    // Les pourcentages se rapportent aux propriétés encore détenues : un projet
    // remboursé ne fait plus partie du portefeuille courant.
    const detenues = properties.filter(p => !p.isRefunded).length;
    const partDetenues = properties.length > 0 ? (detenues / properties.length) * 100 : 0;
    const partRemboursees = properties.length > 0 ? (refundedProjectsCount / properties.length) * 100 : 0;
    const partFinancement = detenues > 0 ? (fundingOrUpcomingProjectsCount / detenues) * 100 : 0;

    return {
        totalBricks,
        totalInvestment,
        nominalBriques: Math.round(nominalBriques * 100) / 100,
        monthlyRevenue,
        properties,
        detenuesCount: detenues,
        partDetenues,
        partRemboursees,
        partFinancement,
        risque: repartitionRisque(properties, statuts),
        versements,
        rendements,
        origineFonds,
        apports: apports || null,
        investmentEvolution,
        netRevenueEvolutionData,
        grossRevenueEvolutionData,
        taxAmountEvolutionData,
        revenusReels,
        // « Perçu » et « payé » se lisent sur l'état de compte quand on l'a ;
        // l'estimation ne prend le relais que faute de mieux.
        totalNetRevenueSinceBeginning: historiqueDisponible
            ? Math.round((revenus.total.net - capitalDansCoupons) * 100) / 100
            : totalNetRevenueSinceBeginning,
        totalTaxesSinceBeginning: historiqueDisponible
            ? revenus.total.impot
            : totalTaxesSinceBeginning,
        totalNetRevenueEstime: totalNetRevenueSinceBeginning,
        refundedProjectsCount,
        activePropertiesCount,
        fundingOrUpcomingProjectsCount
    };
}

/**
 * Confronte les deux sources qui prétendent dire le capital remboursé
 *
 * Le journal des mouvements le nomme ligne à ligne ; l'état de compte le laisse
 * deviner par le prélèvement qui manque sur la ligne de coupons. Les deux
 * devraient tomber sur le même montant. Ils n'y tombent pas toujours : sur un
 * portefeuille réel, le journal en comptait assez pour vider entièrement les
 * coupons, ce qui ramenait le rendement à zéro.
 *
 * Le rendement se calcule donc sur l'état de compte seul. Ce contrôle reste là
 * pour dire l'ampleur de l'écart, parce que la colonne « Capital rendu » du
 * tableau annuel, elle, lit toujours le journal.
 *
 * @param {Object} mensuel - Revenus par mois, issus de l'état de compte
 * @param {Object} capitalParMois - Capital remboursé, issu du journal
 */
function confronterCapital(mensuel, capitalParMois, etrangerParMois) {
    const implicite = capitalImpliciteParMois(mensuel, etrangerParMois);
    const annees = {};

    const cumuler = (source, champ) => {
        Object.keys(source).forEach(m => {
            const annee = m.slice(0, 4);
            const ligne = annees[annee] ||= { releve: 0, journal: 0 };
            ligne[champ] += source[m] || 0;
        });
    };

    cumuler(implicite, 'releve');
    cumuler(capitalParMois, 'journal');

    let releve = 0;
    let journal = 0;

    Object.values(annees).forEach(ligne => {
        releve += ligne.releve;
        journal += ligne.journal;
        ligne.releve = Math.round(ligne.releve * 100) / 100;
        ligne.journal = Math.round(ligne.journal * 100) / 100;
        ligne.ecart = Math.round((ligne.journal - ligne.releve) * 100) / 100;
    });

    // Quelques euros séparent normalement les deux : un remboursement du 2 peut
    // être rangé sur le mois précédent. Au-delà du double, c'est structurel.
    const suspect = releve > 0 && journal > releve * 2;

    const detail = {
        impliedByStatement: Math.round(releve * 100) / 100,
        reportedByJournal: Math.round(journal * 100) / 100,
        byYear: annees
    };

    if (suspect) {
        logger.warn(LOG_CATEGORIES.CALC_STATS,
            'Wallet journal reports far more capital than the statement implies', detail);
    } else {
        logger.info(LOG_CATEGORIES.CALC_STATS, 'Capital repayments cross-checked', detail);
    }
}

/**
 * Ajoute au tableau annuel ce que seul le journal des mouvements sait
 *
 * Le capital rendu et les versements personnels viennent d'une autre source que
 * les revenus — le journal, non l'état de compte — et peuvent donc manquer. Une
 * année sans mouvement connu vaut zéro, ce qui se lit mieux qu'une case vide.
 *
 * Une année où vous avez déposé sans qu'aucun revenu ne tombe n'existerait pas
 * dans la ventilation des revenus : elle est ajoutée, faute de quoi le premier
 * versement d'un portefeuille ouvert en décembre disparaîtrait du tableau.
 *
 * @param {Object} parAnnee - Revenus par année
 * @param {Object} [capitalParAnnee] - Capital remboursé par année
 * @param {Object} [apportsParAnnee] - Versements personnels par année
 * @param {Object} [impotParAnnee] - Impôt restant dû sur les recettes brutes
 * @returns {Object} Ventilation enrichie
 */
function fusionnerJournal(parAnnee, capitalParAnnee, apportsParAnnee, impotParAnnee) {
    const fusion = {};
    const vide = { brut: 0, net: 0, impot: 0, coupons: 0, parrainage: 0, boost: 0 };

    const annees = new Set([
        ...Object.keys(parAnnee || {}),
        ...Object.keys(apportsParAnnee || {})
    ]);

    annees.forEach(annee => {
        fusion[annee] = {
            ...vide,
            ...(parAnnee?.[annee] || {}),
            capital: capitalParAnnee?.[annee] ?? 0,
            apport: apportsParAnnee?.[annee]?.net ?? 0,
            etranger: impotParAnnee?.[annee]?.etranger ?? 0,
            impotAVenir: impotParAnnee?.[annee]?.impot ?? 0
        };
    });

    return fusion;
}

/**
 * Nombre de mois sur lesquels le perçu est confronté à l'attendu
 *
 * La confrontation ne vaut que sur une fenêtre récente. L'attendu se calcule
 * sur les projets ENCORE détenus : plus on remonte, plus il manque de projets
 * remboursés depuis, qui versaient pourtant à l'époque. En décembre 2024 il
 * annonçait 13,59 € contre 36,41 € réellement perçus — l'attendu passait sous
 * le perçu, ce qui se lit à l'envers de la vérité. Un an en arrière, l'écart
 * dû aux remboursements reste de l'ordre de quelques euros ; au-delà il
 * dépasse celui qu'on cherche à montrer.
 */
const MOIS_COMPARAISON = 12;

/**
 * Confronte le perçu à ce que le portefeuille aurait dû verser
 *
 * Reconstruire l'attendu sur tout l'historique a été tenté et écarté : rendre
 * aux projets remboursés leur mise (10 € la brique) sur leur horizon annoncé
 * recolle bien en 2024, mais dérive de 14 € en 2026, les remboursements
 * arrivant plus tôt que l'horizon. Faute de date de remboursement réelle, la
 * fenêtre récente reste le seul terrain sûr.
 *
 * @param {Object} revenus - Historique normalisé des revenus perçus
 * @param {Object} netRevenueEvolutionData - Série nette attendue, par mois
 * @returns {Object} { attendu, debutComparaison, ecart }
 * @private
 */
function serieAttendue(revenus, netRevenueEvolutionData) {
    const moisPerçus = Object.keys(revenus.mensuel).sort();
    const fenetre = moisPerçus.slice(-MOIS_COMPARAISON);
    const attendu = {};

    fenetre.forEach(mois => {
        const valeur = netRevenueEvolutionData?.[mois];

        if (typeof valeur === 'number') {
            attendu[mois] = valeur;
        }
    });

    const moisAttendus = Object.keys(attendu).sort();

    // L'écart se lit sur le dernier mois RÉVOLU : un mois entamé manque
    // simplement de versements encore à venir, et son écart ne veut rien dire.
    const dernierComplet = moisAttendus
        .filter(mois => !moisEncoreOuvert(revenus.mensuel, mois))
        .pop() || null;

    const ecart = dernierComplet
        ? {
            mois: dernierComplet,
            percu: revenus.mensuel[dernierComplet].net,
            attendu: attendu[dernierComplet],
            manque: attendu[dernierComplet] - revenus.mensuel[dernierComplet].net
        }
        : null;

    return {
        attendu,
        debutComparaison: moisAttendus[0] || null,
        ecart
    };
}

/**
 * Calcule l'évolution temporelle des revenus nets, bruts et taxes
 * @private
 */
function calculateRevenueEvolution(projectNetRevenueEntries, projectGrossRevenueEntries, investmentEvolution) {
    let netRevenueEvolutionData = {};
    let grossRevenueEvolutionData = {};
    let taxAmountEvolutionData = {};
    let totalNetRevenueSinceBeginning = 0;
    let totalTaxesSinceBeginning = 0;

    // Collecter toutes les dates possibles
    const allPossibleStartDates = [];
    projectNetRevenueEntries.forEach(e => allPossibleStartDates.push(e.startDate));
    projectGrossRevenueEntries.forEach(e => allPossibleStartDates.push(e.startDate));
    Object.keys(investmentEvolution || {}).forEach(m => allPossibleStartDates.push(m));

    // Déterminer la plage de dates
    let determinedFirstMonth = null;
    let determinedLastMonth = null;

    if (allPossibleStartDates.length > 0) {
        const sortedAllDates = [...new Set(allPossibleStartDates)]
            .filter(d => d && d !== "N/A")
            .sort();

        if (sortedAllDates.length > 0) {
            determinedFirstMonth = sortedAllDates[0];
            determinedLastMonth = sortedAllDates[sortedAllDates.length - 1];
        }
    }

    // Étendre la plage jusqu'aux projections (M+3)
    const currentMonth = getCurrentMonthYYYYMM();
    const projectionEndMonth = addMonthsToYYYYMM(currentMonth, CONFIG.PROJECTIONS_MONTHS - 1);

    let finalFirstMonth = determinedFirstMonth;
    let finalLastMonth = determinedLastMonth;

    if (projectionEndMonth) {
        if (!finalLastMonth || projectionEndMonth > finalLastMonth) {
            finalLastMonth = projectionEndMonth;
        }
        if (!finalFirstMonth) {
            finalFirstMonth = currentMonth;
        }
    }

    logger.debug(LOG_CATEGORIES.CALC_STATS, 'Date range for evolution', {
        firstMonth: finalFirstMonth,
        lastMonth: finalLastMonth
    });

    // Générer l'évolution si on a une plage valide
    if (finalFirstMonth && finalLastMonth) {
        const allMonthsInRange = generateMonthRange(finalFirstMonth, finalLastMonth);

        logger.debug(LOG_CATEGORIES.CALC_STATS, 'Generating revenue evolution', {
            monthsCount: allMonthsInRange.length
        });

        // Évolution des revenus bruts
        if (projectGrossRevenueEntries.length > 0) {
            allMonthsInRange.forEach(currentMonth => {
                let totalGrossRevenueInCurrentMonth = 0;
                projectGrossRevenueEntries.forEach(entry => {
                    if (entry.startDate <= currentMonth) {
                        totalGrossRevenueInCurrentMonth += entry.revenue;
                    }
                });
                grossRevenueEvolutionData[currentMonth] = totalGrossRevenueInCurrentMonth;
            });
        }

        // Net et impôt se déduisent du brut au taux EN VIGUEUR CE MOIS-LÀ.
        // Appliquer le taux du jour à tout l'historique gonflerait les impôts
        // déjà payés sur les années au taux précédent.
        if (projectNetRevenueEntries.length > 0 || projectGrossRevenueEntries.length > 0) {
            allMonthsInRange.forEach(currentMonth => {
                const gross = grossRevenueEvolutionData[currentMonth] || 0;
                const taux = tauxImpositionPour(currentMonth);

                netRevenueEvolutionData[currentMonth] = gross * (1 - taux);
                taxAmountEvolutionData[currentMonth] = gross * taux;
            });
        }

        // Calcul des totaux cumulés jusqu'au mois actuel
        for (const month in netRevenueEvolutionData) {
            if (month <= currentMonth) {
                totalNetRevenueSinceBeginning += netRevenueEvolutionData[month];
            }
        }

        for (const month in taxAmountEvolutionData) {
            if (month <= currentMonth) {
                totalTaxesSinceBeginning += taxAmountEvolutionData[month];
            }
        }

        logger.debug(LOG_CATEGORIES.CALC_STATS, 'Revenue evolution calculated', {
            netMonths: Object.keys(netRevenueEvolutionData).length,
            grossMonths: Object.keys(grossRevenueEvolutionData).length,
            totalNetCumulative: totalNetRevenueSinceBeginning,
            totalTaxCumulative: totalTaxesSinceBeginning
        });
    } else {
        logger.warn(LOG_CATEGORIES.CALC_STATS, 'Could not determine valid date range for revenue evolution');
    }

    return {
        netRevenueEvolutionData,
        grossRevenueEvolutionData,
        taxAmountEvolutionData,
        totalNetRevenueSinceBeginning,
        totalTaxesSinceBeginning
    };
}
