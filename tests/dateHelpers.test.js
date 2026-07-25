import { describe, it, expect, vi, afterEach } from 'vitest';
import {
    addMonthsToYYYYMM,
    generateMonthRange,
    getCurrentMonthYYYYMM,
    calculateRefundDate,
    compareYYYYMM,
    isValidYYYYMM,
    subtractMonths
} from '../src/utils/dateHelpers.js';

afterEach(() => {
    vi.useRealTimers();
});

describe('addMonthsToYYYYMM', () => {
    it('ajoute des mois dans la même année', () => {
        expect(addMonthsToYYYYMM('2024-01', 5)).toBe('2024-06');
    });

    it('passe à l\'année suivante', () => {
        expect(addMonthsToYYYYMM('2024-11', 3)).toBe('2025-02');
    });

    it('gère plusieurs années d\'écart', () => {
        expect(addMonthsToYYYYMM('2024-01', 36)).toBe('2027-01');
    });

    it('accepte un delta négatif', () => {
        expect(addMonthsToYYYYMM('2024-02', -3)).toBe('2023-11');
    });

    it('est neutre avec 0', () => {
        expect(addMonthsToYYYYMM('2024-07', 0)).toBe('2024-07');
    });

    it('retourne null sur une entrée invalide', () => {
        expect(addMonthsToYYYYMM('', 1)).toBeNull();
        expect(addMonthsToYYYYMM(null, 1)).toBeNull();
        expect(addMonthsToYYYYMM('202401', 1)).toBeNull();
        expect(addMonthsToYYYYMM('abcd-ef', 1)).toBeNull();
    });
});

describe('generateMonthRange', () => {
    it('génère une plage inclusive', () => {
        expect(generateMonthRange('2024-01', '2024-04')).toEqual([
            '2024-01', '2024-02', '2024-03', '2024-04'
        ]);
    });

    it('traverse les années', () => {
        expect(generateMonthRange('2023-11', '2024-02')).toEqual([
            '2023-11', '2023-12', '2024-01', '2024-02'
        ]);
    });

    it('retourne un seul mois quand début === fin', () => {
        expect(generateMonthRange('2024-05', '2024-05')).toEqual(['2024-05']);
    });

    it('retourne un tableau vide si fin < début', () => {
        expect(generateMonthRange('2024-05', '2024-01')).toEqual([]);
    });

    it('retourne un tableau vide sur entrée manquante ou invalide', () => {
        expect(generateMonthRange(null, '2024-01')).toEqual([]);
        expect(generateMonthRange('2024-01', null)).toEqual([]);
        expect(generateMonthRange('oops', 'oops')).toEqual([]);
    });

    it('borne le nombre d\'itérations (pas de boucle infinie)', () => {
        const months = generateMonthRange('2000-01', '3000-01');
        expect(months.length).toBe(1200);
    });
});

describe('getCurrentMonthYYYYMM', () => {
    it('formate le mois courant sur 2 chiffres', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2024, 2, 15)); // mars 2024, heure locale
        expect(getCurrentMonthYYYYMM()).toBe('2024-03');
    });

    it('gère décembre', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2024, 11, 31));
        expect(getCurrentMonthYYYYMM()).toBe('2024-12');
    });
});

describe('calculateRefundDate', () => {
    it('ajoute l\'horizon d\'investissement à la date de premier versement', () => {
        expect(calculateRefundDate('2024-01', 24)).toBe('2026-01');
    });

    it('retourne null si une donnée manque', () => {
        expect(calculateRefundDate(null, 24)).toBeNull();
        expect(calculateRefundDate('2024-01', 0)).toBeNull();
        expect(calculateRefundDate('2024-01', undefined)).toBeNull();
    });

    it('retourne null si le format n\'est pas YYYY-MM', () => {
        expect(calculateRefundDate('2024-01-15', 24)).toBeNull();
        expect(calculateRefundDate('N/A', 24)).toBeNull();
    });
});

describe('subtractMonths', () => {
    it('recule d\'un mois', () => {
        const result = subtractMonths(new Date(2024, 5, 15), 1);
        expect([result.getFullYear(), result.getMonth(), result.getDate()]).toEqual([2024, 4, 15]);
    });

    it('traverse le changement d\'année', () => {
        const result = subtractMonths(new Date(2024, 0, 10), 2);
        expect([result.getFullYear(), result.getMonth(), result.getDate()]).toEqual([2023, 10, 10]);
    });

    it('borne le jour quand le mois cible est plus court', () => {
        // 31 mars - 1 mois : février n'a pas 31 jours, on attend le 29 (2024 bissextile)
        const result = subtractMonths(new Date(2024, 2, 31), 1);
        expect([result.getFullYear(), result.getMonth(), result.getDate()]).toEqual([2024, 1, 29]);
    });

    it('borne le jour sur une année non bissextile', () => {
        const result = subtractMonths(new Date(2023, 2, 31), 1);
        expect([result.getFullYear(), result.getMonth(), result.getDate()]).toEqual([2023, 1, 28]);
    });

    it('ne modifie pas la date de référence', () => {
        const reference = new Date(2024, 2, 31);
        subtractMonths(reference, 1);
        expect(reference.getMonth()).toBe(2);
    });
});

describe('compareYYYYMM', () => {
    it('compare correctement', () => {
        expect(compareYYYYMM('2024-01', '2024-01')).toBe(0);
        expect(compareYYYYMM('2024-01', '2024-02')).toBe(-1);
        expect(compareYYYYMM('2024-02', '2024-01')).toBe(1);
        expect(compareYYYYMM('2023-12', '2024-01')).toBe(-1);
    });
});

describe('isValidYYYYMM', () => {
    it('accepte un mois valide', () => {
        expect(isValidYYYYMM('2024-01')).toBe(true);
        expect(isValidYYYYMM('2024-12')).toBe(true);
    });

    it('rejette les formats et valeurs invalides', () => {
        expect(isValidYYYYMM('2024-13')).toBe(false);
        expect(isValidYYYYMM('2024-00')).toBe(false);
        expect(isValidYYYYMM('1899-01')).toBe(false);
        expect(isValidYYYYMM('2024-1')).toBe(false);
        expect(isValidYYYYMM('N/A')).toBe(false);
        expect(isValidYYYYMM(null)).toBe(false);
        expect(isValidYYYYMM(202401)).toBe(false);
    });
});
