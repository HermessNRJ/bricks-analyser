import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { calculateMonthlyRevenue, calculateInvestmentStats } from '../src/business/calculations.js';
import { CONFIG, tauxImpositionPour } from '../src/core/config.js';

/**
 * Construit un projet au format API Bricks.
 * brickPrice est exprimé en centimes côté API (1000 => 10€).
 */
function project(overrides = {}) {
    return {
        id: 'p1',
        name: { fr: 'Immeuble Lyon' },
        address: { fr: '1 rue de la Paix, Lyon' },
        ownedBricks: 10,
        brickPrice: 1000,
        yearlyTotalRentabilityPercentage: 12,
        investmentHorizonInMonths: 24,
        funding: { revenueStartDate: '2024-01' },
        ...overrides
    };
}

const month = (yearMonthDate, projects) => ({ yearMonthDate, projects });

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2024, 5, 15)); // juin 2024
});

afterEach(() => {
    vi.useRealTimers();
});

describe('calculateMonthlyRevenue', () => {
    it('répartit le rendement annuel sur 12 mois', () => {
        const { gross, net, tax } = calculateMonthlyRevenue(1200, 12);
        expect(gross).toBeCloseTo(12, 10);      // 1200 * 12% / 12
        expect(net).toBeCloseTo(12 * (1 - CONFIG.TAX_RATE), 10);  // - la flat tax courante
        expect(tax).toBeCloseTo(12 * CONFIG.TAX_RATE, 10);
    });

    it('net + tax reste égal au brut', () => {
        const { gross, net, tax } = calculateMonthlyRevenue(3457.89, 9.37);
        expect(net + tax).toBeCloseTo(gross, 10);
    });

    it('retourne 0 pour un investissement nul', () => {
        expect(calculateMonthlyRevenue(0, 12)).toEqual({ gross: 0, net: 0, tax: 0 });
    });

    it('retourne 0 pour un rendement nul', () => {
        expect(calculateMonthlyRevenue(1000, 0)).toEqual({ gross: 0, net: 0, tax: 0 });
    });

    it('applique le taux d\'imposition configuré', () => {
        const { gross, tax } = calculateMonthlyRevenue(1200, 12);
        expect(tax / gross).toBeCloseTo(CONFIG.TAX_RATE, 10);
    });
});

describe('calculateInvestmentStats — agrégats', () => {
    it('calcule investissement, briques et revenus', () => {
        const data = [month('2024-01', [project()])];

        const stats = calculateInvestmentStats(data);

        expect(stats.totalInvestment).toBe(100);   // 10 briques * 10€
        expect(stats.totalBricks).toBe(10);
        expect(stats.properties).toHaveLength(1);
        // 100 € à 12 % l'an = 1 € brut par mois, moins la flat tax courante
        expect(stats.monthlyRevenue).toBeCloseTo(1 * (1 - CONFIG.TAX_RATE), 10);
    });

    it('convertit brickPrice des centimes vers les euros', () => {
        const data = [month('2024-01', [project({ brickPrice: 1050, ownedBricks: 2 })])];
        expect(calculateInvestmentStats(data).totalInvestment).toBeCloseTo(21, 10);
    });

    it('utilise le prix par défaut quand brickPrice est absent', () => {
        const data = [month('2024-01', [project({ brickPrice: undefined, ownedBricks: 3 })])];
        expect(calculateInvestmentStats(data).totalInvestment)
            .toBe(3 * CONFIG.DEFAULT_BRICK_PRICE);
    });

    it('déduplique un projet présent sur plusieurs mois', () => {
        const data = [
            month('2024-01', [project()]),
            month('2024-02', [project()]),
            month('2024-03', [project()])
        ];

        const stats = calculateInvestmentStats(data);

        expect(stats.properties).toHaveLength(1);
        expect(stats.totalInvestment).toBe(100);
    });

    it('ignore les projets sans brique possédée', () => {
        const data = [month('2024-01', [project({ ownedBricks: 0 })])];
        expect(calculateInvestmentStats(data).properties).toHaveLength(0);
    });

    it('lit ownedBricks depuis investorBricks.owned en repli', () => {
        const data = [month('2024-01', [
            project({ ownedBricks: undefined, investorBricks: { owned: 7 } })
        ])];
        expect(calculateInvestmentStats(data).properties[0].ownedBricks).toBe(7);
    });

    it('survit à un mois sans tableau projects', () => {
        const data = [
            { yearMonthDate: '2024-01' },
            month('2024-02', [project()])
        ];
        expect(calculateInvestmentStats(data).properties).toHaveLength(1);
    });

    it('retourne des agrégats neutres sur un jeu de données vide', () => {
        const stats = calculateInvestmentStats([]);

        expect(stats.totalInvestment).toBe(0);
        expect(stats.totalBricks).toBe(0);
        expect(stats.properties).toEqual([]);
        expect(stats.totalNetRevenueSinceBeginning).toBe(0);
    });
});

