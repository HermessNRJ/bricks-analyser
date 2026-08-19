/**
 * Sommaire : quelle section est en cours de lecture
 *
 * Tout le repère tient dans une fonction pure — une liste de positions, une
 * ligne de lecture — et c'est là que les deux pannes du premier jet se
 * jouaient : une section sautée quand le défilement passe vite, et la mauvaise
 * puce allumée après un clic d'ancre.
 */

import { describe, it, expect } from 'vitest';
import { sectionCourante } from '../src/events/sommaireHandler.js';

// Huit sections, comme dans la page : le haut de chacune, mesuré dans la
// fenêtre, avec le sommaire épinglé sur 58 px et la ligne de lecture à 82.
const LIGNE = 82;

describe('sectionCourante', () => {
    it('retient la dernière section passée sous la ligne', () => {
        // Trois titres au-dessus de la ligne, le reste en dessous : on lit la
        // troisième.
        expect(sectionCourante([-900, -400, -50, 300, 1200], LIGNE, false)).toBe(2);
    });

    it('reste sur la première tant qu\'aucune n\'est atteinte', () => {
        // Page en haut, le sommaire est encore dans le flux et tous les titres
        // sont sous lui.
        expect(sectionCourante([120, 400, 900], LIGNE, false)).toBe(0);
    });

    it('ne saute aucune section quand le défilement avance par bonds', () => {
        // La panne d'origine : le repère était donné par une bande de 5 % de
        // hauteur au milieu de l'écran, qu'une molette franchit d'un coup. Ici
        // la réponse ne dépend que de la position, jamais du chemin parcouru.
        const hauts = [0, 500, 1000, 1500, 2000, 2500, 3000, 3500];
        const traversees = [];

        for (let defile = 0; defile <= 3600; defile += 400) {
            traversees.push(sectionCourante(hauts.map(haut => haut - defile), LIGNE, false));
        }

        expect(traversees).toEqual([0, 0, 1, 2, 3, 4, 4, 5, 6, 7]);

        // Aucune section n'est passée sous silence, et la suite n'a pas de
        // retour en arrière.
        expect(new Set(traversees).size).toBe(hauts.length);
        expect([...traversees].sort((a, b) => a - b)).toEqual(traversees);
    });

    it('allume la section demandée juste après un clic d\'ancre', () => {
        // Le titre visé s'arrête sous le sommaire, à scroll-margin-top : il
        // doit être du bon côté de la ligne, sinon la puce allumée serait celle
        // d'une autre section que celle qu'on vient de demander.
        expect(sectionCourante([-2000, -1000, 66, 900], LIGNE, false)).toBe(2);
    });

    it('allume la dernière une fois le bas atteint', () => {
        // Une section courte n'amène jamais son titre sous la ligne : sans ce
        // cas, elle ne s'allumerait à aucun moment.
        expect(sectionCourante([-3000, -2000, 700], LIGNE, true)).toBe(2);
    });

    it('ne désigne rien quand le sommaire est vide', () => {
        expect(sectionCourante([], LIGNE, false)).toBe(-1);
        expect(sectionCourante([], LIGNE, true)).toBe(-1);
    });
});
