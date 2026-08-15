/**
 * Smoke test de bout en bout : sert de garde-fou sur le démarrage réel de l'app.
 *
 * Contrairement aux tests unitaires (vitest, jsdom), celui-ci ouvre index.html dans
 * un vrai Chromium, avec un jeu de données injecté dans le localStorage — donc sans
 * token API ni données personnelles.
 *
 * Prérequis :
 *   npx playwright install chromium
 *   python3 -m http.server 8099   (ou docker-compose up -d, puis BASE_URL=...)
 *
 * Usage :
 *   node tests/e2e/smoke.mjs
 *   BASE_URL=http://localhost:8080 node tests/e2e/smoke.mjs
 */

import { chromium } from 'playwright';

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:8099';
const SCREENSHOT = process.env.SCREENSHOT || '';

const fixture = {
    data: [{
        yearMonthDate: '2024-01',
        projects: [
            {
                id: 'proj-1',
                name: { fr: 'Immeuble Lyon 3e' },
                address: { fr: '12 rue Garibaldi, Lyon' },
                ownedBricks: 25,
                brickPrice: 1000,
                yearlyTotalRentabilityPercentage: 9.5,
                investmentHorizonInMonths: 36,
                funding: { revenueStartDate: '2024-02' }
            },
            {
                id: 'proj-2',
                name: { fr: 'Villa 🇵🇹 Porto' },
                address: { fr: 'Rua do Almada, Porto' },
                ownedBricks: 40,
                brickPrice: 1000,
                yearlyTotalRentabilityPercentage: 11,
                investmentHorizonInMonths: 24,
                funding: { revenueStartDate: '2024-03' }
            },
            {
                // Vérifie que du HTML venant de l'API ne s'exécute jamais
                id: 'proj-xss',
                name: { fr: '<img src=x onerror="window.__XSS__=true">' },
                address: { fr: '</div><script>window.__XSS__=true</script>' },
                ownedBricks: 5,
                brickPrice: 1000,
                yearlyTotalRentabilityPercentage: 7,
                investmentHorizonInMonths: 12,
                funding: { revenueStartDate: '2024-01' }
            }
        ]
    }],
    warnings: [
        { propertyId: 'proj-1', date: '2024-06-01', description: '<p>Retard&nbsp;de travaux</p>' }
    ],
    // État de compte réduit : proj-1 verse tous les mois, proj-2 s'est tu en juin,
    // proj-xss n'a jamais rien versé. De quoi voir les trois pastilles à l'écran.
    revenus: {
        mensuel: {
            '2024-04': { brut: 6, net: 4.2, impot: 1.8, coupons: 6, parrainage: 0, boost: 0 },
            '2024-05': { brut: 6, net: 4.2, impot: 1.8, coupons: 6, parrainage: 0, boost: 0 },
            '2024-06': { brut: 2, net: 1.4, impot: 0.6, coupons: 2, parrainage: 0, boost: 0 }
        },
        versements: {
            'proj-1': { '2024-04': 4, '2024-05': 4, '2024-06': 2 },
            'proj-2': { '2024-04': 2, '2024-05': 2 }
        },
        parAnnee: { 2024: { brut: 14, net: 9.8, impot: 4.2, coupons: 14, parrainage: 0, boost: 0 } },
        premierMois: '2024-04',
        dernierMois: '2024-06',
        total: { brut: 14, net: 9.8, impot: 4.2 }
    },
    // Journal réduit : 600 € versés de la poche pour 700 € de briques, le reste
    // venant des coupons réinvestis.
    apports: {
        parMois: {
            '2024-01': { depot: 500, retrait: 0, net: 500 },
            '2024-03': { depot: 100, retrait: 0, net: 100 }
        },
        parAnnee: { 2024: { depot: 600, retrait: 0, net: 600 } },
        total: { depot: 600, retrait: 0, net: 600 },
        nombre: 2
    }
};

const checks = [];
const check = (label, condition, detail = '') => {
    checks.push({ label, ok: Boolean(condition), detail });
};

// CHROMIUM_PATH permet d'utiliser un Chromium déjà présent sur la machine
// plutôt que celui téléchargé par Playwright.
const browser = await chromium.launch(
    process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}
);
const page = await browser.newPage();

