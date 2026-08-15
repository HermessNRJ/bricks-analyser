import { describe, it, expect } from 'vitest';
import { classerWarning, niveauRisque, repartitionRisque, NIVEAUX_RISQUE, arrieresInvestisseur } from '../src/business/riskAnalysis.js';

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

describe('repartitionRisque — partition complète', () => {
    const bien = (id, warnings = [], isRefunded = false) => ({
        id, investment: isRefunded ? 0 : 100, warnings, isRefunded
    });
    const w = (description) => ({ description, date: '2026-01-01' });

    it('répartit chaque propriété détenue dans exactement un niveau', () => {
        // Le défaut corrigé : trois des quatre niveaux étaient affichés, donc
        // les chiffres semblaient devoir s'additionner sans jamais y arriver.
        const properties = [
            bien('a', [w('procédure judiciaire')]),
            bien('b', [w('montant impayé')]),
            bien('c', [w('les travaux avancent')]),
            bien('d', [w('intérêts régularisés et reversés')]),
            bien('e'),
            bien('f'),
            bien('g', [w('mise en demeure')], true)
        ];

        const { base, repartition } = repartitionRisque(properties);
        const somme = Object.values(repartition).reduce((t, e) => t + e.nombre, 0);

        expect(base).toBe(6);
        expect(somme).toBe(base);
    });

    it('fait aussi la somme des parts et des capitaux', () => {
        const properties = [
            bien('a', [w('procédure judiciaire')]),
            bien('b', [w('point de suivi')]),
            bien('c')
        ];

        const { base, capitalBase, repartition } = repartitionRisque(properties);
        const niveaux = Object.values(repartition);

        expect(niveaux.reduce((t, e) => t + e.nombre, 0)).toBe(base);
        expect(niveaux.reduce((t, e) => t + e.capital, 0)).toBeCloseTo(capitalBase, 10);
        expect(niveaux.reduce((t, e) => t + e.part, 0)).toBeCloseTo(100, 10);
    });

    it('expose les quatre niveaux, même vides', () => {
        // Un niveau absent de la sortie disparaîtrait de l'écran sans bruit
        const { repartition } = repartitionRisque([bien('a')]);

        expect(Object.keys(repartition).sort())
            .toEqual(['impaye', 'procedure', 'sain', 'signale']);
    });
});

describe('arrieresInvestisseur', () => {
    // Villa Cap d'Antibes : 25 briques à 11 %, une échéance impayée
    const ANTIBES = { ownedBricks: 25, investment: 250, yearlyReturn: 11 };
    const SUIVI = { suivi: true, impayees: 1, briquesProjet: 500000, penalites: 0 };

    it('chiffre les coupons manqués, pas la dette de l\'emprunteur', () => {
        // Le coupon mensuel vaut 250 × 11 % / 12 = 2,29 €, ce que le carnet
        // affiche. La part de l'échéance due par l'emprunteur donnait 1,90 € :
        // son échéancier et la commission de plateforme n'ont pas de rapport
        // fixe avec le coupon versé.
        const arrieres = arrieresInvestisseur(ANTIBES, SUIVI);

        expect(arrieres.montant).toBeCloseTo(2.29, 2);
        expect(arrieres.echeances).toBe(1);
    });

    it('compte un coupon manqué par échéance impayée', () => {
        const arrieres = arrieresInvestisseur(ANTIBES, { ...SUIVI, impayees: 20 });

        expect(arrieres.montant).toBeCloseTo(45.83, 1);
    });

    it('ramène les pénalités des investisseurs à la part des briques', () => {
        // 37 254 € pour l'ensemble des obligataires, 25 briques sur 500 000
        const arrieres = arrieresInvestisseur(ANTIBES, { ...SUIVI, penalites: 37254.64 });

        expect(arrieres.penalites).toBeCloseTo(1.86, 1);
        expect(arrieres.penalitesConnues).toBe(true);
    });

    it('tait la pénalité sans le nombre de briques du projet', () => {
        // Un statut récupéré par une version antérieure ne le porte pas :
        // annoncer la dette entière comme sienne serait faux d'un facteur 20 000
        const arrieres = arrieresInvestisseur(
            ANTIBES, { ...SUIVI, briquesProjet: 0, penalites: 37254.64 }
        );

        expect(arrieres.penalites).toBe(0);
        expect(arrieres.penalitesConnues).toBe(false);
        // Les coupons manqués, eux, restent calculables
        expect(arrieres.montant).toBeCloseTo(2.29, 2);
    });

    it('ne dit rien sur un projet qui ne doit rien', () => {
        expect(arrieresInvestisseur(ANTIBES, { ...SUIVI, impayees: 0 })).toBeNull();
        expect(arrieresInvestisseur(ANTIBES, null)).toBeNull();
        expect(arrieresInvestisseur(ANTIBES, { suivi: false })).toBeNull();
    });
});
