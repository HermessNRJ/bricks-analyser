/**
 * Choix et ordre des propriétés du registre
 *
 * Ces fonctions n'avaient aucun test : elles lisaient huit variables de module
 * de registre.js, dont cinq sans même les prendre en paramètre, et ne pouvaient
 * donc s'appeler que depuis une page vivante. Devenues pures, elles s'éprouvent
 * critère par critère — et c'est le seul endroit du registre où une erreur ne
 * se voit pas : une propriété écartée à tort disparaît sans rien dire.
 */

import { describe, it, expect } from 'vitest';
import { filterProperties, sortProperties, matchesSearch } from '../src/ui/registre/filtrage.js';
import { NIVEAUX_RISQUE } from '../src/business/riskAnalysis.js';

const bien = (id, extra = {}) => ({
    id,
    name: `Bien ${id}`,
    address: `1 rue ${id}`,
    investment: 100,
    ownedBricks: 10,
    yearlyReturn: 8,
    monthlyRevenue: 5,
    warningsCount: 0,
    isRefunded: false,
    projectStatus: 'financed',
    niveauRisque: NIVEAUX_RISQUE.SAIN,
    country: 'France',
    geo: { region: 'Occitanie', departement: '46', ville: 'Cahors' },
    ...extra
});

const noms = (liste) => liste.map(p => p.id);

describe('filterProperties — sans critère', () => {
    it('rend la liste entière', () => {
        const liste = [bien('a'), bien('b')];

        expect(filterProperties(liste)).toEqual(liste);
        expect(filterProperties(liste, {})).toEqual(liste);
    });
});

describe('filterProperties — statut', () => {
    const liste = [
        bien('active'),
        bien('soldee', { isRefunded: true }),
        bien('financement', { projectStatus: 'ongoing' }),
        bien('avenir', { projectStatus: 'upcoming' })
    ];

    it('ne garde que les actives', () => {
        expect(noms(filterProperties(liste, { statut: 'active' }))).toEqual(['active']);
    });

    it('ne garde que les remboursées', () => {
        expect(noms(filterProperties(liste, { statut: 'refunded' }))).toEqual(['soldee']);
    });

    it('distingue le financement de l\'à-venir', () => {
        expect(noms(filterProperties(liste, { statut: 'ongoing' }))).toEqual(['financement']);
        expect(noms(filterProperties(liste, { statut: 'upcoming' }))).toEqual(['avenir']);
    });
});

describe('filterProperties — alertes et risque', () => {
    const liste = [
        bien('sain'),
        bien('alerte', { warningsCount: 2 }),
        bien('defaut', { niveauRisque: NIVEAUX_RISQUE.PROCEDURE }),
        bien('impaye', { niveauRisque: NIVEAUX_RISQUE.IMPAYE }),
        bien('soldeEnDefaut', { niveauRisque: NIVEAUX_RISQUE.PROCEDURE, isRefunded: true })
    ];

    it('sépare ce qui porte une alerte de ce qui n\'en porte pas', () => {
        expect(noms(filterProperties(liste, { alerte: 'has-warning' }))).toEqual(['alerte']);
        expect(noms(filterProperties(liste, { alerte: 'no-warning' })))
            .toEqual(['sain', 'defaut', 'impaye', 'soldeEnDefaut']);
    });

    it('écarte les remboursées des filtres de risque', () => {
        // Un projet soldé ne porte plus de risque : le raccourci « Voir » doit
        // montrer exactement les fiches derrière le chiffre annoncé.
        expect(noms(filterProperties(liste, { alerte: 'risk-procedure' }))).toEqual(['defaut']);
        expect(noms(filterProperties(liste, { alerte: 'risk-impaye' }))).toEqual(['impaye']);
    });
});

describe('filterProperties — géographie', () => {
    const liste = [
        bien('cahors'),
        bien('toulouse', { geo: { region: 'Occitanie', departement: '31', ville: 'Toulouse' } }),
        bien('rennes', { geo: { region: 'Bretagne', departement: '35', ville: 'Rennes' } }),
        bien('porto', { country: 'Portugal', geo: {} })
    ];

    it('filtre par pays', () => {
        expect(noms(filterProperties(liste, { pays: 'Portugal' }))).toEqual(['porto']);
    });

    it('filtre par région, puis par département', () => {
        expect(noms(filterProperties(liste, { region: 'Occitanie' }))).toEqual(['cahors', 'toulouse']);
        expect(noms(filterProperties(liste, { departement: '31' }))).toEqual(['toulouse']);
    });

    it('filtre par commune, comme le fait un clic sur la carte', () => {
        // La clé est celle de cleLieu : département/ville, pour que la ligne du
        // tableau et le registre comptent forcément les mêmes biens.
        expect(noms(filterProperties(liste, { lieu: '46/Cahors' }))).toEqual(['cahors']);
    });
});