describe('calculateInvestmentStats — statuts de projet', () => {
    it('marque comme remboursé un projet dont le prix de brique est tombé à 0', () => {
        const data = [month('2024-01', [project({ brickPrice: 0 })])];

        const stats = calculateInvestmentStats(data);

        expect(stats.properties[0].isRefunded).toBe(true);
        expect(stats.refundedProjectsCount).toBe(1);
    });

    it('exclut les briques remboursées du total de briques actives', () => {
        const data = [month('2024-01', [
            project({ id: 'actif', ownedBricks: 4 }),
            project({ id: 'rembourse', ownedBricks: 6, brickPrice: 0 })
        ])];

        const stats = calculateInvestmentStats(data);

        expect(stats.totalBricks).toBe(4);
        expect(stats.activePropertiesCount).toBe(1);
        expect(stats.properties).toHaveLength(2);
    });

    it('compte les projets en financement et à venir', () => {
        const data = [month('2024-01', [
            project({ id: 'a', projectStatus: 'ongoing' }),
            project({ id: 'b', projectStatus: 'upcoming' }),
            project({ id: 'c', projectStatus: 'financed' })
        ])];

        expect(calculateInvestmentStats(data).fundingOrUpcomingProjectsCount).toBe(2);
    });

    it('considère un projet sans statut comme financé', () => {
        const data = [month('2024-01', [project()])];
        expect(calculateInvestmentStats(data).properties[0].projectStatus).toBe('financed');
    });
});

describe('calculateInvestmentStats — propriétés exposées', () => {
    it('expose les libellés, le pays et les dates', () => {
        const data = [month('2024-01', [project({
            name: { fr: 'Villa 🇵🇹 Porto' },
            funding: { revenueStartDate: '2024-03' },
            investmentHorizonInMonths: 12
        })])];

        const [prop] = calculateInvestmentStats(data).properties;

        expect(prop.name).toBe('Villa 🇵🇹 Porto');
        expect(prop.address).toBe('1 rue de la Paix, Lyon');
        expect(prop.country).toBe('Portugal');
        expect(prop.revenueStartDate).toBe('2024-03');
        expect(prop.refundDate).toBe('2025-03');
    });

    it('fournit des libellés de repli', () => {
        const data = [month('2024-01', [project({ name: undefined, address: undefined })])];

        const [prop] = calculateInvestmentStats(data).properties;

        expect(prop.name).toBe('Propriété sans nom');
        expect(prop.address).toBe('Adresse non disponible');
    });

    it('laisse refundDate à null sans date de premier versement', () => {
        const data = [month('2024-01', [project({ funding: undefined })])];

        const [prop] = calculateInvestmentStats(data).properties;

        expect(prop.revenueStartDate).toBeNull();
        expect(prop.refundDate).toBeNull();
    });
});

