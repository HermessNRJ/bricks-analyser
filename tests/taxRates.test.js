import { describe, it, expect } from 'vitest';
import { CONFIG, tauxImpositionPour, tauxImpositionCourant } from '../src/core/config.js';
import { calculateInvestmentStats } from '../src/business/calculations.js';

describe('tauxImpositionPour', () => {
    it('applique l\'ancien taux avant l\'entrée en vigueur', () => {
        expect(tauxImpositionPour('2024-06')).toBe(0.30);
        expect(tauxImpositionPour('2025-12')).toBe(0.30);
    });

    it('applique le nouveau taux à partir de son entrée en vigueur', () => {
        expect(tauxImpositionPour('2026-01')).toBe(0.314);
        expect(tauxImpositionPour('2026-08')).toBe(0.314);
    });

    it('retombe sur le taux courant sans mois fourni', () => {
        expect(tauxImpositionPour()).toBe(tauxImpositionCourant());
        expect(tauxImpositionPour('')).toBe(tauxImpositionCourant());
    });

    it('expose le dernier palier comme taux courant', () => {
        expect(tauxImpositionCourant()).toBe(0.314);
        expect(CONFIG.TAX_RATE).toBe(0.314);
    });
});

describe('impôts cumulés — barème daté', () => {
    const project = (revenueStartDate) => ({
        id: 'p1',
        name: { fr: 'Immeuble' },
        ownedBricks: 10,
        brickPrice: 1000,
        yearlyTotalRentabilityPercentage: 12,
        funding: { revenueStartDate }
    });

    it('taxe chaque mois au taux qui avait cours à l\'époque', () => {
        // 100 € à 12 % = 1 € brut par mois. Appliquer 31,4 % à toute
        // l'historique surestimerait les impôts déjà payés à 30 %.
        const data = [{ yearMonthDate: '2025-11', projects: [project('2025-11')] }];

        const { taxAmountEvolutionData } = calculateInvestmentStats(data);

        expect(taxAmountEvolutionData['2025-11']).toBeCloseTo(0.30, 10);
        expect(taxAmountEvolutionData['2025-12']).toBeCloseTo(0.30, 10);
        expect(taxAmountEvolutionData['2026-01']).toBeCloseTo(0.314, 10);
    });

    it('garde net + impôt égal au brut à chaque mois', () => {
        const data = [{ yearMonthDate: '2025-11', projects: [project('2025-11')] }];

        const { netRevenueEvolutionData, grossRevenueEvolutionData, taxAmountEvolutionData } =
            calculateInvestmentStats(data);

        Object.keys(grossRevenueEvolutionData).forEach(mois => {
            expect(netRevenueEvolutionData[mois] + taxAmountEvolutionData[mois])
                .toBeCloseTo(grossRevenueEvolutionData[mois], 10);
        });
    });
});
