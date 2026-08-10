import { describe, it, expect } from 'vitest';
import {
    classerWarning,
    niveauRisque,
    repartitionRisque,
    NIVEAUX_RISQUE
} from '../src/business/riskAnalysis.js';

const w = (description, date = '2026-01-01') => ({ description, date });

describe('classerWarning', () => {
    it('classe une procédure judiciaire au niveau le plus grave', () => {
        expect(classerWarning(w('<p>Une procédure judiciaire est en cours.</p>')))
            .toBe(NIVEAUX_RISQUE.PROCEDURE);
        expect(classerWarning(w('Une mise en demeure a été envoyée')))
            .toBe(NIVEAUX_RISQUE.PROCEDURE);
        expect(classerWarning(w("Un huissier a été mandaté")))
            .toBe(NIVEAUX_RISQUE.PROCEDURE);
    });

    it('classe un impayé non résolu comme impayé', () => {
        expect(classerWarning(w('Les intérêts restent impayés à ce jour')))
            .toBe(NIVEAUX_RISQUE.IMPAYE);
        expect(classerWarning(w("À ce jour, les fonds n'ont pas encore été reçus")))
            .toBe(NIVEAUX_RISQUE.IMPAYE);
    });

    it('ne compte pas un impayé régularisé comme un incident en cours', () => {
        // Le piège : « régularisé » et « reversé » annoncent une résolution.
        // Les compter comme des défauts gonflerait le risque affiché.
        expect(classerWarning(w('Les intérêts impayés ont été régularisés et reversés')))
            .toBe(NIVEAUX_RISQUE.SIGNALE);
    });

    it('maintient la procédure même si un versement a été régularisé', () => {
        expect(classerWarning(w('Les intérêts ont été régularisés. La procédure judiciaire suit son cours.')))
            .toBe(NIVEAUX_RISQUE.PROCEDURE);
    });

    it('classe en simple signalement un message neutre', () => {
        expect(classerWarning(w('Les travaux avancent comme prévu')))
            .toBe(NIVEAUX_RISQUE.SIGNALE);
    });

    it('tolère une description vide ou absente', () => {
        expect(classerWarning(w(''))).toBe(NIVEAUX_RISQUE.SIGNALE);
        expect(classerWarning({})).toBe(NIVEAUX_RISQUE.SIGNALE);
        expect(classerWarning(null)).toBe(NIVEAUX_RISQUE.SIGNALE);
    });

    it('ignore les balises HTML de la description', () => {
        expect(classerWarning(w('<p>Une <b>mise en demeure</b> a été adressée</p>')))
            .toBe(NIVEAUX_RISQUE.PROCEDURE);
    });

    it('reconnaît les termes écrits avec une apostrophe typographique', () => {
        // Les messages Bricks emploient ’ et non ' : sans normalisation, le
        // terme ne correspondrait jamais et l'incident passerait inaperçu.
        expect(classerWarning(w('À ce jour, les fonds n’ont pas encore été reçus')))
            .toBe(NIVEAUX_RISQUE.IMPAYE);
    });

    it('ne prend pas un constat de chantier pour un recouvrement', () => {
        // Cas réel « Villa Anglet Chiberta » : un constat d'huissier sur
        // l'avancement des travaux n'est pas une procédure de recouvrement.
        const texte = 'Le constat d’huissier relatif à l’état d’avancement du chantier '
            + 'ainsi que la vidéo associée nous ont été adressés.';

        expect(classerWarning(w(texte))).toBe(NIVEAUX_RISQUE.SIGNALE);
    });

    it('retient la procédure quand un huissier est mandaté pour recouvrer', () => {
        expect(classerWarning(w('Un huissier a été mandaté aux fins de recouvrement')))
            .toBe(NIVEAUX_RISQUE.PROCEDURE);
    });

    it('retient le défaut annoncé même au milieu d\'une bonne nouvelle', () => {
        // Cas réel « Complexe de soins Bradford » : Bricks régularise un mois
        // tout en qualifiant le projet de « défaut de paiement ».
        const texte = 'Les intérêts de janvier ont été régularisés et reversés aux investisseurs. '
            + 'Pour suivre les actions en cours sur ce projet en défaut de paiement, consultez le suivi.';

        expect(classerWarning(w(texte))).toBe(NIVEAUX_RISQUE.PROCEDURE);
    });
});

