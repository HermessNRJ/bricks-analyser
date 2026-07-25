import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { updateUI, updatePropertySortAndFilter } from '../src/ui/uiUpdater.js';

/**
 * Reproduit le squelette DOM dont uiUpdater a besoin (voir index.html).
 */
function setupDOM() {
    document.body.innerHTML = `
        <div id="results" class="hidden">
            <div class="stat-value" id="totalBricks"></div>
            <div class="stat-value" id="totalInvestment"></div>
            <div class="stat-value" id="monthlyRevenue"></div>
            <div class="stat-value" id="totalProperties"></div>
            <div class="stat-value" id="totalNetRevenueSinceBeginning"></div>
            <div class="stat-value" id="totalTaxesSinceBeginning"></div>
            <div class="stat-value" id="refundedProjectsCountValue"></div>
            <div class="stat-value" id="fundingProjectsCountValue"></div>
            <div id="projectedRevenuesDisplay"></div>
            <select id="propertyCountryFilter"><option value="all">Tous les pays</option></select>
            <span id="propertyCount">0</span>
            <div id="propertiesList"></div>
        </div>
    `;
}

function property(overrides = {}) {
    return {
        id: 'p1',
        name: 'Immeuble Lyon',
        address: '1 rue de la Paix',
        country: 'France',
        ownedBricks: 10,
        investment: 100,
        yearlyReturn: 12,
        monthlyRevenue: 0.7,
        isRefunded: false,
        projectStatus: 'financed',
        revenueStartDate: '2024-01',
        refundDate: '2026-01',
        thumbnailUrl: '',
        warnings: [],
        warningsCount: 0,
        ...overrides
    };
}

function results(properties, netRevenueEvolutionData = {}) {
    return {
        totalBricks: 10,
        totalInvestment: 100,
        monthlyRevenue: 0.7,
        activePropertiesCount: properties.filter(p => !p.isRefunded).length,
        totalNetRevenueSinceBeginning: 4.2,
        totalTaxesSinceBeginning: 1.8,
        refundedProjectsCount: properties.filter(p => p.isRefunded).length,
        fundingOrUpcomingProjectsCount: 0,
        properties,
        netRevenueEvolutionData
    };
}

const cards = () => [...document.querySelectorAll('#propertiesList .property-card')];
const cardNames = () => cards().map(c => c.querySelector('.property-name').textContent.trim());

beforeEach(() => {
    localStorage.clear();
    setupDOM();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2024, 5, 15)); // juin 2024
});

afterEach(() => {
    vi.useRealTimers();
});

describe('updateUI — cartes de statistiques', () => {
    it('remplit les compteurs', () => {
        updateUI(results([property()]));

        expect(document.getElementById('totalBricks').textContent).toBe('10');
        expect(document.getElementById('totalProperties').textContent).toBe('1');
        expect(document.getElementById('totalInvestment').textContent).toMatch(/100/);
    });
});

describe('updateUI — sécurité du rendu', () => {
    it('échappe un nom de propriété contenant du HTML', () => {
        updateUI(results([property({ name: '<img src=x onerror=alert(1)>' })]));

        const list = document.getElementById('propertiesList');
        expect(list.querySelector('img[onerror]')).toBeNull();
        expect(list.textContent).toContain('<img src=x onerror=alert(1)>');
    });

    it('échappe une adresse contenant du HTML', () => {
        updateUI(results([property({ address: '</div><script>alert(1)</script>' })]));

        expect(document.querySelector('#propertiesList script')).toBeNull();
    });

    it('échappe la description d\'un warning', () => {
        updateUI(results([property({
            warningsCount: 1,
            warnings: [{ date: '2024-06-01', description: '<b>gras</b> & <script>alert(1)</script>' }]
        })]));

        const list = document.getElementById('propertiesList');
        expect(list.querySelector('script')).toBeNull();
        expect(list.querySelector('b')).toBeNull();
        expect(list.textContent).toContain('alert(1)');
    });

    it('ignore une miniature en javascript:', () => {
        updateUI(results([property({ thumbnailUrl: 'javascript:alert(1)' })]));

        expect(document.querySelector('#propertiesList img')).toBeNull();
    });

    it('affiche une miniature https', () => {
        updateUI(results([property({ thumbnailUrl: 'https://cdn.bricks.co/a.png' })]));

        expect(document.querySelector('#propertiesList img').getAttribute('src'))
            .toBe('https://cdn.bricks.co/a.png');
    });

    it('n\'utilise pas de handler onclick inline', () => {
        updateUI(results([property()]));

        const card = cards()[0];
        expect(card.getAttribute('onclick')).toBeNull();
        expect(card.dataset.projectUrl).toBe('https://app.bricks.co/project/p1');
    });

    it('ouvre la fiche Bricks au clic sur la carte', () => {
        const open = vi.fn();
        vi.stubGlobal('open', open);

        updateUI(results([property()]));
        cards()[0].querySelector('.property-name').click();

        expect(open).toHaveBeenCalledWith('https://app.bricks.co/project/p1', '_blank', 'noopener');
        vi.unstubAllGlobals();
    });
});

