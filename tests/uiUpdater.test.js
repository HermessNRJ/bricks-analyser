import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { updateUI, updatePropertySortAndFilter } from '../src/ui/uiUpdater.js';
import { niveauRisque } from '../src/business/riskAnalysis.js';

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
            <div id="projectionsNote"></div>
            <div id="projectedRevenuesDisplay"></div>
            <section class="rendement-section hidden" id="rendementSection">
                <p id="rendementResume"></p>
                <div id="rendementFenetres"></div>
                <p id="rendementNote"></p>
            </section>
            <select id="propertyCountryFilter"><option value="all">Tous les pays</option></select>
            <span id="propertyCount">0</span>
            <div id="activeFilters"></div>
            <div id="propertiesList"></div>
        </div>
    `;
}

function property(overrides = {}) {
    // calculateInvestmentStats attache le niveau de risque à chaque propriété :
    // la fixture doit en faire autant, sinon elle teste un objet que la
    // production ne produit jamais.
    const base = {
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

    return { ...base, niveauRisque: base.niveauRisque || niveauRisque(base) };
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
        updatePropertySortAndFilter({ sortBy: critere });

        expect(cardNames()).toEqual(attendu);
    });

    it('place les propriétés sans date de versement en fin de tri', () => {
        updateUI(results([
            property({ id: 'a', name: 'Avec', revenueStartDate: '2024-01' }),
            property({ id: 'b', name: 'Sans', revenueStartDate: null })
        ]));
        updatePropertySortAndFilter({ sortBy: 'revenuestart-asc' });

        expect(cardNames()).toEqual(['Avec', 'Sans']);
    });

    it('persiste le critère de tri dans localStorage', () => {
        updateUI(results(jeu()));
        updatePropertySortAndFilter({ sortBy: 'name-asc' });

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
        updatePropertySortAndFilter({ filter: filtre });

        expect(cards()).toHaveLength(attendu);
        expect(document.getElementById('propertyCount').textContent).toBe(String(attendu));
    });


    it('filtre par présence de warning', () => {
        updateUI(results([
            property({ id: 'a', warningsCount: 2, warnings: [{ date: '2024-06-01', description: 'x' }] }),
            property({ id: 'b' })
        ]));

        updatePropertySortAndFilter({ warningFilter: 'has-warning' });
        expect(cards()).toHaveLength(1);

        updatePropertySortAndFilter({ warningFilter: 'no-warning' });
        expect(cards()).toHaveLength(1);
    });

    it('distingue warning du dernier mois et du mois précédent', () => {
        updateUI(results([
            property({ id: 'recent', warningsCount: 1, warnings: [{ date: '2024-06-01', description: 'x' }] }),
            property({ id: 'avant', warningsCount: 1, warnings: [{ date: '2024-04-20', description: 'x' }] })
        ]));

        updatePropertySortAndFilter({ warningFilter: 'warning-last-month' });
        expect(cards()).toHaveLength(1);

        updatePropertySortAndFilter({ warningFilter: 'warning-month-before' });
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
        updatePropertySortAndFilter({ countryFilter: 'Portugal' });

        expect(cards()).toHaveLength(1);
    });

    it('combine les filtres statut et pays', () => {
        updateUI(results([
            property({ id: 'a', country: 'France', projectStatus: 'financed' }),
            property({ id: 'b', country: 'Portugal', projectStatus: 'financed' }),
            property({ id: 'c', country: 'Portugal', projectStatus: 'ongoing' })
        ]));
        updatePropertySortAndFilter({ filter: 'active', countryFilter: 'Portugal' });

        expect(cards()).toHaveLength(1);
    });
});

describe('updateUI — projections', () => {
    it('affiche les mois tant que le montant change', () => {
        updateUI(results([property()], {
            '2024-06': 10,
            '2024-07': 20,
            '2024-08': 30,
            '2024-09': 40
        }));

        const projections = document.querySelectorAll('#projectedRevenuesDisplay .stat-card');
        expect(projections).toHaveLength(4);
        expect(projections[0].textContent).toContain('Ce mois-ci');
        expect(projections[1].textContent).toMatch(/20/);
    });

    it('s\'arrête au dernier changement plutôt que de répéter le même montant', () => {
        // Le cas réel : un projet commence à verser en M+1, puis plus rien ne bouge
        updateUI(results([property()], {
            '2024-06': 10,
            '2024-07': 20,
            '2024-08': 20,
            '2024-09': 20
        }));

        const projections = document.querySelectorAll('#projectedRevenuesDisplay .stat-card');
        expect(projections).toHaveLength(2);
        expect(document.getElementById('projectionsNote').textContent).toMatch(/Stable à partir de/);
    });

    it('n\'affiche qu\'un mois quand le montant ne bouge jamais', () => {
        updateUI(results([property()], {
            '2024-06': 10, '2024-07': 10, '2024-08': 10, '2024-09': 10
        }));

        expect(document.querySelectorAll('#projectedRevenuesDisplay .stat-card')).toHaveLength(1);
        expect(document.getElementById('projectionsNote').textContent).toMatch(/reste stable/);
    });

    it('affiche N/D pour un mois sans donnée', () => {
        updateUI(results([property()], {}));

        const projections = document.querySelectorAll('#projectedRevenuesDisplay .stat-card');
        expect(projections[0].textContent).toContain('N/D');
    });

    it('ne cumule pas les cartes entre deux rendus', () => {
        updateUI(results([property()], { '2024-06': 10 }));
        updateUI(results([property()], { '2024-06': 10 }));

        expect(document.querySelectorAll('#projectedRevenuesDisplay .stat-card')).toHaveLength(1);
    });
});

describe('updateUI — rendement annualisé', () => {
    function fenetre(overrides = {}) {
        return {
            fenetre: 12,
            libelle: '12 mois',
            mois: ['2023-07', '2023-08', '2023-09', '2023-10', '2023-11', '2023-12',
                '2024-01', '2024-02', '2024-03', '2024-04', '2024-05', '2024-06'],
            net: 120,
            brut: 180,
            horsCoupons: 0,
            capitalRendu: 0,
            capitalMoyen: 2000,
            taux: 6,
            tauxBrut: 9,
            ...overrides
        };
    }

    function avecRendements(rendements) {
        return { ...results([property()]), rendements };
    }

    const tuiles = () => [...document.querySelectorAll('.rendement-fenetre')];

    it('reste caché faute de fenêtre mesurable', () => {
        updateUI(avecRendements(null));

        expect(document.getElementById('rendementSection').classList.contains('hidden')).toBe(true);
    });

    it('affiche le net en grand et le brut juste dessous', () => {
        updateUI(avecRendements({ fenetres: [fenetre()], dernierMois: '2024-06', journalLu: true }));

        const tuile = tuiles()[0];
        expect(tuile.querySelector('.rendement-taux').textContent).toMatch(/6,0/);
        expect(tuile.querySelector('.rendement-taux-brut').textContent).toMatch(/9,0/);
        expect(tuile.querySelector('.rendement-taux-brut').textContent).toContain('brut');
    });

    // Le brut du simulateur et le net d'ici prétendaient tous deux dire ce que
    // rapporte le portefeuille, sans que rien à l'écran ne les distingue.
    it('mensualise les montants, nets et bruts', () => {
        updateUI(avecRendements({ fenetres: [fenetre()], dernierMois: '2024-06', journalLu: true }));

        const montants = tuiles()[0].querySelectorAll('.rendement-montants span');
        expect(montants).toHaveLength(2);
        expect(montants[0].textContent).toMatch(/10,00/);      // 120 € sur 12 mois
        expect(montants[0].textContent).toContain('nets par mois');
        expect(montants[1].textContent).toMatch(/15,00/);      // 180 € sur 12 mois
        expect(montants[1].textContent).toContain('bruts');
    });

    it('divise par le nombre de mois de la fenêtre, pas par douze', () => {
        const trois = fenetre({
            fenetre: 3, libelle: '3 mois', mois: ['2024-04', '2024-05', '2024-06'],
            net: 30, brut: 45
        });

        updateUI(avecRendements({ fenetres: [trois], dernierMois: '2024-06', journalLu: true }));

        expect(tuiles()[0].querySelector('.rendement-montants span').textContent).toMatch(/10,00/);
    });

    it('qualifie le taux du résumé de net', () => {
        updateUI(avecRendements({
            fenetres: [fenetre({ fenetre: 1, libelle: '1 mois', mois: ['2024-06'], taux: 4 }), fenetre()],
            dernierMois: '2024-06',
            journalLu: true
        }));

        expect(document.getElementById('rendementResume').textContent).toContain('net');
    });

    it('renvoie à la ligne brute pour la comparaison avec la promesse Bricks', () => {
        updateUI(avecRendements({
            fenetres: [fenetre()], dernierMois: '2024-06', journalLu: true, tauxPromis: 10
        }));

        const note = document.getElementById('rendementNote').textContent;
        expect(note).toContain('ligne brute');
        expect(note).toMatch(/10,0/);
    });

    it('ne cumule pas les tuiles entre deux rendus', () => {
        const rendements = { fenetres: [fenetre()], dernierMois: '2024-06', journalLu: true };

        updateUI(avecRendements(rendements));
        updateUI(avecRendements(rendements));

        expect(tuiles()).toHaveLength(1);
    });
});

describe('updateUI — filtres de risque', () => {
    const enProcedure = { date: '2026-01-01', description: 'Une mise en demeure a été envoyée' };

    it('ne retient que les propriétés en procédure', () => {
        updateUI(results([
            property({ id: 'a', name: 'Alpha', warnings: [enProcedure], warningsCount: 1 }),
            property({ id: 'b', name: 'Bravo' })
        ]));
        updatePropertySortAndFilter({ warningFilter: 'risk-procedure' });

        expect(cardNames()).toEqual(['Alpha']);
    });

    it('écarte une propriété remboursée, comme la tuile qui compte les incidents', () => {
        // La tuile exclut les remboursées : le raccourci « Voir » doit montrer
        // exactement les fiches derrière le chiffre, sans en ajouter une.
        updateUI(results([
            property({ id: 'a', name: 'Active', warnings: [enProcedure], warningsCount: 1 }),
            property({ id: 'b', name: 'Soldée', isRefunded: true, investment: 0, warnings: [enProcedure], warningsCount: 1 })
        ]));
        updatePropertySortAndFilter({ warningFilter: 'risk-procedure' });

        expect(cardNames()).toEqual(['Active']);
        expect(document.getElementById('propertyCount').textContent).toBe('1');
    });
});

describe('updateUI — alerte du mois en cours', () => {
    // L'horloge des tests est figée au 15 juin 2024
    const alerte = (date) => ({ date, description: 'Point de suivi' });

    it('retient une alerte datée du mois calendaire en cours', () => {
        updateUI(results([
            property({ id: 'a', name: 'CeMois', warningsCount: 1, warnings: [alerte('2024-06-03')] }),
            property({ id: 'b', name: 'Avant', warningsCount: 1, warnings: [alerte('2024-05-28')] })
        ]));
        updatePropertySortAndFilter({ warningFilter: 'warning-current-month' });

        expect(cardNames()).toEqual(['CeMois']);
    });

    it('se distingue des 30 jours glissants', () => {
        // Le 28 mai est dans les 30 derniers jours au 15 juin, mais pas dans
        // le mois en cours : les deux filtres ne doivent pas se confondre.
        updateUI(results([property({ id: 'b', name: 'Avant', warningsCount: 1, warnings: [alerte('2024-05-28')] })]));

        updatePropertySortAndFilter({ warningFilter: 'warning-last-month' });
        expect(cardNames()).toEqual(['Avant']);

        updatePropertySortAndFilter({ warningFilter: 'warning-current-month' });
        expect(cardNames()).toEqual([]);
    });

    it('ignore une date illisible', () => {
        updateUI(results([property({ id: 'a', name: 'Cassee', warningsCount: 1, warnings: [alerte('pas-une-date')] })]));
        updatePropertySortAndFilter({ warningFilter: 'warning-current-month' });

        expect(cardNames()).toEqual([]);
    });

    it('affiche une puce nommée pour ce filtre', () => {
        updateUI(results([property({ warningsCount: 1, warnings: [alerte('2024-06-03')] })]));
        updatePropertySortAndFilter({ warningFilter: 'warning-current-month' });

        const puces = [...document.querySelectorAll('#activeFilters .puce')].map(p => p.textContent.trim());
        expect(puces.join(' ')).toContain('Alerte ce mois-ci');
    });
});
