/**
 * Calculs financiers et statistiques d'investissement
 */

import { CONFIG } from '../core/config.js';
import { logger, LOG_CATEGORIES } from '../utils/logger.js';
import { addMonthsToYYYYMM, generateMonthRange, getCurrentMonthYYYYMM } from '../utils/dateHelpers.js';

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
 * Fonction principale : calcule toutes les statistiques d'investissement
 * @param {Array} data - Données mensuelles des projets
 * @returns {Object} Statistiques complètes
 */
export function calculateInvestmentStats(data) {
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

                    // Stocker le projet unique (Map = pas de doublons)
                    uniqueProjects.set(project.id, {
                        id: project.id,
                        name: project.name?.fr || project.name?.en || project.name || 'Propriété sans nom',
                        address: project.address?.fr || project.address?.en || project.address || 'Adresse non disponible',
                        ownedBricks: ownedBricks,
                        brickPrice: brickPrice,
                        yearlyReturn: project.yearlyTotalRentabilityPercentage || 0,
                        thumbnailUrl: project.thumbnailUrl || '',
                        firstSeenMonth: monthKey,
                        funding: project.funding,
                        projectStatus: project.projectStatus || 'financed'
                    });
                }
            } catch (projectErr) {
                logger.error(LOG_CATEGORIES.CALC_STATS, `Error processing project ${projectIndex}`, projectErr);
            }
        });
    });

    logger.debug(LOG_CATEGORIES.CALC_STATS, 'Unique projects collected', {
        count: uniqueProjects.size
    });

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

        // Ajouter à la liste des propriétés
        properties.push({
            id: project.id,
            name: project.name,
            isRefunded: isRefunded,
            address: project.address,
            ownedBricks: project.ownedBricks,
            investment: projectInvestment,
            yearlyReturn: project.yearlyReturn,
            monthlyRevenue: revenue.net,
            thumbnailUrl: project.thumbnailUrl,
            projectStatus: project.projectStatus
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
    uniqueProjects.forEach((project) => {
        const monthKey = project.firstSeenMonth;
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
    // RETOUR DES RÉSULTATS
    // ========================================================================
    return {
        totalBricks,
        totalInvestment,
        monthlyRevenue,
        properties,
        investmentEvolution,
        netRevenueEvolutionData,
        grossRevenueEvolutionData,
        taxAmountEvolutionData,
        totalNetRevenueSinceBeginning,
        totalTaxesSinceBeginning,
        refundedProjectsCount,
        activePropertiesCount,
        fundingOrUpcomingProjectsCount
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

        // Évolution des revenus nets
        if (projectNetRevenueEntries.length > 0) {
            allMonthsInRange.forEach(currentMonth => {
                let totalNetRevenueInCurrentMonth = 0;
                projectNetRevenueEntries.forEach(entry => {
                    if (entry.startDate <= currentMonth) {
                        totalNetRevenueInCurrentMonth += entry.revenue;
                    }
                });
                netRevenueEvolutionData[currentMonth] = totalNetRevenueInCurrentMonth;
            });
        }

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

        // Calcul des taxes (différence brut - net)
        allMonthsInRange.forEach(currentMonth => {
            const gross = grossRevenueEvolutionData[currentMonth] || 0;
            const net = netRevenueEvolutionData[currentMonth] || 0;
            taxAmountEvolutionData[currentMonth] = gross - net;
        });

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