describe('calculateInvestmentStats — warnings', () => {
    it('rattache les warnings à la propriété par propertyId', () => {
        const data = [month('2024-01', [project({ id: 'p1' }), project({ id: 'p2' })])];
        const warnings = [
            { propertyId: 'p1', date: '2024-06-01', description: 'Retard de travaux' },
            { propertyId: 'p1', date: '2024-05-01', description: 'Suivi' }
        ];

        const stats = calculateInvestmentStats(data, warnings);
        const byId = Object.fromEntries(stats.properties.map(p => [p.id, p]));

        expect(byId.p1.warningsCount).toBe(2);
        expect(byId.p2.warningsCount).toBe(0);
        expect(byId.p2.warnings).toEqual([]);
    });

    it('ignore les warnings orphelins sans planter', () => {
        const data = [month('2024-01', [project({ id: 'p1' })])];
        const warnings = [{ propertyId: 'inconnu', date: '2024-06-01', description: 'x' }];

        expect(calculateInvestmentStats(data, warnings).properties[0].warningsCount).toBe(0);
    });

    it('accepte une valeur de warnings non conforme', () => {
        const data = [month('2024-01', [project()])];

        expect(() => calculateInvestmentStats(data, null)).not.toThrow();
        expect(() => calculateInvestmentStats(data, undefined)).not.toThrow();
    });
});

describe('calculateInvestmentStats — évolution de l\'investissement', () => {
    it('cumule l\'investissement par mois de première apparition', () => {
        const data = [
            month('2024-01', [project({ id: 'a', ownedBricks: 10 })]),
            month('2024-02', [project({ id: 'a', ownedBricks: 10 }), project({ id: 'b', ownedBricks: 5 })])
        ];

        const { investmentEvolution } = calculateInvestmentStats(data);

        expect(investmentEvolution).toEqual({ '2024-01': 100, '2024-02': 150 });
    });

    it('rattache un projet à son PREMIER mois, pas au dernier', () => {
        const data = [
            month('2024-01', [project({ id: 'a' })]),
            month('2024-02', [project({ id: 'a' })])
        ];

        const { investmentEvolution } = calculateInvestmentStats(data);

        expect(investmentEvolution['2024-01']).toBe(100);
    });

    it('est insensible à l\'ordre des mois dans le fichier source', () => {
        const desordre = [
            month('2024-02', [project({ id: 'a' })]),
            month('2024-01', [project({ id: 'a' })])
        ];

        const { investmentEvolution } = calculateInvestmentStats(desordre);

        expect(Object.keys(investmentEvolution)).toEqual(['2024-01']);
    });

    it('rattache les projets non datés (N/A) au mois courant', () => {
        // Les projets en financement/à venir n'ont pas de mois, mais les briques
        // sont payées : les écarter creuserait un écart avec l'investissement total.
        const data = [
            month('2024-01', [project({ id: 'a' })]),
            month('N/A', [project({ id: 'b', projectStatus: 'ongoing' })])
        ];

        const { investmentEvolution, totalInvestment } = calculateInvestmentStats(data);

        expect(Object.keys(investmentEvolution)).toEqual(['2024-01', '2024-06']);
        expect(investmentEvolution['2024-06']).toBe(200);
        expect(totalInvestment).toBe(200);
    });

    it('fait converger le dernier point de la courbe vers l\'investissement total', () => {
        const data = [
            month('2024-01', [project({ id: 'a' })]),
            month('2024-02', [project({ id: 'b', ownedBricks: 5 })]),
            month('N/A', [
                project({ id: 'c', ownedBricks: 3, projectStatus: 'ongoing' }),
                project({ id: 'd', ownedBricks: 2, projectStatus: 'upcoming' })
            ])
        ];

        const { investmentEvolution, totalInvestment } = calculateInvestmentStats(data);

        const mois = Object.keys(investmentEvolution).sort();
        const dernierPoint = investmentEvolution[mois[mois.length - 1]];

        expect(dernierPoint).toBeCloseTo(totalInvestment, 2);
    });
});

