/**
 * La vitrine, et ce qu'elle retire de la page
 *
 * tools/vitrine.mjs découpe index.html à l'expression régulière. C'est tenable
 * tant que quelque chose relit la découpe : une ancre qui bouge dans index.html
 * ne casse rien ici et ne se verrait qu'en ligne, sur une page publique.
 *
 * D'où les deux familles de vérifications ci-dessous. Les unes travaillent sur
 * un HTML fabriqué, et disent ce que la transformation doit faire. Les autres
 * passent le vrai index.html et le vrai config.js : ce sont elles qui échouent
 * le jour où la source change sans que l'assembleur suive.
 */

import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pageVitrine, configVitrine, assemblerVitrine } from '../tools/vitrine.mjs';

const RACINE = path.resolve(__dirname, '..');
const INDEX = fs.readFileSync(path.join(RACINE, 'index.html'), 'utf8');
const CONFIG = fs.readFileSync(path.join(RACINE, 'src', 'core', 'config.js'), 'utf8');

/** Un index.html réduit à ce que l'assembleur cherche */
function pageMinimale({ accueil = '', avant = '', ancre = true } = {}) {
    return [
        '<!DOCTYPE html>',
        '<html lang="fr">',
        '<head>',
        avant,
        ancre ? '    <!-- Main Application Module (ES6) -->' : '    <!-- autre chose -->',
        '    <script type="module" src="./src/events/appInitializer.js"></script>',
        '</head>',
        '<body>',
        '        <section class="upload-section" id="uploadSection" aria-labelledby="titreSession">',
        accueil,
        '        </section>',
        '</body>',
        '</html>',
        ''
    ].join('\n');
}

describe('pageVitrine', () => {
    it('retire tout ce qui charge, enregistre ou emporte des données', () => {
        const vitrine = pageVitrine(INDEX);

        // Le favori et le champ de session : rien à quoi se connecter.
        expect(vitrine).not.toContain('favoriCollecte');
        expect(vitrine).not.toContain('apiTokenInput');
        expect(vitrine).not.toContain('fetchApiDataBtn');
        expect(vitrine).not.toContain('collecteFichier');

        // Le suivi des projets passe par un relais qui n'existe pas sur Pages.
        expect(vitrine).not.toContain('refreshStatusBtn');

        // L'export et l'effacement portent sur des données que la vitrine n'a pas.
        expect(vitrine).not.toContain('exportBtn');
        expect(vitrine).not.toContain('resetCacheBtn');
    });

    it('garde ce dont les modules restants ont besoin', () => {
        const vitrine = pageVitrine(INDEX);

        // src/ui/modals.js n'a que celui-là pour écrire une erreur.
        expect(vitrine).toContain('id="error"');

        // src/ui/uiUpdater.js replie cette section une fois les résultats à l'écran.
        expect(vitrine).toContain('id="uploadSection"');

        // Le tableau lui-même, et le lien vers les sources que l'AGPL demande
        // à toute instance servie à distance.
        expect(vitrine).toContain('id="results"');
        expect(vitrine).toContain('https://github.com/HermessNRJ/bricks-analyser');
    });

    it('pose « ?demo » avant que le module ne lise l\'adresse', () => {
        const vitrine = pageVitrine(INDEX);
        const amorce = vitrine.indexOf('history.replaceState');
        const module = vitrine.indexOf('type="module"');

        expect(amorce).toBeGreaterThan(-1);
        expect(amorce).toBeLessThan(module);
    });

    it('reconduit le fragment, pour ne pas perdre une ancre du sommaire', () => {
        expect(pageVitrine(INDEX)).toContain('location.hash');
    });

    it('laisse une page dont les sections restent équilibrées', () => {
        const vitrine = pageVitrine(INDEX);
        const ouvertes = vitrine.match(/<section[\s>]/g) || [];
        const fermees = vitrine.match(/<\/section>/g) || [];

        expect(ouvertes.length).toBe(fermees.length);
    });

    it('échoue quand la section d\'accueil a changé de nom', () => {
        const page = pageMinimale().replace('upload-section', 'autre-section');

        expect(() => pageVitrine(page)).toThrow(/Charger vos données/);
    });

    it('échoue quand l\'ancre du module a disparu', () => {
        expect(() => pageVitrine(pageMinimale({ ancre: false })))
            .toThrow(/module principal/);
    });

    it('échoue plutôt que de couper au milieu d\'une section imbriquée', () => {
        const page = pageMinimale({ accueil: '            <section><p>ici</p></section>' });

        expect(() => pageVitrine(page)).toThrow(/en contient une autre/);
    });

    it('ne remplace que la section d\'accueil', () => {
        const page = pageMinimale({ avant: '    <!-- $& -->' });

        // « $& » en chaîne de remplacement vaudrait « tout ce qui a été trouvé » :
        // la page recopierait sa propre section au lieu de la perdre.
        expect(pageVitrine(page)).toContain('<!-- $& -->');
    });
});

