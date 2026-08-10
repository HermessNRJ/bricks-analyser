import { describe, it, expect } from 'vitest';
import {
    sliceEvolutionRange,
    INVESTMENT_RANGES,
    DEFAULT_INVESTMENT_RANGE
} from '../src/charts/investmentChart.js';

/**
 * Courbe cumulative sur 14 mois : 2024-01 = 100, 2024-02 = 200, ... 2025-02 = 1400
 */
function evolutionSur14Mois() {
    const data = {};
    for (let i = 0; i < 14; i++) {
        const mois = `${2024 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`;
        data[mois] = (i + 1) * 100;
    }
    return data;
}

describe('sliceEvolutionRange', () => {
    const data = evolutionSur14Mois();

    it('ne garde que les 3 derniers mois', () => {
        const { labels, data: valeurs } = sliceEvolutionRange(data, '3');

        expect(labels).toEqual(['2024-12', '2025-01', '2025-02']);
        expect(valeurs).toEqual([1200, 1300, 1400]);
    });

    it('ne garde que les 6 derniers mois', () => {
        expect(sliceEvolutionRange(data, '6').labels).toHaveLength(6);
    });

    it('ne garde que les 12 derniers mois', () => {
        const { labels } = sliceEvolutionRange(data, '12');

        expect(labels).toHaveLength(12);
        expect(labels[0]).toBe('2024-03');
    });

    it('conserve tout l\'historique avec « all »', () => {
        expect(sliceEvolutionRange(data, 'all').labels).toHaveLength(14);
    });

    it('conserve les valeurs cumulées, sans les recalculer depuis le début de la fenêtre', () => {
        // Le premier point d'une fenêtre courte reste le cumul depuis l'origine
        expect(sliceEvolutionRange(data, '3').data[0]).toBe(1200);
    });

    it('retombe sur la période par défaut si la valeur est inconnue', () => {
        const attendu = sliceEvolutionRange(data, DEFAULT_INVESTMENT_RANGE);

        expect(sliceEvolutionRange(data, 'n_importe_quoi')).toEqual(attendu);
        expect(sliceEvolutionRange(data, undefined)).toEqual(attendu);
    });

    it('tolère un historique plus court que la période demandée', () => {
        const court = { '2025-01': 100, '2025-02': 200 };

        expect(sliceEvolutionRange(court, '12').labels).toEqual(['2025-01', '2025-02']);
    });

    it('tolère des données absentes', () => {
        expect(sliceEvolutionRange(null, '3')).toEqual({ labels: [], data: [] });
        expect(sliceEvolutionRange({}, 'all')).toEqual({ labels: [], data: [] });
    });

    it('trie les mois avant de découper', () => {
        const desordre = { '2025-02': 300, '2024-12': 100, '2025-01': 200 };

        const { labels, data: valeurs } = sliceEvolutionRange(desordre, '3');

        expect(labels).toEqual(['2024-12', '2025-01', '2025-02']);
        expect(valeurs).toEqual([100, 200, 300]);
    });

    it('expose les périodes attendues par l\'interface', () => {
        expect(Object.keys(INVESTMENT_RANGES)).toEqual(['3', '6', '12', 'all']);
    });
});
