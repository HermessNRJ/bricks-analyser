/**
 * Version de l'application et signalement d'une mise à jour
 *
 * Deux choses à garantir : que le numéro écrit dans le code n'ait pas divergé
 * de package.json — il est écrit à la main faute de bundler —, et que la
 * comparaison ne se trompe jamais dans le sens qui coûte cher, celui de la
 * fausse alerte.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { analyserVersion, comparerVersions, miseAJourDisponible } from '../src/utils/version.js';
import { versionPubliee, verificationDue, messageVerification, afficherMiseAJour } from '../src/ui/version.js';
import { CONFIG } from '../src/core/config.js';

describe('version de l\'application', () => {
    it('est celle de package.json', () => {
        // package.json n'entre pas dans l'image Docker et aucun bundler ne
        // l'injecte : le numéro de CONFIG est recopié à la main, et c'est ce
        // test qui interdit qu'il prenne du retard. Il en avait pris trois
        // versions durant.
        const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
        const paquet = JSON.parse(readFileSync(join(racine, 'package.json'), 'utf8'));

        expect(CONFIG.VERSION).toBe(paquet.version);
    });

    it('est un numéro lisible', () => {
        expect(analyserVersion(CONFIG.VERSION)).not.toBeNull();
    });
});

describe('analyserVersion', () => {
    it('décompose un numéro en trois entiers', () => {
        expect(analyserVersion('1.3.0')).toEqual([1, 3, 0]);
    });

    it('tolère le « v » du tag Git', () => {
        // package.json porte « 1.3.0 », l'API GitHub renvoie « v1.3.0 ».
        expect(analyserVersion('v1.3.0')).toEqual([1, 3, 0]);
        expect(analyserVersion('  v1.3.0  ')).toEqual([1, 3, 0]);
    });

    it('refuse une préversion au lieu de la tronquer', () => {
        // Tronquer « 1.4.0-rc1 » à [1, 4, 0] annoncerait une version finale qui
        // n'est pas sortie.
        expect(analyserVersion('1.4.0-rc1')).toBeNull();
        expect(analyserVersion('1.4.0+build.7')).toBeNull();
    });

    it('refuse ce qui n\'est pas un numéro', () => {
        expect(analyserVersion('latest')).toBeNull();
        expect(analyserVersion('1.3')).toBeNull();
        expect(analyserVersion('')).toBeNull();
        expect(analyserVersion(null)).toBeNull();
        expect(analyserVersion(130)).toBeNull();
    });
});

describe('comparerVersions', () => {
    it('classe sur les nombres, pas sur les chaînes', () => {
        // Le seul vrai piège : « 1.10.0 » < « 1.9.0 » en comparaison de textes.
        expect(comparerVersions([1, 10, 0], [1, 9, 0])).toBeGreaterThan(0);
        expect(comparerVersions([2, 0, 0], [1, 99, 99])).toBeGreaterThan(0);
        expect(comparerVersions([1, 3, 10], [1, 3, 9])).toBeGreaterThan(0);
    });

    it('rend zéro pour deux numéros égaux', () => {
        expect(comparerVersions([1, 3, 0], [1, 3, 0])).toBe(0);
    });
});

describe('miseAJourDisponible', () => {
    it('signale une version publiée postérieure', () => {
        expect(miseAJourDisponible('1.3.0', 'v1.4.0')).toBe(true);
        expect(miseAJourDisponible('1.9.0', 'v1.10.0')).toBe(true);
    });

    it('se tait quand on est à jour', () => {
        expect(miseAJourDisponible('1.3.0', 'v1.3.0')).toBe(false);
    });

    it('se tait quand la version locale est en avance', () => {
        // Le cas de qui travaille sur main après le tag : lui annoncer qu'il
        // est en retard serait faux.
        expect(miseAJourDisponible('1.4.0', 'v1.3.0')).toBe(false);
    });

    it('se tait devant un numéro illisible', () => {
        expect(miseAJourDisponible('1.3.0', '')).toBe(false);
        expect(miseAJourDisponible('1.3.0', 'latest')).toBe(false);
        expect(miseAJourDisponible('', 'v1.4.0')).toBe(false);
    });
});

describe('versionPubliee', () => {
    it('ne retient que le tag de la réponse', () => {
        expect(versionPubliee({ tag_name: 'v1.4.0', html_url: 'https://ailleurs.example/' })).toBe('v1.4.0');
    });

    it('écarte un tag qui n\'est pas un numéro', () => {
        // Rien de ce qui vient du réseau n'arrive dans la page sans passer par
        // cette porte.
        expect(versionPubliee({ tag_name: '<img src=x onerror=alert(1)>' })).toBeNull();
        expect(versionPubliee({ tag_name: 'nightly' })).toBeNull();
        expect(versionPubliee({})).toBeNull();
        expect(versionPubliee(null)).toBeNull();
    });
});

describe('messageVerification', () => {
    // La vérification automatique se tait ; celle qu'on demande d'un clic doit
    // répondre. Sans cela, un clic sans effet visible se lit comme une panne.
    it('confirme quand il n\'y a rien de plus récent', () => {
        expect(messageVerification('ok', '1.3.0', 'v1.3.0')).toBe('à jour');
    });

    it('ne répète pas l\'annonce quand il y a mieux', () => {
        // La ligne dédiée porte déjà le numéro et la commande.
        expect(messageVerification('ok', '1.3.0', 'v1.4.0')).toBe('');
    });

    it('dit qu\'il n\'a pas pu vérifier plutôt que de rassurer à tort', () => {
        // Sans Docker, /version-api n'existe pas : répondre « à jour » ici
        // affirmerait quelque chose qu'on n'a pas vérifié.
        expect(messageVerification('injoignable', '1.3.0', null)).toBe('vérification impossible');
        expect(messageVerification('ok', '1.3.0', null)).toBe('vérification impossible');
    });
});

describe('afficherMiseAJour', () => {
    const hote = () => document.createElement('div');

    it('n\'écrit rien quand il n\'y a rien de plus récent', () => {
        const cible = hote();
        afficherMiseAJour(cible, '1.3.0', 'v1.3.0');

        expect(cible.textContent).toBe('');
        expect(cible.children.length).toBe(0);
    });

    it('efface une annonce devenue caduque', () => {
        // Une vérification manuelle qui suit un relevé périmé doit retirer
        // l'annonce, pas l'empiler.
        const cible = hote();
        afficherMiseAJour(cible, '1.3.0', 'v1.4.0');
        afficherMiseAJour(cible, '1.3.0', 'v1.3.0');

        expect(cible.textContent).toBe('');
    });

    it('annonce la version et la commande qui l\'installe', () => {
        const cible = hote();
        afficherMiseAJour(cible, '1.3.0', 'v1.4.0');

        expect(cible.querySelector('a').textContent).toBe('La 1.4.0 est disponible');
        // Le lien est écrit en dur, jamais tiré de la réponse de l'API.
        expect(cible.querySelector('a').getAttribute('href'))
            .toBe('https://github.com/HermessNRJ/bricks-analyser/releases');

        const commande = cible.querySelector('pre code');

        expect(commande).not.toBeNull();
        expect(commande.textContent).toContain('docker pull');
        expect(commande.textContent).toContain('docker rm -f bricks');
        expect(commande.textContent).toContain('docker run -d -p 8080:80 --name bricks');
    });

    it('coupe la commande elle-même, aux barres obliques inversées', () => {
        // Laissée d'un seul tenant, elle se repliait après le tiret de
        // « --name » et affichait « -name » en début de ligne.
        const cible = hote();
        afficherMiseAJour(cible, '1.3.0', 'v1.4.0');

        const lignes = cible.querySelector('pre code').textContent.split('\n');

        expect(lignes.length).toBe(3);
        expect(lignes[0].endsWith('\\')).toBe(true);
        expect(lignes[1].endsWith('\\')).toBe(true);
        expect(lignes[2]).not.toContain('\\');
    });
});

describe('verificationDue', () => {
    const JOUR = 24 * 60 * 60 * 1000;

    it('laisse passer un jour entre deux appels', () => {
        expect(verificationDue(1000, 1000 + JOUR - 1, JOUR)).toBe(false);
        expect(verificationDue(1000, 1000 + JOUR, JOUR)).toBe(true);
    });

    it('vérifie à la première visite', () => {
        expect(verificationDue(0, Date.now(), JOUR)).toBe(true);
    });

    it('ne se fige pas si l\'horloge recule', () => {
        // Un horodatage dans le futur — changement de fuseau, correction NTP —
        // rendrait l'écart négatif et interdirait toute vérification ultérieure.
        expect(verificationDue(Date.now() + JOUR * 30, Date.now(), JOUR)).toBe(true);
        expect(verificationDue(Number.NaN, Date.now(), JOUR)).toBe(true);
    });
});