describe('updateUI — tri', () => {
    const jeu = () => [
        property({ id: 'a', name: 'Alpha', investment: 300, ownedBricks: 30, yearlyReturn: 5, monthlyRevenue: 3, revenueStartDate: '2024-03' }),
        property({ id: 'b', name: 'Bravo', investment: 100, ownedBricks: 10, yearlyReturn: 9, monthlyRevenue: 1, revenueStartDate: '2024-01' }),
        property({ id: 'c', name: 'Charlie', investment: 200, ownedBricks: 20, yearlyReturn: 7, monthlyRevenue: 2, revenueStartDate: '2024-02' })
    ];

    it('trie par investissement décroissant par défaut', () => {
        updateUI(results(jeu()));
        expect(cardNames()).toEqual(['Alpha', 'Charlie', 'Bravo']);
    });

    it.each([
        ['investment-asc', ['Bravo', 'Charlie', 'Alpha']],
        ['bricks-desc', ['Alpha', 'Charlie', 'Bravo']],
        ['return-desc', ['Bravo', 'Charlie', 'Alpha']],
        ['revenue-asc', ['Bravo', 'Charlie', 'Alpha']],
        ['name-asc', ['Alpha', 'Bravo', 'Charlie']],
        ['name-desc', ['Charlie', 'Bravo', 'Alpha']],
        ['revenuestart-asc', ['Bravo', 'Charlie', 'Alpha']],
        ['revenuestart-desc', ['Alpha', 'Charlie', 'Bravo']]
    ])('trie selon %s', (critere, attendu) => {
        updateUI(results(jeu()));
        updatePropertySortAndFilter(critere, undefined, undefined, undefined, undefined);

        expect(cardNames()).toEqual(attendu);
    });

    it('place les propriétés sans date de versement en fin de tri', () => {
        updateUI(results([
            property({ id: 'a', name: 'Avec', revenueStartDate: '2024-01' }),
            property({ id: 'b', name: 'Sans', revenueStartDate: null })
        ]));
        updatePropertySortAndFilter('revenuestart-asc', undefined, undefined, undefined, undefined);

        expect(cardNames()).toEqual(['Avec', 'Sans']);
    });

    it('persiste le critère de tri dans localStorage', () => {
        updateUI(results(jeu()));
        updatePropertySortAndFilter('name-asc', undefined, undefined, undefined, undefined);

        expect(localStorage.getItem('propertySortBy')).toBe('name-asc');
    });

    it('relit le critère persisté au rendu suivant', () => {
        localStorage.setItem('propertySortBy', 'name-desc');
        updateUI(results(jeu()));

        expect(cardNames()).toEqual(['Charlie', 'Bravo', 'Alpha']);
    });
});