describe('calculateInvestmentStats — évolution des revenus et taxes', () => {
    it('accumule les revenus à partir du mois de premier versement', () => {
        const data = [month('2024-01', [
            project({ id: 'a', funding: { revenueStartDate: '2024-01' } }),
            project({ id: 'b', funding: { revenueStartDate: '2024-03' } })
        ])];

        const { netRevenueEvolutionData } = calculateInvestmentStats(data);

        const net = (brut) => brut * (1 - tauxImpositionPour('2024-01'));
        expect(netRevenueEvolutionData['2024-01']).toBeCloseTo(net(1), 10);
        expect(netRevenueEvolutionData['2024-02']).toBeCloseTo(net(1), 10);
        expect(netRevenueEvolutionData['2024-03']).toBeCloseTo(net(2), 10);
    });

    it('étend la plage jusqu\'aux mois de projection', () => {
        const data = [month('2024-01', [project({ funding: { revenueStartDate: '2024-01' } })])];

        const { netRevenueEvolutionData } = calculateInvestmentStats(data);

        // « maintenant » = juin 2024, PROJECTIONS_MONTHS = 4 → jusqu'à septembre
        const dernierMoisProjete = '2024-09';
        expect(netRevenueEvolutionData[dernierMoisProjete]).toBeDefined();
    });

    it('déduit la taxe comme différence brut - net', () => {
        const data = [month('2024-01', [project({ funding: { revenueStartDate: '2024-01' } })])];

        const { netRevenueEvolutionData, grossRevenueEvolutionData, taxAmountEvolutionData } =
            calculateInvestmentStats(data);

        expect(taxAmountEvolutionData['2024-02']).toBeCloseTo(
            grossRevenueEvolutionData['2024-02'] - netRevenueEvolutionData['2024-02'], 10
        );
        expect(taxAmountEvolutionData['2024-02']).toBeCloseTo(tauxImpositionPour('2024-02'), 10);
    });

    it('ne cumule le réalisé que jusqu\'au mois courant', () => {
        const data = [month('2024-01', [project({ funding: { revenueStartDate: '2024-01' } })])];

        const { totalNetRevenueSinceBeginning, totalTaxesSinceBeginning } =
            calculateInvestmentStats(data);

        // janvier → juin = 6 mois de 0,70€ net et 0,30€ de taxe
        expect(totalNetRevenueSinceBeginning).toBeCloseTo(6 * 0.7, 8);
        expect(totalTaxesSinceBeginning).toBeCloseTo(6 * tauxImpositionPour('2024-01'), 8);
    });

    it('ignore les dates de premier versement mal formées', () => {
        const data = [month('2024-01', [project({ funding: { revenueStartDate: '2024-01-15' } })])];

        const { netRevenueEvolutionData } = calculateInvestmentStats(data);

        expect(Object.values(netRevenueEvolutionData).every(v => v === 0 || v === undefined))
            .toBe(true);
    });
});

describe('calculateMonthlyRevenue selon le pays', () => {
    it('retient le prélèvement forfaitaire sur un projet français', () => {
        const revenu = calculateMonthlyRevenue(250, 11, 'France');

        expect(revenu.gross).toBeCloseTo(2.29, 2);
        expect(revenu.net).toBeCloseTo(2.29 * (1 - CONFIG.TAX_RATE), 2);
        expect(revenu.tax).toBeGreaterThan(0);
    });

    it('ne retient rien à la source hors de France', () => {
        // Le coupon arrive brut ; l'impôt viendra sur la déclaration, et la
        // fiche affiche par ailleurs le même montant en net et en brut.
        const revenu = calculateMonthlyRevenue(250, 11, 'Portugal');

        expect(revenu.net).toBeCloseTo(revenu.gross, 6);
        expect(revenu.tax).toBe(0);
    });

    it('suppose la France quand le pays n\'est pas précisé', () => {
        expect(calculateMonthlyRevenue(250, 11).net)
            .toBeCloseTo(calculateMonthlyRevenue(250, 11, 'France').net, 6);
    });
});
