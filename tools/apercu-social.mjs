/**
 * Fabrique l'image de prévisualisation sociale du dépôt (1280 × 640)
 *
 * Celle que GitHub affiche quand le lien est partagé, et que les réseaux
 * reprennent en carte. Elle est composée par la feuille de style de
 * l'application elle-même : les jetons de couleur, la sérif du titre et la
 * chasse fixe des montants sont ceux de l'écran, et une refonte du système
 * visuel se répercute ici en la régénérant.
 *
 * L'élément mis en avant est « le mur » — une brique par propriété, largeur
 * proportionnelle à l'investissement, couleur selon le statut, hachurée quand
 * le projet ne paie plus. C'est la seule chose que ce tableau de bord montre et
 * qu'aucun relevé ne montre : la forme d'un portefeuille d'un seul coup d'œil.
 * Il traverse la carte de bord à bord, parce qu'un portefeuille ne tient jamais
 * dans un cadre.
 *
 * Chiffres et proportions viennent du portefeuille de démonstration, jamais du
 * vôtre.
 *
 *   npm run demo && node tools/apercu-social.mjs
 *
 * Puis : dépôt → Settings → Social preview → Upload an image.
 */

import { chromium } from 'playwright';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = join(RACINE, 'data/demo.json');
const SORTIE = join(RACINE, 'docs/apercu-social.png');

const LARGEUR = 1280;
const HAUTEUR = 640;

if (!existsSync(SOURCE)) {
    console.error(`${SOURCE} est absent. Fabriquez-le d'abord : npm run demo`);
    process.exit(1);
}

const demo = JSON.parse(readFileSync(SOURCE, 'utf8'));

// Les projets se cumulent au fil des mois : c'est l'union qui fait le
// portefeuille, comme dans calculateInvestmentStats.
const uniques = new Map();
for (const mois of demo.data) {
    for (const projet of mois.projects || []) {
        if ((projet.ownedBricks || 0) > 0) {
            uniques.set(projet.id, projet);
        }
    }
}

// Le suivi officiel dit lesquels ne paient plus — c'est ce que la hachure code.
const enDefaut = new Set(
    Object.values(demo.statuts || {})
        .filter(s => s.suivi && s.statut === 'defaulted')
        .map(s => s.id)
);

const proprietes = [...uniques.values()]
    .map(p => ({
        id: p.id,
        investissement: (p.ownedBricks || 0) * ((typeof p.brickPrice === 'number' ? p.brickPrice : 1000) / 100),
        statut: p.projectStatus || 'financed',
        risque: enDefaut.has(p.id) ? 'procedure' : ''
    }))
    .filter(p => p.investissement > 0)
    .sort((a, b) => b.investissement - a.investissement);

const total = proprietes.reduce((somme, p) => somme + p.investissement, 0);
const defauts = proprietes.filter(p => p.risque).length;

const briques = proprietes.map(p => `<span class="brique"
    data-statut="${p.statut}"
    ${p.risque ? `data-risque="${p.risque}"` : ''}
    style="flex-grow:${p.investissement}"></span>`).join('');

const euros = n => n.toLocaleString('fr-FR').replace(/ | /g, ' ');

const page = `
<style>
    /* La carte impose sa mesure : elle n'est pas une page qui défile mais un
       cadre fixe, et rien ne doit dépendre de la fenêtre. */
    html, body { height: ${HAUTEUR}px; overflow: hidden; }
    body { display: block; background: var(--paper); }

    .haut { padding: 62px 64px 0; }

    h1 {
        font-family: var(--font-display);
        font-size: 60px;
        font-weight: 600;
        letter-spacing: -0.025em;
        line-height: 1.04;
        text-wrap: balance;
        max-width: 20ch;
    }

    .accroche {
        margin-top: 16px;
        font-size: 24px;
        color: var(--ink-muted);
    }

    /* Le mur traverse la carte de bord à bord, posé sur la même surface blanche
       que dans l'application. Coupé aux deux extrémités, il se lit comme le
       fragment d'un portefeuille plus long — ce qu'il est toujours. */
    .bande {
        margin-top: 46px;
        padding: 26px 0;
        background: var(--surface);
        border-top: var(--rule-width) solid var(--rule);
        border-bottom: var(--rule-width) solid var(--rule);
    }

    .mur-carte {
        display: flex;
        gap: 3px;
        height: 104px;
        width: 1420px;
        margin-left: -70px;
    }

    .brique { min-width: 4px; border-radius: 1px; }

    .chiffres {
        display: flex;
        gap: 64px;
        align-items: flex-start;
        padding: 34px 64px 0;
    }

    .chiffre b {
        display: block;
        font-family: var(--font-data);
        font-variant-numeric: tabular-nums;
        font-size: 38px;
        font-weight: 600;
        letter-spacing: -0.02em;
    }

    .chiffre span {
        display: block;
        margin-top: 6px;
        font-size: 14px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--ink-faint);
    }

    /* Le seul ton chaud de la carte, comme dans l'application : il ne sert qu'au
       risque, et c'est précisément ce que l'outil existe pour montrer. */
    .chiffre.est-risque b { color: var(--alerte); }

    .signature {
        position: absolute;
        right: 64px;
        bottom: 46px;
        text-align: right;
        font-size: 15px;
        line-height: 1.5;
        color: var(--ink-faint);
    }
</style>

<div class="haut">
    <h1>Analyseur d'investissements Bricks</h1>
    <p class="accroche">Vos briques, vos revenus et vos alertes, en un seul écran.</p>
</div>

<div class="bande">
    <div class="mur-carte">${briques}</div>
</div>

<div class="chiffres">
    <div class="chiffre"><b>${euros(total)} €</b><span>Capital engagé</span></div>
    <div class="chiffre"><b>${proprietes.length}</b><span>Propriétés</span></div>
    <div class="chiffre est-risque"><b>${defauts}</b><span>En défaut</span></div>
</div>

<p class="signature">Tourne chez vous, sans bundler<br>AGPL-3.0</p>
`;

const navigateur = await chromium.launch(
    process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}
);

const onglet = await navigateur.newPage({
    viewport: { width: LARGEUR, height: HAUTEUR },
    // Rendu à deux fois la taille : l'image reste nette là où les réseaux la
    // réaffichent plus grande que 1280 px.
    deviceScaleFactor: 2,
    // La carte est composée en clair, quel que soit le réglage de la machine
    // qui la fabrique.
    colorScheme: 'light'
});

await onglet.setContent(page, { waitUntil: 'load' });
await onglet.addStyleTag({ path: join(RACINE, 'src/styles/main.css') });
await onglet.addStyleTag({ content: page.match(/<style>([\s\S]*?)<\/style>/)[1] });
await onglet.evaluate(() => document.fonts.ready);

await onglet.screenshot({ path: SORTIE });
await navigateur.close();

console.log(`${SORTIE} · ${LARGEUR}×${HAUTEUR} rendu en 2×`);
console.log(`${proprietes.length} propriétés · ${euros(total)} € · ${defauts} en défaut`);
console.log('À téléverser dans : Settings → Social preview');
