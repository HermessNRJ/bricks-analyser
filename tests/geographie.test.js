/**
 * Déduction de la géographie depuis l'adresse
 *
 * Le code postal est la seule prise sûre, et tout le reste en découle. Ce qui
 * est vérifié ici tient en deux idées : la déduction est juste quand elle
 * conclut, et elle s'abstient quand elle ne peut pas conclure — c'est la
 * seconde qui compte, parce qu'une région devinée serait invérifiable.
 */

import { describe, it, expect } from 'vitest';
import {
    analyserAdresse, departementDuCode, annoterGeographie, agregerParRegion,
    localisations, resumeGeographie, regionsPresentes, departementsPresents,
    cleLieu, libelleLieu, agregerParDepartement, palier, DEPARTEMENTS, IMPRECISE
} from '../src/business/geographie.js';

/** Raccourci : une propriété engagée, située par son adresse */
const bien = (adresse, investment = 1000, extra = {}) => ({
    address: adresse, investment, country: 'France', isRefunded: false, ...extra
});

describe('DEPARTEMENTS', () => {
    it('couvre les 101 départements', () => {
        expect(Object.keys(DEPARTEMENTS)).toHaveLength(101);
    });

    it('donne à chacun un nom et une région', () => {
        Object.entries(DEPARTEMENTS).forEach(([code, valeur]) => {
            expect(valeur, code).toHaveLength(2);
            expect(typeof valeur[0], code).toBe('string');
            expect(typeof valeur[1], code).toBe('string');
        });
    });

    it('n\'a pas de département 20 : la Corse se sépare en 2A et 2B', () => {
        expect(DEPARTEMENTS['20']).toBeUndefined();
        expect(DEPARTEMENTS['2A'][1]).toBe('Corse');
        expect(DEPARTEMENTS['2B'][1]).toBe('Corse');
    });

    it('range chaque collectivité d\'outre-mer dans sa propre région', () => {
        // Les grouper sous un « Outre-mer » commun mêlerait la Guadeloupe et
        // Mayotte, qui n'ont en partage que d'être loin.
        expect(DEPARTEMENTS['971'][1]).toBe('Guadeloupe');
        expect(DEPARTEMENTS['976'][1]).toBe('Mayotte');
    });
});

describe('departementDuCode', () => {
    it('prend les deux premiers chiffres en métropole', () => {
        expect(departementDuCode('06220')).toBe('06');
        expect(departementDuCode('75012')).toBe('75');
    });

    it('en prend trois outre-mer', () => {
        expect(departementDuCode('97400')).toBe('974');
    });

    it('coupe la Corse à 20190', () => {
        expect(departementDuCode('20000')).toBe('2A');
        expect(departementDuCode('20190')).toBe('2A');
        expect(departementDuCode('20200')).toBe('2B');
    });

    it('refuse ce qui n\'est pas cinq chiffres', () => {
        expect(departementDuCode('750')).toBeNull();
        expect(departementDuCode('75012')).toBe('75');
        expect(departementDuCode('abcde')).toBeNull();
        expect(departementDuCode(null)).toBeNull();
    });

    it('refuse un code qui ne désigne aucun département', () => {
        // 98000 est Monaco : cinq chiffres bien formés, hors de France
        expect(departementDuCode('98000')).toBeNull();
    });
});

