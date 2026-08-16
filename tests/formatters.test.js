import { describe, it, expect } from 'vitest';
import {
    formatCurrency,
    formatNumber,
    formatPercentage,
    formatBricks,
    truncate,
    formatMonthName
} from '../src/utils/formatters.js';

// Les séparateurs fr-FR sont des espaces insécables (U+202F / U+00A0) selon la
// version d'ICU : on normalise avant de comparer.
const norm = (s) => s.replace(/[\u202f\u00a0]/g, ' ');

describe('formatCurrency', () => {
    it('formate un montant en euros', () => {
        expect(norm(formatCurrency(1234.56))).toBe('1 234,56 €');
    });

    it('respecte le nombre de décimales', () => {
        expect(norm(formatCurrency(1234.56, 0))).toBe('1 235 €');
    });

    it('gère les valeurs nulles et non numériques', () => {
        expect(formatCurrency(null)).toBe('0€');
        expect(formatCurrency(undefined)).toBe('0€');
        expect(formatCurrency(NaN)).toBe('0€');
    });

    it('formate 0 comme un montant, pas comme une valeur manquante', () => {
        expect(norm(formatCurrency(0))).toBe('0,00 €');
    });

    it('gère les montants négatifs', () => {
        expect(norm(formatCurrency(-50))).toBe('-50,00 €');
    });
});

describe('formatNumber', () => {
    it('ajoute les séparateurs de milliers', () => {
        expect(norm(formatNumber(1234567))).toBe('1 234 567');
    });

    it('arrondit par défaut sans décimale', () => {
        expect(formatNumber(12.7)).toBe('13');
    });

    it('gère les valeurs invalides', () => {
        expect(formatNumber(null)).toBe('0');
        expect(formatNumber(NaN)).toBe('0');
    });
});

describe('formatPercentage', () => {
    // Intl insère une espace insécable fine avant le signe : on la normalise
    // pour comparer, tout en vérifiant qu'elle est bien présente.
    const lisible = (valeur) => formatPercentage(valeur).replace(/[\u202f\u00a0]/g, ' ');

    it('formate avec une décimale par défaut', () => {
        expect(lisible(5.67)).toBe('5,7 %');
    });

    it('sépare le signe par une espace insécable', () => {
        expect(formatPercentage(5.67)).toMatch(/[\u202f\u00a0]%$/);
    });

    it('respecte le nombre de décimales demandé', () => {
        expect(formatPercentage(12.345, 2).replace(/[\u202f\u00a0]/g, ' ')).toBe('12,35 %');
        expect(formatPercentage(12.9, 0).replace(/[\u202f\u00a0]/g, ' ')).toBe('13 %');
    });

    it('gère les valeurs invalides', () => {
        expect(lisible(undefined)).toBe('0,0 %');
        expect(lisible(null)).toBe('0,0 %');
        expect(lisible(NaN)).toBe('0,0 %');
    });
});

describe('formatBricks', () => {
    it('formate sans décimale', () => {
        expect(norm(formatBricks(1500))).toBe('1 500');
    });
});

describe('truncate', () => {
    it('tronque au-delà de la limite', () => {
        expect(truncate('abcdefghij', 5)).toBe('abcde...');
    });

    it('laisse intact un texte court', () => {
        expect(truncate('abc', 5)).toBe('abc');
    });

    it('gère la limite exacte', () => {
        expect(truncate('abcde', 5)).toBe('abcde');
    });

    it('gère les entrées vides', () => {
        expect(truncate(null)).toBe('');
        expect(truncate(undefined)).toBe('');
        expect(truncate('')).toBe('');
    });
});

describe('formatMonthName', () => {
    it('traduit le mois en français', () => {
        expect(formatMonthName('2024-01')).toBe('Janvier 2024');
        expect(formatMonthName('2024-12')).toBe('Décembre 2024');
    });

    it('retourne l\'entrée telle quelle si le mois est hors bornes', () => {
        expect(formatMonthName('2024-13')).toBe('2024-13');
    });

    it('retourne l\'entrée telle quelle si le format est inattendu', () => {
        expect(formatMonthName('N/A')).toBe('N/A');
        expect(formatMonthName('')).toBe('');
    });
});
