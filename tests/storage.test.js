import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    loadFromLocalStorage,
    saveToLocalStorage,
    clearLocalStorage,
    hasStoredData
} from '../src/data/storage.js';
import { CONFIG } from '../src/core/config.js';

const KEY = CONFIG.LOCAL_STORAGE_KEY;

beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
});

describe('saveToLocalStorage', () => {
    it('sauvegarde données et warnings', () => {
        const data = [{ yearMonthDate: '2024-01', projects: [{ id: 'a' }] }];
        const warnings = [{ propertyId: 'a', date: '2024-01-01' }];

        expect(saveToLocalStorage(data, warnings)).toBe(true);
        expect(JSON.parse(localStorage.getItem(KEY))).toEqual({ data, warnings });
    });

    it('accepte un appel sans warnings', () => {
        expect(saveToLocalStorage([{ yearMonthDate: '2024-01', projects: [] }])).toBe(true);
        expect(JSON.parse(localStorage.getItem(KEY)).warnings).toEqual([]);
    });

    it('refuse une valeur non tableau', () => {
        expect(saveToLocalStorage({ oops: true })).toBe(false);
        expect(saveToLocalStorage(null)).toBe(false);
        expect(localStorage.getItem(KEY)).toBeNull();
    });

    it('retourne false quand le quota est dépassé', () => {
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            const err = new Error('quota');
            err.name = 'QuotaExceededError';
            throw err;
        });

        expect(saveToLocalStorage([{ yearMonthDate: '2024-01', projects: [] }])).toBe(false);
    });
});

describe('loadFromLocalStorage', () => {
    it('retourne null quand rien n\'est stocké', () => {
        expect(loadFromLocalStorage()).toBeNull();
    });

    it('relit ce qui a été écrit', () => {
        const data = [{ yearMonthDate: '2024-01', projects: [{ id: 'a' }] }];
        const warnings = [{ propertyId: 'a' }];
        saveToLocalStorage(data, warnings);

        expect(loadFromLocalStorage()).toEqual({ data, warnings });
    });

    it('migre l\'ancien format (tableau nu)', () => {
        const legacy = [{ yearMonthDate: '2024-01', projects: [] }];
        localStorage.setItem(KEY, JSON.stringify(legacy));

        expect(loadFromLocalStorage()).toEqual({ data: legacy, warnings: [] });
    });

    it('complète les warnings absents du nouveau format', () => {
        localStorage.setItem(KEY, JSON.stringify({ data: [] }));

        expect(loadFromLocalStorage()).toEqual({ data: [], warnings: [] });
    });

    it('purge un JSON corrompu', () => {
        localStorage.setItem(KEY, '{ceci n\'est pas du json');

        expect(loadFromLocalStorage()).toBeNull();
        expect(localStorage.getItem(KEY)).toBeNull();
    });

    it('purge un format valide mais inattendu', () => {
        localStorage.setItem(KEY, JSON.stringify({ nope: 1 }));

        expect(loadFromLocalStorage()).toBeNull();
        expect(localStorage.getItem(KEY)).toBeNull();
    });
});

describe('clearLocalStorage / hasStoredData', () => {
    it('détecte la présence de données', () => {
        expect(hasStoredData()).toBe(false);
        saveToLocalStorage([{ yearMonthDate: '2024-01', projects: [] }]);
        expect(hasStoredData()).toBe(true);
    });

    it('efface les données', () => {
        saveToLocalStorage([{ yearMonthDate: '2024-01', projects: [] }]);

        expect(clearLocalStorage()).toBe(true);
        expect(hasStoredData()).toBe(false);
    });
});