describe('analyserAdresse', () => {
    it('situe une adresse française ordinaire', () => {
        const geo = analyserAdresse('Chemin des Vignes, 06220 Vallauris');

        expect(geo).toMatchObject({
            codePostal: '06220',
            ville: 'Vallauris',
            departement: '06',
            nomDepartement: 'Alpes-Maritimes',
            region: "Provence-Alpes-Côte d'Azur",
            situe: true
        });
    });

    it('retient le DERNIER groupe de cinq chiffres', () => {
        // Un numéro de rue ou une boîte postale peut en présenter un plus tôt,
        // jamais plus tard : l'adresse française finit sur « code postal, ville ».
        const geo = analyserAdresse('BP 33000, 12 rue X, 69003 Lyon');

        expect(geo.codePostal).toBe('69003');
        expect(geo.ville).toBe('Lyon');
    });

    it('écarte la mention Cedex du nom de commune', () => {
        expect(analyserAdresse('Rue X, 31000 Toulouse Cedex 3').ville).toBe('Toulouse');
        expect(analyserAdresse('Rue X, 31000 Toulouse CEDEX').ville).toBe('Toulouse');
    });

    it('range un bien étranger sous son pays, sans département', () => {
        const geo = analyserAdresse('Rua da Almeida, Lisbonne', 'Portugal');

        expect(geo.region).toBe('Portugal');
        expect(geo.departement).toBeNull();
        expect(geo.situe).toBe(true);
    });

    it('lit la ville étrangère au bout de l\'adresse, pas au début', () => {
        // Une adresse va du plus fin au plus large : « Cais Velho, Setúbal »
        // nomme une rue puis une ville, et prendre le début donnait la rue.
        expect(analyserAdresse('Cais Velho, Setúbal', 'Portugal').ville).toBe('Setúbal');
        expect(analyserAdresse('Paseo Miramar, Malaga', 'Espagne').ville).toBe('Malaga');
    });

    it('ôte le drapeau du nom de ville étrangère', () => {
        expect(analyserAdresse('Rua X, Porto 🇵🇹', 'Portugal').ville).toBe('Porto');
    });

    it('ne devine rien d\'une adresse sans code postal', () => {
        // Une région déduite du seul texte serait invérifiable : mieux vaut
        // compter la lacune que la combler au jugé.
        const geo = analyserAdresse('Quelque part en Occitanie');

        expect(geo.situe).toBe(false);
        expect(geo.region).toBe(IMPRECISE);
        expect(geo.departement).toBeNull();
    });

    it('garde le code postal même quand il ne mène à aucun département', () => {
        const geo = analyserAdresse('Avenue de Monte-Carlo, 98000 Monaco');

        expect(geo.codePostal).toBe('98000');
        expect(geo.situe).toBe(false);
        expect(geo.region).toBe(IMPRECISE);
    });

    it('supporte une adresse absente', () => {
        expect(analyserAdresse(null).situe).toBe(false);
        expect(analyserAdresse(undefined).situe).toBe(false);
    });
});

describe('agrégations', () => {
    const portefeuille = () => annoterGeographie([
        bien('Rue A, 44000 Nantes', 3000),
        bien('Rue B, 44000 Nantes', 1000),
        bien('Rue C, 35000 Rennes', 2000),
        bien('Rue D, 06600 Antibes', 4500),
        bien('Sans code postal', 500),
        // Remboursé : plus aucun capital engagé, donc hors des comptes
        bien('Rue E, 75012 Paris', 0, { isRefunded: true })
    ]);

    it('classe les régions par capital décroissant', () => {
        const regions = agregerParRegion(portefeuille());

        expect(regions.map(r => r.region)).toEqual([
            "Provence-Alpes-Côte d'Azur", 'Pays de la Loire', 'Bretagne', IMPRECISE
        ]);
        expect(regions[0].capital).toBe(4500);
        expect(regions[1].capital).toBe(4000); // les deux biens nantais
    });

    it('rapporte les parts au capital réellement engagé', () => {
        const regions = agregerParRegion(portefeuille());
        const total = regions.reduce((somme, r) => somme + r.part, 0);

        // 11 000 € engagés : le bien remboursé n'entre pas au dénominateur
        expect(total).toBeCloseTo(100, 5);
        expect(regions[0].part).toBeCloseTo(4500 / 11000 * 100, 5);
    });

    it('ne fond jamais l\'imprécis dans une région existante', () => {
        const imprecise = agregerParRegion(portefeuille()).find(r => r.region === IMPRECISE);

        expect(imprecise.capital).toBe(500);
        expect(imprecise.projets).toBe(1);
    });

    it('regroupe deux biens d\'une même commune', () => {
        const lieux = localisations(portefeuille());
        const nantes = lieux.find(l => l.ville === 'Nantes');

        expect(nantes.projets).toBe(2);
        expect(nantes.capital).toBe(4000);
    });

    it('écarte les projets remboursés de tous les comptes', () => {
        const lieux = localisations(portefeuille());

        expect(lieux.some(l => l.ville === 'Paris')).toBe(false);
    });

    it('compte les départements, les communes et ce qu\'il n\'a pas su situer', () => {
        const resume = resumeGeographie(portefeuille());

        expect(resume.departements).toBe(3);
        expect(resume.villes).toBe(3);
        expect(resume.imprecises).toBe(1);
        expect(resume.capital).toBe(11000);
        expect(resume.premiere.region).toBe("Provence-Alpes-Côte d'Azur");
    });

    it('ne compte pas deux fois deux communes homonymes de départements différents', () => {
        const proprietes = annoterGeographie([
            bien('Rue A, 34000 Sainte-Marie'),
            bien('Rue B, 44000 Sainte-Marie')
        ]);

        expect(resumeGeographie(proprietes).villes).toBe(2);
        expect(localisations(proprietes)).toHaveLength(2);
    });

    it('rend des agrégats vides sans propriétés', () => {
        expect(agregerParRegion([])).toEqual([]);
        expect(localisations([])).toEqual([]);
        expect(resumeGeographie([]).premiere).toBeNull();
        expect(resumeGeographie(null).departements).toBe(0);
    });
});

