import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { degraisser, emballer } from '../src/ui/favori.js';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = readFileSync(join(RACINE, 'src/collecte/extracteur.js'), 'utf8');

describe('degraisser', () => {
    it('retire les lignes de commentaire et les lignes vides', () => {
        const allege = degraisser([
            '// un commentaire',
            '/**',
            ' * un bloc',
            ' */',
            '',
            'const a = 1;'
        ].join('\n'));

        expect(allege).toBe('const a = 1;');
    });

    // Le piège qui a dicté l'écriture de degraisser : un retrait naïf de tout
    // ce qui suit « // » couperait l'URL de l'API en deux, et le favori
    // mourrait sans bruit chez l'utilisateur.
    it('ne coupe pas une URL contenant //', () => {
        const allege = degraisser("const API = 'https://api.bricks.co';");

        expect(allege).toBe("const API = 'https://api.bricks.co';");
    });

    it('ne touche pas à un commentaire placé après du code', () => {
        const ligne = 'const a = 1; // gardé, faute de savoir le couper sans risque';

        expect(degraisser(ligne)).toBe(ligne);
    });
});

describe('la source de l\'extracteur, une fois dégraissée', () => {
    const allege = degraisser(SOURCE);

    it('s\'analyse encore comme du JavaScript valide', () => {
        expect(() => new Function(allege)).not.toThrow();
    });

    it('a conservé l\'URL de l\'API', () => {
        expect(allege).toContain("'https://api.bricks.co'");
    });

    it('a conservé les cinq points d\'entrée collectés', () => {
        for (const chemin of [
            '/projects/financed',
            '/projects',
            '/investor/portfolio/properties/highlighted-updates',
            '/investor/portfolio/revenue',
            '/wallet-transactions'
        ]) {
            expect(allege).toContain(chemin);
        }
    });

    it('a conservé le garde-fou de domaine', () => {
        expect(allege).toContain('bricks\\.co$');
    });

    // Le procédé tout entier tient à cette option : c'est elle qui fait joindre
    // le cookie par le navigateur, et donc qui rend inutile toute extraction.
    it('appelle l\'API avec les identifiants du navigateur', () => {
        expect(allege).toContain("credentials: 'include'");
    });

    it('ne lit jamais document.cookie', () => {
        expect(allege).not.toContain('document.cookie');
    });

    // Un extracteur qui parlerait à un tiers viderait de son sens tout le
    // reste : il ne doit joindre que Bricks.
    it('ne contacte aucun hôte en dehors de bricks.co', () => {
        const hotes = [...allege.matchAll(/https?:\/\/([a-zA-Z0-9.-]+)/g)].map(m => m[1]);

        expect(hotes.length).toBeGreaterThan(0);
        expect([...new Set(hotes)]).toEqual(['api.bricks.co']);
    });
});

describe('emballer', () => {
    it('produit une URL javascript: exécutable', () => {
        const url = emballer("const a = 1;");

        expect(url.startsWith('javascript:')).toBe(true);
    });

    it('encode les sauts de ligne, que certains gestionnaires de favoris avalent', () => {
        const url = emballer("const a = 1;\nconst b = 2;");

        expect(url).not.toContain('\n');
        expect(url).toContain('%0A');
    });

    it('neutralise la valeur de retour, qui remplacerait la page de Bricks', () => {
        expect(decodeURIComponent(emballer('const a = 1;')).trim().endsWith('void 0;')).toBe(true);
    });

    it('emballe la vraie source sans la casser', () => {
        const decode = decodeURIComponent(emballer(SOURCE).slice('javascript:'.length));

        expect(() => new Function(decode)).not.toThrow();
    });
});
