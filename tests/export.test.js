/**
 * Export du tableau de bord en fichier autonome
 *
 * Deux choses se jouent ici. La première est que le document produit ne mente
 * pas : pas de commande morte, pas de phrase qui invite à cliquer, et la
 * totalité du registre plutôt que la page ouverte. La seconde est que le motif
 * des vignettes reste le même des deux côtés du relais — il est écrit dans
 * nginx.conf et dans le module, et deux motifs qui divergent donnent des photos
 * manquantes sans le moindre message.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
    cheminVignette, nomFichier, nettoyerInstantane, assemblerDocument, figerGraphiques
} from '../src/export/instantane.js';
import { poidsLisible, messageExport, setupExport, AVERTISSEMENT } from '../src/events/exportHandler.js';
import { construireInstantane } from '../src/export/instantane.js';
import { CONFIG } from '../src/core/config.js';

const racineDepot = join(dirname(fileURLToPath(import.meta.url)), '..');

// Seul l'assemblage est simulé : ce qui est éprouvé ici, c'est la décision de le
// lancer ou non, pas ce qu'il produit.
vi.mock('../src/export/instantane.js', async (reel) => ({
    ...await reel(),
    construireInstantane: vi.fn()
}));

describe('cheminVignette', () => {
    const galerie = 'https://documents.bricks.co/property-photo-gallery/';

    it('relaie une photo de la galerie', () => {
        expect(cheminVignette(`${galerie}80df664d-b2c8-4b21-a396-242975d09ec5.webp`))
            .toBe('/vignette/80df664d-b2c8-4b21-a396-242975d09ec5.webp');
    });

    it('accepte le sous-dossier « opti » et les extensions en capitales', () => {
        // Les deux formes se trouvent dans de vrais portefeuilles.
        expect(cheminVignette(`${galerie}opti/0241a970-5f67-4855-8ffc-e878f68b887c.jpg`))
            .toBe('/vignette/opti/0241a970-5f67-4855-8ffc-e878f68b887c.jpg');
        expect(cheminVignette(`${galerie}5dd45d99-b625-4a74-8ae1-0ac1abc6f56e.JPG`))
            .toBe('/vignette/5dd45d99-b625-4a74-8ae1-0ac1abc6f56e.JPG');
    });

    it('refuse tout ce qui n\'est pas cette galerie', () => {
        expect(cheminVignette('https://picsum.photos/seed/demo/480/280')).toBe('');
        expect(cheminVignette('https://documents.bricks.co/autre/a.webp')).toBe('');
        expect(cheminVignette('https://documents.bricks.co.attaquant.example/property-photo-gallery/a.webp')).toBe('');
        expect(cheminVignette(null)).toBe('');
    });

    it('refuse ce qui sortirait du dossier ou changerait de nature', () => {
        expect(cheminVignette(`${galerie}../../etc/passwd`)).toBe('');
        expect(cheminVignette(`${galerie}autre/a.webp`)).toBe('');
        expect(cheminVignette(`${galerie}a.webp?x=1`)).toBe('');
        expect(cheminVignette(`${galerie}a.svg`)).toBe('');
        expect(cheminVignette(`${galerie}a.pdf`)).toBe('');
    });

    it('décide comme nginx.conf, pour les mêmes adresses', () => {
        // Le motif vit des deux côtés du relais. S'il diverge, les photos
        // disparaissent de l'export sans qu'aucune erreur ne soit levée : ce
        // test rejoue la carte $vignette_type telle qu'elle est écrite.
        const conf = readFileSync(join(racineDepot, 'nginx.conf'), 'utf8');
        const bloc = /map \$uri \$vignette_type \{([\s\S]*?)\n {4}\}/.exec(conf);

        expect(bloc).not.toBeNull();

        const motifs = [...bloc[1].matchAll(/"~\*([^"]+)"/g)]
            .map(([, motif]) => new RegExp(motif, 'i'));

        expect(motifs.length).toBe(3);

        const cas = [
            'a.webp', 'a.png', 'a.jpg', 'a.jpeg', 'a.JPG', 'opti/a.jpg',
            'a.svg', 'a.pdf', 'autre/a.jpg', '../a.webp', 'a.webp?x=1', '-a.webp'
        ];

        cas.forEach((fichier) => {
            const relaisJs = cheminVignette(galerie + fichier) !== '';
            const relaisNginx = motifs.some((motif) => motif.test(`/vignette/${fichier}`));

            expect(`${fichier} → ${relaisJs}`).toBe(`${fichier} → ${relaisNginx}`);
        });
    });
});

describe('nomFichier', () => {
    it('porte la date, et se distingue du fichier de collecte', () => {
        // Celui de la collecte est un « bricks-AAAA-MM-JJ-HHMM.json » : les deux
        // se croisent dans le dossier des téléchargements.
        expect(nomFichier(new Date(2026, 7, 20))).toBe('bricks-tableau-2026-08-20.html');
        expect(nomFichier(new Date(2026, 0, 3))).toBe('bricks-tableau-2026-01-03.html');
    });
});

describe('nettoyerInstantane', () => {
    const construire = (html) => {
        const racine = document.createElement('div');
        racine.innerHTML = html;
        nettoyerInstantane(racine);
        return racine;
    };

    it('retire les commandes qui ne répondraient plus', () => {
        const racine = construire(`
            <div class="properties-controls"><input type="search" id="propertySearch"></div>
            <nav id="pagination"><button class="bouton">Suivant</button></nav>
            <div class="hidden">replié</div>
            <button class="bouton bouton-danger">Effacer</button>
        `);

        expect(racine.querySelector('.properties-controls')).toBeNull();
        expect(racine.querySelector('#pagination')).toBeNull();
        expect(racine.querySelector('.hidden')).toBeNull();
        expect(racine.querySelectorAll('button').length).toBe(0);
    });

    it('garde les boutons qui portaient une donnée, en texte', () => {
        // Une brique du mur est un <button>, une commune du tableau des
        // localisations aussi : les effacer viderait le mur et une colonne.
        const racine = construire(`
            <div class="mur"><button class="brique" data-statut="ongoing"></button></div>
            <td><button class="geo-lieu-bouton">Cahors</button></td>
            <span class="puce">Alerte<button data-clear="propertyWarningFilter">×</button></span>
        `);

        expect(racine.querySelectorAll('button').length).toBe(0);
        expect(racine.querySelector('span.brique')?.dataset.statut).toBe('ongoing');
        expect(racine.querySelector('span.geo-lieu-bouton')?.textContent).toBe('Cahors');
        expect(racine.querySelector('.puce')?.textContent.trim()).toBe('Alerte');
    });

    it('fige les hypothèses au lieu de les effacer', () => {
        // Elles disent sous quelles conditions la courbe d'à côté a été tracée.
        const racine = construire(`
            <label>Apport <input type="number" id="simApport" value="178"></label>
            <label>Rendement <input type="number" value="9.8"></label>
            <label><input type="checkbox" checked> Réinvestir les revenus nets</label>
            <select><option value="3" selected>3 derniers mois</option><option value="6">6 mois</option></select>
        `);

        const figees = [...racine.querySelectorAll('.valeur-figee')].map((v) => v.textContent);

        expect(racine.querySelectorAll('input, select').length).toBe(0);
        expect(figees).toEqual(['178', '9,8', '☑ Réinvestir les revenus nets', '3 derniers mois']);
    });

    it('retire ce qui invitait à cliquer', () => {
        const racine = construire(`
            <p class="note"><span class="pilotage">Cliquez une ligne.</span> Déduit du code postal.</p>
            <div class="property-card" role="link" tabindex="0" data-project-url="https://app.bricks.co/project/x">Fiche</div>
            <nav class="sommaire"><a href="#a" class="sommaire-actif">Le mur</a></nav>
        `);

        expect(racine.querySelector('.note').textContent.trim()).toBe('Déduit du code postal.');
        expect(racine.querySelector('.property-card').hasAttribute('role')).toBe(false);
        expect(racine.querySelector('.property-card').hasAttribute('data-project-url')).toBe(false);
        expect(racine.querySelector('.sommaire-actif')).toBeNull();
        // L'ancre, elle, fonctionne sans script.
        expect(racine.querySelector('.sommaire a').getAttribute('href')).toBe('#a');
    });

    it('ouvre ce qui était replié et marque le document', () => {
        const racine = construire('<details><summary>Géographie</summary><p>32 départements</p></details>');

        expect(racine.querySelector('details').open).toBe(true);
        expect(racine.classList.contains('instantane')).toBe(true);
    });
});

describe('figerGraphiques', () => {
    it('retire un graphique qu\'il ne peut pas relire', () => {
        // jsdom ne sait pas rendre un canvas : c'est le même chemin qu'un canvas
        // souillé par une image tierce, où toDataURL lève une erreur. Mieux vaut
        // un graphique absent qu'un cadre vide.
        const source = document.createElement('div');
        source.innerHTML = '<canvas id="treemapChart"></canvas>';
        const clone = source.cloneNode(true);

        vi.spyOn(source.querySelector('canvas'), 'toDataURL')
            .mockImplementation(() => { throw new Error('canvas souillé'); });

        figerGraphiques(source, clone);

        expect(clone.querySelector('canvas')).toBeNull();
        expect(clone.querySelector('img')).toBeNull();
    });

    it('remplace un graphique lisible par son image', () => {
        const source = document.createElement('div');
        source.innerHTML = '<canvas id="treemapChart"></canvas>';
        const clone = source.cloneNode(true);

        vi.spyOn(source.querySelector('canvas'), 'toDataURL').mockReturnValue('data:image/png;base64,AAAA');

        figerGraphiques(source, clone);

        const image = clone.querySelector('img.graphique-fige');

        expect(image).not.toBeNull();
        expect(image.getAttribute('src')).toBe('data:image/png;base64,AAAA');
        expect(clone.querySelector('canvas')).toBeNull();
    });
});

describe('assemblerDocument', () => {
    const document_ = (pieces) => assemblerDocument({
        corps: '<div id="results">chiffres</div>',
        styles: ['body { color: red }'],
        titre: 'Portefeuille Bricks au 20 août 2026',
        date: '20 août 2026',
        provenance: '',
        ...pieces
    });

    it('produit un document complet et daté', () => {
        const html = document_({});

        expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
        expect(html).toContain('<title>Portefeuille Bricks au 20 août 2026</title>');
        expect(html).toContain('<div id="results">chiffres</div>');
        expect(html).toContain(CONFIG.VERSION);
    });

    it('n\'embarque aucun script ni aucune ressource distante', () => {
        // La promesse du fichier : il s'ouvre sur une machine hors ligne.
        const html = document_({});

        expect(html).not.toContain('<script');
        expect(html).not.toContain('<link');
        expect(html).not.toContain('https://cdnjs');
    });

    it('empêche une feuille de refermer son propre <style>', () => {
        // Le contenu d'un <style> est du texte brut : la séquence de fermeture,
        // portée par un commentaire CSS, ferait basculer tout ce qui suit du
        // côté du document.
        const html = document_({ styles: ['/* </style><img onerror=alert(1)> */'] });

        expect(html).not.toContain('</style><img');
        expect(html).toContain('<\\/style>');
    });

    it('intègre les feuilles sans condition', () => {
        // Le thème est celui de l'export et ne bouge plus : les graphiques sont
        // des images tracées dans une palette, et une page qui suivrait le
        // réglage du lecteur porterait huit figures de l'autre thème.
        const html = document_({ styles: ['a{}', 'b{}'] });

        expect(html).toContain('<style>\na{}');
        expect(html).toContain('<style>\nb{}');
        expect(html).not.toContain('media=');
    });

    it('échappe ce qui vient des données', () => {
        const html = document_({ titre: 'Portefeuille <script>alert(1)</script>' });

        expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
        expect(html).not.toContain('<script>alert(1)');
    });

    it('dit ce que le fichier contient', () => {
        // Le portefeuille en clair, sans protection : ça ne se devine pas.
        expect(document_({})).toContain('portefeuille en clair');
    });
});