describe('clé de lieu', () => {
    it('sépare deux communes homonymes de départements différents', () => {
        const a = cleLieu({ departement: '34', ville: 'Sainte-Marie' });
        const b = cleLieu({ departement: '44', ville: 'Sainte-Marie' });

        expect(a).not.toBe(b);
    });

    it('rejoint deux biens d\'une même commune', () => {
        expect(cleLieu({ departement: '46', ville: 'Cahors' }))
            .toBe(cleLieu({ departement: '46', ville: 'Cahors' }));
    });

    it('reste lisible quand la moitié manque', () => {
        expect(cleLieu({ ville: 'Setúbal' })).toBe('—/Setúbal');
        expect(cleLieu({})).toBe('—/—');
        expect(cleLieu(null)).toBe('—/—');
    });

    it('est celle que le tableau des localisations expose', () => {
        // Le clic sur une ligne repose là-dessus : si les deux divergeaient, le
        // registre filtrerait sur un lieu que la ligne ne compte pas.
        const proprietes = annoterGeographie([bien('Rue A, 46000 Cahors')]);
        const [lieu] = localisations(proprietes);

        expect(lieu.cle).toBe(cleLieu(proprietes[0].geo));
    });
});

describe('libelleLieu', () => {
    it('nomme la commune et son département', () => {
        expect(libelleLieu('46/Cahors')).toBe('Cahors (46)');
    });

    it('se passe du département quand il n\'y en a pas', () => {
        expect(libelleLieu('—/Setúbal')).toBe('Setúbal');
    });

    it('dit l\'ignorance plutôt que d\'afficher des tirets', () => {
        expect(libelleLieu('—/—')).toBe('Sans adresse exploitable');
    });

    it('coupe à la PREMIÈRE barre oblique', () => {
        // Un code de département n'en contient jamais : couper à la dernière
        // aurait tronqué une commune qui en porterait une.
        expect(libelleLieu('44/Saint-Jean/les-Bois')).toBe('Saint-Jean/les-Bois (44)');
    });
});

