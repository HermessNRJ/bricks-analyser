/**
 * Calculs financiers et statistiques d'investissement
 */

import { CONFIG, tauxImpositionPour } from '../core/config.js';
import { logger, LOG_CATEGORIES } from '../utils/logger.js';
import { addMonthsToYYYYMM, generateMonthRange, getCurrentMonthYYYYMM, calculateRefundDate, isValidYYYYMM } from '../utils/dateHelpers.js';
import { detectCountryFromProject } from '../utils/countryHelpers.js';
import { repartitionRisque, niveauRisque } from './riskAnalysis.js';
import { serieMensuelle } from './revenueHistory.js';
import { annoterVersements } from './versements.js';

/**
 * Calcule les revenus mensuels (brut, net, taxe) pour un projet
 * @param {number} investment - Investissement total
 * @param {number} yearlyReturn - Rendement annuel en %
 * @returns {Object} { gross, net, tax }
 */
export function calculateMonthlyRevenue(investment, yearlyReturn) {
    const grossYearly = (investment * yearlyReturn) / 100;
    const grossMonthly = grossYearly / 12;
    const netMonthly = grossMonthly * (1 - CONFIG.TAX_RATE);
    const tax = grossMonthly * CONFIG.TAX_RATE;

    return {
        gross: grossMonthly,
        net: netMonthly,
        tax: tax
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
 * @returns {Object} Statistiques complètes
 */
export function calculateInvestmentStats(data, warnings = [], statuts = {}, revenus = null, capital = null) {
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
        const revenue = calculateMonthlyRevenue(projectInvestment, project.yearlyReturn);
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

    const revenusReels = historiqueDisponible
        ? {
            mensuel: revenus.mensuel,
            parAnnee: fusionnerCapital(revenus.parAnnee, capital?.parAnnee),
            capital: capital || null,
            premierMois: revenus.premierMois,
            dernierMois: revenus.dernierMois,
            total: revenus.total,
            net: serieMensuelle(revenus, 'net'),
            brut: serieMensuelle(revenus, 'brut'),
            impot: serieMensuelle(revenus, 'impot'),
            // Le mois courant n'est pas terminé : son montant n'est pas comparable
            // aux précédents et doit être signalé comme tel à l'écran.
            moisPartiel: revenus.dernierMois === getCurrentMonthYYYYMM() ? revenus.dernierMois : null,
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
        monthlyRevenue,
        properties,
        detenuesCount: detenues,
        partDetenues,
        partRemboursees,
        partFinancement,
        risque: repartitionRisque(properties, statuts),
        versements,
        investmentEvolution,
        netRevenueEvolutionData,
        grossRevenueEvolutionData,
        taxAmountEvolutionData,
        revenusReels,
        // « Perçu » et « payé » se lisent sur l'état de compte quand on l'a ;
        // l'estimation ne prend le relais que faute de mieux.
        totalNetRevenueSinceBeginning: historiqueDisponible
            ? revenus.total.net
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
 * Ajoute le capital remboursé à la ventilation annuelle des revenus
 *
 * Le capital vient d'une autre source que les revenus — le journal des
 * mouvements, non l'état de compte — et peut donc manquer. Une année sans
 * remboursement connu vaut zéro, ce qui se lit mieux qu'une case vide.
 *
 * @param {Object} parAnnee - Revenus par année
 * @param {Object} [capitalParAnnee] - Capital remboursé par année
 * @returns {Object} Ventilation enrichie
 */
function fusionnerCapital(parAnnee, capitalParAnnee) {
    const fusion = {};

    Object.keys(parAnnee || {}).forEach(annee => {
        fusion[annee] = { ...parAnnee[annee], capital: capitalParAnnee?.[annee] ?? 0 };
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
    const moisCourant = getCurrentMonthYYYYMM();
    const dernierComplet = moisAttendus.filter(mois => mois !== moisCourant).pop() || null;

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