describe('compte rendu du bouton', () => {
    it('donne un poids lisible', () => {
        expect(poidsLisible(512)).toBe('512 o');
        expect(poidsLisible(2048)).toBe('2 Ko');
        expect(poidsLisible(2.31 * 1024 * 1024)).toBe('2,3 Mo');
    });

    it('signale les photos restées distantes', () => {
        // Sans Docker il n'y a pas de relais : le fichier s'ouvrira sans elles
        // sur une machine hors ligne, et c'est une différence de nature.
        expect(messageExport(1024, { integrees: 40, distantes: 0 })).toBe('1 Ko · enregistré');
        expect(messageExport(1024, { integrees: 0, distantes: 1 })).toBe('1 Ko · 1 photo non intégrée');
        expect(messageExport(1024, { integrees: 0, distantes: 40 })).toBe('1 Ko · 40 photos non intégrées');
    });
});

describe('accord demandé avant l\'export', () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <button id="exportBtn">Exporter le tableau</button>
            <span id="exportEtat"></span>
            <div id="error" class="error hidden"></div>
        `;

        construireInstantane.mockReset();
        construireInstantane.mockResolvedValue({
            html: '<!DOCTYPE html><html></html>',
            vignettes: { integrees: 0, distantes: 0 },
            nom: 'bricks-tableau-2026-08-20.html'
        });

        // jsdom ne sait ni fabriquer une URL d'objet ni enregistrer un fichier.
        vi.stubGlobal('URL', Object.assign(Object.create(URL), {
            createObjectURL: () => 'blob:essai',
            revokeObjectURL: () => {}
        }));
        vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

        setupExport();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    const cliquer = async () => {
        document.getElementById('exportBtn').click();
        await new Promise((suite) => { setTimeout(suite, 0); });
    };

    it('dit ce que le fichier emportera', () => {
        // C'est tout l'intérêt de la question : le reste de l'outil promet que
        // les données ne bougent pas, celle-ci fabrique une copie qui part.
        expect(AVERTISSEMENT).toContain('en clair');
        expect(AVERTISSEMENT).toContain('Continuer ?');
    });

    it('n\'écrit rien si la réponse est non', async () => {
        vi.stubGlobal('confirm', vi.fn(() => false));

        await cliquer();

        expect(construireInstantane).not.toHaveBeenCalled();
        expect(document.getElementById('exportEtat').textContent).toBe('');
        expect(document.getElementById('exportBtn').disabled).toBe(false);
    });

    it('exporte si la réponse est oui', async () => {
        const question = vi.fn(() => true);
        vi.stubGlobal('confirm', question);

        await cliquer();

        expect(question).toHaveBeenCalledWith(AVERTISSEMENT);
        expect(construireInstantane).toHaveBeenCalledTimes(1);
        expect(document.getElementById('exportEtat').textContent).toContain('enregistré');
    });

    it('redemande à chaque export', async () => {
        // Un accord vaut pour le fichier qu'on écrit, pas pour les suivants.
        const question = vi.fn(() => true);
        vi.stubGlobal('confirm', question);

        await cliquer();
        await cliquer();

        expect(question).toHaveBeenCalledTimes(2);
        expect(construireInstantane).toHaveBeenCalledTimes(2);
    });
});