describe('agregerParDepartement', () => {
    it('cumule les biens d\'un même département et classe par capital', () => {
        const departements = agregerParDepartement(annoterGeographie([
            bien('Rue A, 69003 Lyon', 100),
            bien('Rue B, 69100 Villeurbanne', 200),
            bien('Rue C, 33000 Bordeaux', 500)
        ]));

        expect(departements.map(d => d.code)).toEqual(['33', '69']);
        expect(departements[1]).toMatchObject({
            code: '69', nom: 'Rhône', capital: 300, projets: 2
        });
    });

    it('écarte ce qui ne peut pas être posé sur une carte de France', () => {
        // Un bien étranger ou sans adresse n'a pas de département : les barres
        // par région le montrent déjà, la carte ne peut pas.
        const departements = agregerParDepartement(annoterGeographie([
            bien('Rue A, 69003 Lyon', 100),
            bien('Rua X, Porto', 100, { country: 'Portugal' }),
            bien('Sans adresse', 100)
        ]));

        expect(departements).toHaveLength(1);
        expect(departements[0].code).toBe('69');
    });

    it('rapporte la part au capital engagé, biens hors carte compris', () => {
        // Le dénominateur reste le portefeuille entier : dire qu'un département
        // pèse 100 % parce qu'il est le seul situé serait faux.
        const departements = agregerParDepartement(annoterGeographie([
            bien('Rue A, 69003 Lyon', 250),
            bien('Rua X, Porto', 750, { country: 'Portugal' })
        ]));

        expect(departements[0].part).toBeCloseTo(25, 5);
    });
});

describe('palier', () => {
    it('ne donne aucun palier à ce qui ne porte rien', () => {
        // Zéro n'est pas « très peu » : la carte doit le montrer autrement.
        expect(palier(0, 1000)).toBe(0);
        expect(palier(-5, 1000)).toBe(0);
        expect(palier(100, 0)).toBe(0);
    });

    it('donne le dernier palier au département le plus chargé', () => {
        expect(palier(1000, 1000)).toBe(5);
    });

    it('reste monotone : plus lourd n\'est jamais plus pâle', () => {
        const montants = [1, 5, 20, 50, 120, 300, 550, 800, 1000];
        const rangs = montants.map(m => palier(m, 1000));

        rangs.forEach((rang, i) => {
            if (i > 0) {
                expect(rang, `${montants[i]} € après ${montants[i - 1]} €`)
                    .toBeGreaterThanOrEqual(rangs[i - 1]);
            }
        });
    });

    it('étale le bas de l\'échelle plutôt que d\'y tout entasser', () => {
        // Les bornes en montants bruts : 4, 16, 36 et 64 % du maximum. Un
        // découpage linéaire aurait mis ces cinq montants dans le seul premier
        // palier, et laissé la carte uniformément blafarde.
        expect(palier(30, 1000)).toBe(1);
        expect(palier(100, 1000)).toBe(2);
        expect(palier(250, 1000)).toBe(3);
        expect(palier(500, 1000)).toBe(4);
        expect(palier(700, 1000)).toBe(5);
    });

    it('occupe les cinq teintes sur un portefeuille concentré', () => {
        // Le cas qui a fait abandonner le découpage linéaire : quelques
        // départements portent l'essentiel, la longue traîne pèse peu.
        const montants = [800, 400, 300, 200, 150, 120, 100, 80, 60, 40, 20, 10];
        const occupes = new Set(montants.map(m => palier(m, 800)));

        expect(occupes.size).toBe(5);
    });
});

describe('menus du registre', () => {
    const portefeuille = () => annoterGeographie([
        bien('Rue A, 44000 Nantes'),
        bien('Rue B, 06600 Antibes'),
        bien('Sans code postal')
    ]);

    it('trie les régions par ordre alphabétique, l\'imprécis en dernier', () => {
        // En dernier parce que ce n'est pas une région : c'est l'aveu qu'on
        // n'en connaît pas, et il n'a rien à faire au milieu de la liste.
        expect(regionsPresentes(portefeuille())).toEqual([
            'Pays de la Loire', "Provence-Alpes-Côte d'Azur", IMPRECISE
        ]);
    });

    it('ne liste que les départements présents, triés par code', () => {
        expect(departementsPresents(portefeuille())).toEqual([
            { code: '06', nom: 'Alpes-Maritimes' },
            { code: '44', nom: 'Loire-Atlantique' }
        ]);
    });
});