describe('updateUI — filtres', () => {
    const jeu = () => [
        property({ id: 'a', name: 'Active', projectStatus: 'financed' }),
        property({ id: 'b', name: 'Remboursee', isRefunded: true, investment: 0 }),
        property({ id: 'c', name: 'Financement', projectStatus: 'ongoing' }),
        property({ id: 'd', name: 'AVenir', projectStatus: 'upcoming' })
    ];

    it.each([
        ['all', 4],
        ['active', 1],
        ['refunded', 1],
        ['ongoing', 1],
        ['upcoming', 1]
    ])('filtre par statut %s', (filtre, attendu) => {
        updateUI(results(jeu()));
        updatePropertySortAndFilter(undefined, filtre, undefined, undefined, undefined);

        expect(cards()).toHaveLength(attendu);
        expect(document.getElementById('propertyCount').textContent).toBe(String(attendu));
    });

    it.each([
        ['has-revenue-date', 1],
        ['no-revenue-date', 1],
        ['has-refund-date', 1],
        ['no-refund-date', 1]
    ])('filtre par date %s', (filtre, attendu) => {
        updateUI(results([
            property({ id: 'a', revenueStartDate: '2024-01', refundDate: '2026-01' }),
            property({ id: 'b', revenueStartDate: null, refundDate: null })
        ]));
        updatePropertySortAndFilter(undefined, undefined, filtre, undefined, undefined);

        expect(cards()).toHaveLength(attendu);
    });

    it('filtre par présence de warning', () => {
        updateUI(results([
            property({ id: 'a', warningsCount: 2, warnings: [{ date: '2024-06-01', description: 'x' }] }),
            property({ id: 'b' })
        ]));

        updatePropertySortAndFilter(undefined, undefined, undefined, 'has-warning', undefined);
        expect(cards()).toHaveLength(1);

        updatePropertySortAndFilter(undefined, undefined, undefined, 'no-warning', undefined);
        expect(cards()).toHaveLength(1);
    });

    it('distingue warning du dernier mois et du mois précédent', () => {
        updateUI(results([
            property({ id: 'recent', warningsCount: 1, warnings: [{ date: '2024-06-01', description: 'x' }] }),
            property({ id: 'avant', warningsCount: 1, warnings: [{ date: '2024-04-20', description: 'x' }] })
        ]));

        updatePropertySortAndFilter(undefined, undefined, undefined, 'warning-last-month', undefined);
        expect(cards()).toHaveLength(1);

        updatePropertySortAndFilter(undefined, undefined, undefined, 'warning-month-before', undefined);
        expect(cards()).toHaveLength(1);
    });

    it('alimente le filtre pays avec les pays présents', () => {
        updateUI(results([
            property({ id: 'a', country: 'France' }),
            property({ id: 'b', country: 'Portugal' }),
            property({ id: 'c', country: 'France' })
        ]));

        const options = [...document.getElementById('propertyCountryFilter').options].map(o => o.value);
        expect(options).toEqual(['all', 'France', 'Portugal']);
    });

    it('filtre par pays', () => {
        updateUI(results([
            property({ id: 'a', country: 'France' }),
            property({ id: 'b', country: 'Portugal' })
        ]));
        updatePropertySortAndFilter(undefined, undefined, undefined, undefined, 'Portugal');

        expect(cards()).toHaveLength(1);
    });

    it('combine les filtres statut et pays', () => {
        updateUI(results([
            property({ id: 'a', country: 'France', projectStatus: 'financed' }),
            property({ id: 'b', country: 'Portugal', projectStatus: 'financed' }),
            property({ id: 'c', country: 'Portugal', projectStatus: 'ongoing' })
        ]));
        updatePropertySortAndFilter(undefined, 'active', undefined, undefined, 'Portugal');

        expect(cards()).toHaveLength(1);
    });
});

describe('updateUI — projections', () => {
    it('affiche 4 mois glissants à partir du mois courant', () => {
        updateUI(results([property()], {
            '2024-06': 10,
            '2024-07': 20,
            '2024-08': 30,
            '2024-09': 40
        }));

        const projections = document.querySelectorAll('#projectedRevenuesDisplay .stat-card');
        expect(projections).toHaveLength(4);
        expect(projections[0].textContent).toContain('Ce Mois-ci');
        expect(projections[3].textContent).toContain('M+3');
        expect(projections[1].textContent).toMatch(/20/);
    });

    it('affiche N/D pour un mois sans donnée', () => {
        updateUI(results([property()], {}));

        const projections = document.querySelectorAll('#projectedRevenuesDisplay .stat-card');
        expect(projections[0].textContent).toContain('N/D');
    });

    it('ne cumule pas les cartes entre deux rendus', () => {
        updateUI(results([property()], { '2024-06': 10 }));
        updateUI(results([property()], { '2024-06': 10 }));

        expect(document.querySelectorAll('#projectedRevenuesDisplay .stat-card')).toHaveLength(4);
    });
});
