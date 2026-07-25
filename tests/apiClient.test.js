import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
    fetchFinancedProjects,
    fetchAllProjects,
    fetchWarnings,
    mergeAPIProjects
} from '../src/data/apiClient.js';
import { CONFIG } from '../src/core/config.js';

function mockFetch(impl) {
    const fn = vi.fn(impl);
    vi.stubGlobal('fetch', fn);
    return fn;
}

const jsonResponse = (body, init = {}) => ({
    ok: init.status === undefined || (init.status >= 200 && init.status < 300),
    status: init.status ?? 200,
    statusText: init.statusText ?? 'OK',
    json: async () => body
});

beforeEach(() => {
    vi.restoreAllMocks();
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('fetchFinancedProjects', () => {
    it('appelle le bon endpoint avec le Bearer token', async () => {
        const fetchMock = mockFetch(async () => jsonResponse([{ yearMonthDate: '2024-01' }]));

        const data = await fetchFinancedProjects('tok123');

        expect(data).toEqual([{ yearMonthDate: '2024-01' }]);
        const [url, options] = fetchMock.mock.calls[0];
        expect(url).toBe(`${CONFIG.API_BASE_URL}${CONFIG.API_ENDPOINTS.FINANCED}`);
        expect(options.headers.Authorization).toBe('Bearer tok123');
    });

    it('remonte une erreur explicite sur 401', async () => {
        mockFetch(async () => jsonResponse({ message: 'Unauthorized' }, { status: 401 }));

        await expect(fetchFinancedProjects('bad')).rejects.toThrow(/401.*Unauthorized/);
    });

    it('retombe sur le statusText si le corps d\'erreur n\'est pas du JSON', async () => {
        mockFetch(async () => ({
            ok: false,
            status: 500,
            statusText: 'Internal Server Error',
            json: async () => { throw new Error('not json'); }
        }));

        await expect(fetchFinancedProjects('tok')).rejects.toThrow(/500.*Internal Server Error/);
    });

    it('propage une panne réseau', async () => {
        mockFetch(async () => { throw new TypeError('Failed to fetch'); });

        await expect(fetchFinancedProjects('tok')).rejects.toThrow('Failed to fetch');
    });
});

describe('fetchAllProjects', () => {
    it('retourne les projets ongoing et upcoming', async () => {
        const payload = {
            ongoing: { projects: [{ id: 'a' }] },
            upcoming: { projects: [{ id: 'b' }] }
        };
        mockFetch(async () => jsonResponse(payload));

        await expect(fetchAllProjects('tok')).resolves.toEqual(payload);
    });

    it('remonte une erreur contextualisée', async () => {
        mockFetch(async () => jsonResponse({ message: 'boom' }, { status: 403 }));

        await expect(fetchAllProjects('tok')).rejects.toThrow(/projets en cours/);
    });
});

describe('fetchWarnings', () => {
    it('retourne la liste des warnings', async () => {
        mockFetch(async () => jsonResponse([{ propertyId: 'a' }]));

        await expect(fetchWarnings('tok')).resolves.toEqual([{ propertyId: 'a' }]);
    });

    it('ne bloque pas l\'application en cas d\'échec', async () => {
        mockFetch(async () => jsonResponse({ message: 'nope' }, { status: 500 }));

        await expect(fetchWarnings('tok')).resolves.toEqual([]);
    });

    it('normalise une réponse vide', async () => {
        mockFetch(async () => jsonResponse(null));

        await expect(fetchWarnings('tok')).resolves.toEqual([]);
    });
});

describe('mergeAPIProjects', () => {
    it('conserve les projets financés', () => {
        const financed = [{ yearMonthDate: '2024-01', projects: [{ id: 'a' }] }];

        const merged = mergeAPIProjects(financed, {});

        expect(merged).toEqual(financed);
    });

    it('ajoute les projets ongoing/upcoming où l\'utilisateur détient des briques', () => {
        const merged = mergeAPIProjects([], {
            ongoing: { projects: [{ id: 'o', ownedBricks: 3 }] },
            upcoming: { projects: [{ id: 'u', ownedBricks: 1 }] }
        });

        expect(merged).toHaveLength(2);
        expect(merged[0].projects[0].projectStatus).toBe('ongoing');
        expect(merged[1].projects[0].projectStatus).toBe('upcoming');
    });

    it('écarte les projets sans brique possédée', () => {
        const merged = mergeAPIProjects([], {
            ongoing: { projects: [{ id: 'o', ownedBricks: 0 }, { id: 'o2' }] },
            upcoming: { projects: [] }
        });

        expect(merged).toEqual([]);
    });

    it('tolère une réponse partielle', () => {
        expect(mergeAPIProjects([], { ongoing: null, upcoming: undefined })).toEqual([]);
        expect(mergeAPIProjects([], { ongoing: {} })).toEqual([]);
    });
});