describe('configVitrine', () => {
    it('fait viser l\'API GitHub plutôt que le relais nginx', () => {
        const vitrine = configVitrine(CONFIG);

        expect(vitrine).not.toContain("VERSION_ENDPOINT: '/version-api'");
        expect(vitrine).toContain('https://api.github.com/repos/HermessNRJ/bricks-analyser/releases/latest');
    });

    it('ne touche à rien d\'autre', () => {
        const vitrine = configVitrine(CONFIG);

        expect(vitrine).toContain("LOCAL_STORAGE_KEY: 'bricksInvestmentData'");
        expect(vitrine.split('\n').length).toBe(CONFIG.split('\n').length);
    });

    it('échoue quand le point d\'accès a changé de forme', () => {
        expect(() => configVitrine("export const CONFIG = { VERSION_ENDPOINT: '/autre' };"))
            .toThrow(/point d.accès de version/);
    });
});

describe('assemblerVitrine', () => {
    const jetables = [];

    const dossier = () => {
        const chemin = fs.mkdtempSync(path.join(os.tmpdir(), 'vitrine-'));
        jetables.push(chemin);
        return chemin;
    };

    afterEach(() => {
        while (jetables.length) {
            fs.rmSync(jetables.pop(), { recursive: true, force: true });
        }
    });

    /**
     * Assemble une vitrine dans un dossier jetable
     *
     * Le portefeuille est vide : l'assemblage le recopie sans le lire, et ce
     * qu'il contient est l'affaire de tools/demo.mjs.
     *
     * @returns {string} Le dossier assemblé
     */
    function assembler() {
        const travail = dossier();
        const demo = path.join(travail, 'demo.json');

        fs.writeFileSync(demo, '{"data":[]}');
        assemblerVitrine(path.join(travail, 'sortie'), demo);

        return path.join(travail, 'sortie');
    }

    it('publie la page, le code, la favicon et le portefeuille', () => {
        const sortie = assembler();

        // Les chemins, et pas seulement leur existence : « ?demo » et les
        // imports du module sont relatifs, une arborescence aplatie donnerait
        // une page blanche que rien d'autre ne verrait.
        for (const fichier of [
            'index.html',
            'favicon.png',
            'data/demo.json',
            'src/events/appInitializer.js',
            'src/styles/main.css',
            'src/carte/departements.svg'
        ]) {
            expect(fs.existsSync(path.join(sortie, fichier)), fichier).toBe(true);
        }
    });

    it('applique les deux transformations aux fichiers écrits', () => {
        const sortie = assembler();

        expect(fs.readFileSync(path.join(sortie, 'index.html'), 'utf8'))
            .toContain('history.replaceState');
        expect(fs.readFileSync(path.join(sortie, 'src/core/config.js'), 'utf8'))
            .toContain('https://api.github.com/repos/');
    });

    it('ne publie rien du dépôt qui n\'ait été demandé', () => {
        const sortie = assembler();

        // nginx.conf décrit des relais qui n'existent pas sur Pages, et le
        // reste — tests, outils, Dockerfile — n'a rien à faire en ligne.
        for (const absent of ['nginx.conf', 'Dockerfile', 'tests', 'tools', 'package.json']) {
            expect(fs.existsSync(path.join(sortie, absent)), absent).toBe(false);
        }
    });

    it('repart de zéro, sans garder ce qu\'une version précédente avait publié', () => {
        const sortie = assembler();
        const reste = path.join(sortie, 'ancien.html');

        fs.writeFileSync(reste, 'à ne pas republier');
        assemblerVitrine(sortie, path.join(sortie, '..', 'demo.json'));

        expect(fs.existsSync(reste)).toBe(false);
    });

    it('échoue en nommant la commande quand le portefeuille manque', () => {
        expect(() => assemblerVitrine(dossier(), path.join(dossier(), 'absent.json')))
            .toThrow(/npm run demo/);
    });
});
