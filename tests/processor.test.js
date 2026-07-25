import { describe, it, expect, beforeEach, vi } from 'vitest';

// La couche rendu (DOM + Chart.js) n'est pas l'objet de ce test : on l'isole
// pour vérifier uniquement l'orchestration fusion / calcul / persistance.
vi.mock('../src/ui/uiUpdater.js', () => ({
    updateUI: vi.fn(),
    showResults: vi.fn()
}));
vi.mock('../src/charts/chartManager.js', () => ({
    createCharts: vi.fn()
}));

const { processData, finalizeProcessing, handleConfirmDelete, handleKeepAllItems } =
    await import('../src/business/processor.js');
const { state } = await import('../src/core/state.js');
const { loadFromLocalStorage } = await import('../src/data/storage.js');
const { updateUI, showResults } = await import('../src/ui/uiUpdater.js');
const { createCharts } = await import('../src/charts/chartManager.js');

function project(id, overrides = {}) {
    return {
        id,
        name: { fr: `Projet ${id}` },
        ownedBricks: 10,
        brickPrice: 1000,
        yearlyTotalRentabilityPercentage: 12,
        funding: { revenueStartDate: '2024-01' },
        investmentHorizonInMonths: 24,
        ...overrides
    };
}

const month = (yearMonthDate, projects) => ({ yearMonthDate, projects });

beforeEach(() => {
    localStorage.clear();
    state.reset();
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2024, 5, 15));
});

describe('processData — premier import', () => {
    it('calcule, affiche et persiste les données', async () => {
        await processData([month('2024-01', [project('a')])]);

        expect(state.get('allData')).toHaveLength(1);
        expect(updateUI).toHaveBeenCalledOnce();
        expect(createCharts).toHaveBeenCalledOnce();
        expect(showResults).toHaveBeenCalledOnce();
        expect(loadFromLocalStorage().data).toHaveLength(1);
    });

    it('persiste également les warnings', async () => {
        const warnings = [{ propertyId: 'a', date: '2024-06-01', description: 'x' }];

        await processData([month('2024-01', [project('a')])], warnings);

        expect(loadFromLocalStorage().warnings).toEqual(warnings);
    });

    it('rejette un jeu de données vide', async () => {
        await expect(processData([])).rejects.toThrow(/vide ou invalide/);
        expect(updateUI).not.toHaveBeenCalled();
    });

    it('rejette une structure invalide', async () => {
        await expect(processData([{ projects: [] }])).rejects.toThrow(/Format de données invalide/);
        await expect(processData([{ yearMonthDate: '2024-01' }])).rejects.toThrow(/projects/);
    });

    it('n\'écrit rien dans le localStorage en cas de rejet', async () => {
        await expect(processData([])).rejects.toThrow();
        expect(loadFromLocalStorage()).toBeNull();
    });
});

describe('processData — import incrémental', () => {
    it('fusionne avec les données déjà en mémoire', async () => {
        await processData([month('2024-01', [project('a')])]);
        await processData([month('2024-02', [project('a'), project('b')])]);

        const stored = loadFromLocalStorage().data;
        expect(stored.map(m => m.yearMonthDate)).toEqual(['2024-01', '2024-02']);
    });

    it('ouvre la modal quand un projet a disparu, sans finaliser', async () => {
        await processData([month('2024-01', [project('a'), project('b')])]);
        vi.clearAllMocks();

        await processData([month('2024-01', [project('a')])]);

        const modal = state.get('modal');
        expect(modal.isOpen).toBe(true);
        expect(modal.projectIdsToRemove).toEqual(['b']);
        expect(updateUI).not.toHaveBeenCalled();
    });
});

describe('handleConfirmDelete / handleKeepAllItems', () => {
    beforeEach(async () => {
        await processData([month('2024-01', [project('a'), project('b')])]);
        await processData([month('2024-01', [project('a')])]); // ouvre la modal
        vi.clearAllMocks();
    });

    it('supprime les projets confirmés et referme la modal', async () => {
        const results = await handleConfirmDelete(['b']);

        expect(results.properties.map(p => p.id)).toEqual(['a']);
        expect(state.get('modal').isOpen).toBe(false);
        expect(loadFromLocalStorage().data[0].projects.map(p => p.id)).toEqual(['a']);
    });

    it('conserve tous les projets si l\'utilisateur refuse', async () => {
        const results = await handleKeepAllItems();

        expect(results.properties.map(p => p.id).sort()).toEqual(['a', 'b']);
        expect(state.get('modal').isOpen).toBe(false);
    });

    it('échoue proprement sans contexte de données', async () => {
        state.update('modal', { dataContext: null });

        await expect(handleConfirmDelete(['b'])).rejects.toThrow(/contexte de données/);
        await expect(handleKeepAllItems()).rejects.toThrow(/contexte de données/);
    });
});

describe('finalizeProcessing', () => {
    it('retourne les statistiques calculées', async () => {
        const results = await finalizeProcessing([month('2024-01', [project('a')])]);

        expect(results.totalInvestment).toBe(100);
        expect(results.properties).toHaveLength(1);
        expect(state.get('ui')).toMatchObject({ resultsVisible: true, loading: false, error: null });
    });

    it('continue malgré un échec d\'écriture du localStorage', async () => {
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new Error('quota');
        });

        await expect(finalizeProcessing([month('2024-01', [project('a')])])).resolves.toBeDefined();
        expect(updateUI).toHaveBeenCalledOnce();

        vi.restoreAllMocks();
    });
});
