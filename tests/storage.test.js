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
        expect(JSON.parse(localStorage.getItem(KEY)))
            .toEqual({ data, warnings, savedAt: expect.any(String) });
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

        expect(loadFromLocalStorage()).toEqual({ data, warnings, savedAt: expect.any(String) });
    });

    it('migre l\'ancien format (tableau nu)', () => {
        const legacy = [{ yearMonthDate: '2024-01', projects: [] }];
        localStorage.setItem(KEY, JSON.stringify(legacy));

        // L'ancien format est un tableau nu : aucune date n'y figure
        expect(loadFromLocalStorage()).toEqual({ data: legacy, warnings: [], savedAt: null });
    });

    it('complète les warnings absents du nouveau format', () => {
        localStorage.setItem(KEY, JSON.stringify({ data: [] }));

        expect(loadFromLocalStorage()).toEqual({ data: [], warnings: [], savedAt: null });
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

describe('saveToLocalStorage — horodatage', () => {
    it('enregistre la date de récupération', () => {
        saveToLocalStorage([{ yearMonthDate: '2024-01', projects: [] }]);

        const savedAt = JSON.parse(localStorage.getItem(KEY)).savedAt;

        expect(Number.isNaN(new Date(savedAt).getTime())).toBe(false);
    });

    it('relit la date écrite', () => {
        saveToLocalStorage([{ yearMonthDate: '2024-01', projects: [] }]);

        expect(loadFromLocalStorage().savedAt).toBeTruthy();
    });
});

describe('saveToLocalStorage — la date ne rajeunit pas toute seule', () => {
    it('conserve la date existante quand aucune récupération n\'est signalée', () => {
        // Chaque ouverture de page réécrit le cache : sans cette garde,
        // les données afficheraient éternellement « aujourd'hui ».
        const jadis = '2024-01-15T10:00:00.000Z';
        saveToLocalStorage([], [], { dateRecuperation: jadis });

        saveToLocalStorage([{ yearMonthDate: '2024-02', projects: [] }]);

        expect(loadFromLocalStorage().savedAt).toBe(jadis);
    });

    it('adopte la date fournie lors d\'une récupération', () => {
        saveToLocalStorage([], [], { dateRecuperation: '2024-01-15T10:00:00.000Z' });
        saveToLocalStorage([], [], { dateRecuperation: '2024-03-01T08:00:00.000Z' });

        expect(loadFromLocalStorage().savedAt).toBe('2024-03-01T08:00:00.000Z');
    });

    it('horodate la toute première sauvegarde', () => {
        expect(saveToLocalStorage([])).toBe(true);
        expect(loadFromLocalStorage().savedAt).toBeTruthy();
    });
});