describe('niveauRisque', () => {
    it('considère une propriété sans warning comme saine', () => {
        expect(niveauRisque({ warnings: [] })).toBe(NIVEAUX_RISQUE.SAIN);
        expect(niveauRisque({})).toBe(NIVEAUX_RISQUE.SAIN);
    });

    it('ne retient que le warning le plus récent', () => {
        // L'ancien annonçait une procédure, le récent une régularisation :
        // c'est l'état courant du dossier qui compte.
        const property = {
            warnings: [
                w('Une procédure judiciaire est ouverte', '2025-01-01'),
                w('Les sommes ont été régularisées', '2026-06-01')
            ]
        };

        expect(niveauRisque(property)).toBe(NIVEAUX_RISQUE.SIGNALE);
    });

    it('remonte le risque si le message récent est le plus grave', () => {
        const property = {
            warnings: [
                w('Tout est régularisé', '2025-01-01'),
                w('Une mise en demeure a été envoyée', '2026-06-01')
            ]
        };

        expect(niveauRisque(property)).toBe(NIVEAUX_RISQUE.PROCEDURE);
    });

    it('reste stable quel que soit l\'ordre des warnings reçus', () => {
        const recent = w('Une mise en demeure a été envoyée', '2026-06-01');
        const ancien = w('Tout est régularisé', '2025-01-01');

        expect(niveauRisque({ warnings: [recent, ancien] }))
            .toBe(niveauRisque({ warnings: [ancien, recent] }));
    });
});

describe('repartitionRisque', () => {
    const bien = (id, investment, warnings = [], isRefunded = false) => ({
        id, investment, warnings, isRefunded
    });

    it('calcule les parts sur les propriétés détenues, remboursées exclues', () => {
        const properties = [
            bien('a', 100, [w('mise en demeure')]),
            bien('b', 300, []),
            bien('c', 0, [w('mise en demeure')], true)
        ];

        const { base, repartition } = repartitionRisque(properties);

        expect(base).toBe(2);
        expect(repartition[NIVEAUX_RISQUE.PROCEDURE].nombre).toBe(1);
        expect(repartition[NIVEAUX_RISQUE.PROCEDURE].part).toBeCloseTo(50, 6);
    });

    it('mesure le capital exposé et sa part', () => {
        const properties = [
            bien('a', 250, [w('les fonds sont impayés')]),
            bien('b', 750, [])
        ];

        const { enDifficulte } = repartitionRisque(properties);

        expect(enDifficulte.capital).toBe(250);
        expect(enDifficulte.partCapital).toBeCloseTo(25, 6);
    });

    it('additionne procédures et impayés dans les difficultés', () => {
        const properties = [
            bien('a', 100, [w('procédure judiciaire')]),
            bien('b', 100, [w('montant impayé')]),
            bien('c', 100, [])
        ];

        const { enDifficulte } = repartitionRisque(properties);

        expect(enDifficulte.nombre).toBe(2);
        expect(enDifficulte.part).toBeCloseTo(66.67, 1);
    });

    it('liste les identifiants pour permettre la vérification', () => {
        const properties = [bien('cible', 100, [w('mise en demeure')]), bien('autre', 100, [])];

        const { repartition } = repartitionRisque(properties);

        expect(repartition[NIVEAUX_RISQUE.PROCEDURE].ids).toEqual(['cible']);
    });

    it('ne divise pas par zéro sur un portefeuille vide', () => {
        const { base, enDifficulte } = repartitionRisque([]);

        expect(base).toBe(0);
        expect(enDifficulte.part).toBe(0);
        expect(enDifficulte.partCapital).toBe(0);
    });

    it('tolère une entrée absente', () => {
        expect(() => repartitionRisque(null)).not.toThrow();
    });
});