describe('filterProperties — recherche libre', () => {
    const liste = [
        bien('villa', { name: 'Villa Aurore', address: '3 chemin des Cyprès' }),
        bien('immeuble', { name: 'Immeuble Verdun', address: '10 rue de la Villa' })
    ];

    it('cherche dans le nom comme dans l\'adresse', () => {
        expect(noms(filterProperties(liste, { recherche: 'villa' }))).toEqual(['villa', 'immeuble']);
        expect(noms(filterProperties(liste, { recherche: 'aurore' }))).toEqual(['villa']);
        expect(noms(filterProperties(liste, { recherche: 'cyprès' }))).toEqual(['villa']);
    });

    it('ignore la casse et une recherche vide', () => {
        expect(noms(filterProperties(liste, { recherche: 'VERDUN' }))).toEqual(['immeuble']);
        expect(filterProperties(liste, { recherche: '' })).toHaveLength(2);
    });
});

describe('filterProperties — critères cumulés', () => {
    it('les applique tous, dans n\'importe quel ordre', () => {
        const liste = [
            bien('cible', { warningsCount: 1 }),
            bien('mauvaisePays', { warningsCount: 1, country: 'Portugal' }),
            bien('sansAlerte'),
            bien('soldee', { warningsCount: 1, isRefunded: true })
        ];

        const retenus = filterProperties(liste, {
            statut: 'active',
            alerte: 'has-warning',
            pays: 'France',
            region: 'Occitanie',
            recherche: 'bien'
        });

        expect(noms(retenus)).toEqual(['cible']);
    });
});

describe('filterProperties — versement du mois', () => {
    it('filtre sur l\'état du versement', () => {
        const liste = [
            bien('versee', { versement: { etat: 'versee' } }),
            bien('manquante', { versement: { etat: 'manquante' } }),
            bien('sansVersement')
        ];

        expect(noms(filterProperties(liste, { versement: 'manquante' }))).toEqual(['manquante']);
    });
});

describe('sortProperties', () => {
    const liste = [
        bien('b', { investment: 200, ownedBricks: 20, yearlyReturn: 6, monthlyRevenue: 9, name: 'Bravo', revenueStartDate: '2025-03' }),
        bien('a', { investment: 100, ownedBricks: 30, yearlyReturn: 11, monthlyRevenue: 2, name: 'Alpha', revenueStartDate: '2024-01' }),
        bien('c', { investment: 300, ownedBricks: 10, yearlyReturn: 9, monthlyRevenue: 5, name: 'Charlie', revenueStartDate: '2026-06' })
    ];

    it('classe sur chacun des critères proposés', () => {
        expect(noms(sortProperties(liste, 'investment-desc'))).toEqual(['c', 'b', 'a']);
        expect(noms(sortProperties(liste, 'investment-asc'))).toEqual(['a', 'b', 'c']);
        expect(noms(sortProperties(liste, 'bricks-desc'))).toEqual(['a', 'b', 'c']);
        expect(noms(sortProperties(liste, 'return-desc'))).toEqual(['a', 'c', 'b']);
        expect(noms(sortProperties(liste, 'revenue-desc'))).toEqual(['b', 'c', 'a']);
        expect(noms(sortProperties(liste, 'name-asc'))).toEqual(['a', 'b', 'c']);
        expect(noms(sortProperties(liste, 'name-desc'))).toEqual(['c', 'b', 'a']);
        expect(noms(sortProperties(liste, 'revenuestart-desc'))).toEqual(['c', 'b', 'a']);
    });

    it('renvoie les sans-date à la fin, quel que soit le sens', () => {
        // Une propriété qui n'a pas encore commencé à verser n'a pas sa place
        // en tête d'un classement par date de premier versement.
        const avecTrou = [...liste, bien('sansDate', { revenueStartDate: null })];

        expect(noms(sortProperties(avecTrou, 'revenuestart-asc')).at(-1)).toBe('sansDate');
        expect(noms(sortProperties(avecTrou, 'revenuestart-desc')).at(-1)).toBe('sansDate');
    });

    it('ne touche pas à la liste reçue', () => {
        const original = [...liste];
        sortProperties(liste, 'name-asc');

        expect(liste).toEqual(original);
    });

    it('laisse l\'ordre en place devant un critère inconnu', () => {
        expect(noms(sortProperties(liste, 'inconnu'))).toEqual(['b', 'a', 'c']);
    });
});

describe('matchesSearch', () => {
    it('accepte tout quand le terme est vide', () => {
        expect(matchesSearch(bien('a'), '')).toBe(true);
    });

    it('survit à une propriété sans nom ni adresse', () => {
        expect(matchesSearch({ }, 'villa')).toBe(false);
    });
});