const pageErrors = [];
page.on('pageerror', err => pageErrors.push(err.message));

await page.addInitScript(payload => {
    localStorage.setItem('bricksInvestmentData', JSON.stringify(payload));
}, fixture);

await page.goto(`${BASE_URL}/index.html`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#propertiesList .property-card', { timeout: 10000 });

const snapshot = await page.evaluate(() => ({
    resultsVisible: !document.getElementById('results').classList.contains('hidden'),
    totalBricks: document.getElementById('totalBricks').textContent,
    totalInvestment: document.getElementById('totalInvestment').textContent,
    activeProperties: document.getElementById('totalProperties').textContent,
    cardCount: document.querySelectorAll('#propertiesList .property-card').length,
    projectionCount: document.querySelectorAll('#projectedRevenuesDisplay .stat-card').length,
    projectionNote: document.getElementById('projectionsNote').textContent.trim(),
    countries: [...document.getElementById('propertyCountryFilter').options].map(o => o.value),
    warningRendered: document.getElementById('propertiesList').textContent.includes('Retard de travaux'),
    xssExecuted: Boolean(window.__XSS__),
    injectedNodes: document.querySelectorAll('#propertiesList img[onerror], #propertiesList script').length,
    inlineHandlers: document.querySelectorAll('#propertiesList [onclick]').length,
    bilanVersements: document.getElementById('versementsCompte').textContent.replace(/\s+/g, ' ').trim(),
    pastilles: [...document.querySelectorAll('.versement-pastille')].map(e => e.textContent.trim()),
    carnets: document.querySelectorAll('.carnet').length,
    marquesVersees: document.querySelectorAll('.carnet-mois.est-verse').length,
    rendementVisible: !document.getElementById('rendementSection').classList.contains('hidden'),
    rendementFenetres: [...document.querySelectorAll('.rendement-fenetre')]
        .map(e => e.querySelector('.rendement-libelle').textContent.trim()),
    rendementTaux: [...document.querySelectorAll('.rendement-taux')].map(e => e.textContent.trim()),
    detailInvestissement: document.getElementById('detailInvestissement').textContent.trim(),
    colonneApportCachee: document.querySelector('th.colonne-apport').classList.contains('hidden'),
    apportsAnnuels: [...document.querySelectorAll('#revenusAnnuelsCorps td.colonne-apport')]
        .map(e => e.textContent.trim())
}));

check('la section résultats est affichée', snapshot.resultsVisible);
check('les 3 propriétés sont rendues', snapshot.cardCount === 3, `${snapshot.cardCount} cartes`);
check('le total de briques est correct', snapshot.totalBricks === '70', snapshot.totalBricks);
check('l\'investissement total est correct', /700/.test(snapshot.totalInvestment), snapshot.totalInvestment);
// La série s'arrête au dernier mois qui change de montant : tant qu'aucun projet
// ne commence à verser, répéter le même chiffre trois fois n'apprendrait rien.
check('les projections s\'arrêtent au dernier changement de montant',
    snapshot.projectionCount >= 1 && snapshot.projectionCount <= 4, `${snapshot.projectionCount} mois`);
check('la note dit à partir de quand le montant est stable',
    /stable/i.test(snapshot.projectionNote), snapshot.projectionNote);
check('le filtre pays détecte le Portugal', snapshot.countries.includes('Portugal'), snapshot.countries.join(','));
check('la description du warning est nettoyée et affichée', snapshot.warningRendered);
check('aucun HTML de l\'API n\'est exécuté', !snapshot.xssExecuted && snapshot.injectedNodes === 0);
check('aucun handler onclick inline', snapshot.inlineHandlers === 0);
check('le bilan des versements nomme le mois jugé',
    snapshot.bilanVersements.includes('Versements de juin 2024'), snapshot.bilanVersements);
check('chaque fiche porte sa pastille de versement',
    snapshot.pastilles.length === 3 && snapshot.carnets === 3, snapshot.pastilles.join(' / '));
check('les trois états de versement sont distingués',
    snapshot.pastilles.filter(p => p === 'Versé').length === 1
    && snapshot.pastilles.filter(p => p === 'Rien reçu').length === 2,
    snapshot.pastilles.join(' / '));
check('le carnet marque les mois versés', snapshot.marquesVersees === 5, `${snapshot.marquesVersees} marques`);

check('le rendement annualisé est affiché', snapshot.rendementVisible);
// Trois mois révolus : les fenêtres de 6 et 12 mois n'ont pas de quoi être
// calculées, et une fenêtre affichée sur des mois qu'on n'a pas serait fausse.
check('les fenêtres se limitent à l\'historique disponible',
    snapshot.rendementFenetres.join(' / ') === '1 mois / 3 mois / Depuis le début',
    snapshot.rendementFenetres.join(' / '));
// 1,40 € perçus en juin sur 700 € placés, ramenés à l'année
// L'espace avant le signe est une espace fine insécable, posée par Intl
check('le taux du dernier mois révolu est annualisé',
    /^2,4\s*%$/.test(snapshot.rendementTaux[0]), snapshot.rendementTaux.join(' / '));
// Aucune part n'est annoncée : ce serait comparer un flux — tout ce qui est
// entré depuis l'ouverture — à l'état du capital encore engagé aujourd'hui.
check('la tuile du capital dit ce qui a été versé depuis l\'ouverture',
    /600/.test(snapshot.detailInvestissement)
    && /depuis l'ouverture/.test(snapshot.detailInvestissement),
    snapshot.detailInvestissement);
check('la colonne des versements personnels est ouverte', !snapshot.colonneApportCachee);
check('le tableau annuel porte les versements personnels',
    snapshot.apportsAnnuels.every(v => /600/.test(v)), snapshot.apportsAnnuels.join(' / '));

// Déplier les actualités ne doit pas ouvrir le projet : le clic sur le résumé
// remontait jusqu'à la fiche, qui est un lien vers Bricks.
const depliant = page.locator('#propertiesList details.alertes summary').first();

if (await depliant.count() > 0) {
    const ongletsAvant = page.context().pages().length;
    await depliant.click();
    await page.waitForTimeout(200);

    const ouvert = await page.locator('#propertiesList details.alertes').first()
        .evaluate(d => d.open);

    check('déplier les actualités n\'ouvre pas le projet',
        ouvert && page.context().pages().length === ongletsAvant,
        `ouvert: ${ouvert}, onglets: ${page.context().pages().length}`);
} else {
    check('déplier les actualités n\'ouvre pas le projet', false, 'aucun dépliant rendu');
}

// Interactions réelles : filtre puis tri
await page.selectOption('#propertyCountryFilter', 'Portugal');
await page.waitForFunction(() =>
    document.querySelectorAll('#propertiesList .property-card').length === 1, null, { timeout: 5000 })
    .then(() => check('le filtre pays réduit la liste à 1 propriété', true))
    .catch(() => check('le filtre pays réduit la liste à 1 propriété', false));

await page.selectOption('#propertyCountryFilter', 'all');

await page.selectOption('#propertyVersementFilter', 'manquant');
await page.waitForFunction(() =>
    document.querySelectorAll('#propertiesList .property-card').length === 2, null, { timeout: 5000 })
    .then(() => check('le filtre « rien reçu » retient les 2 propriétés muettes', true))
    .catch(() => check('le filtre « rien reçu » retient les 2 propriétés muettes', false));

await page.selectOption('#propertyVersementFilter', 'all');
await page.selectOption('#propertySortBy', 'bricks-desc');
const firstCard = await page.locator('#propertiesList .property-name').first().textContent();
check('le tri par briques place Porto en tête', firstCard.includes('Porto'), firstCard.trim());

// Les erreurs de chargement du CDN Chart.js ne doivent pas casser le rendu
check('aucune erreur JS non gérée', pageErrors.length === 0, pageErrors.join(' | '));

if (SCREENSHOT) {
    await page.screenshot({ path: SCREENSHOT, fullPage: true });
}

await browser.close();

const failed = checks.filter(c => !c.ok);
for (const { label, ok, detail } of checks) {
    console.log(`${ok ? '✓' : '✗'} ${label}${detail ? ` (${detail})` : ''}`);
}
console.log(`\n${checks.length - failed.length}/${checks.length} vérifications passées`);

process.exit(failed.length === 0 ? 0 : 1);
