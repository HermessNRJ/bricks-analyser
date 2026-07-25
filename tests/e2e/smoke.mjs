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
    ]
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
    countries: [...document.getElementById('propertyCountryFilter').options].map(o => o.value),
    warningRendered: document.getElementById('propertiesList').textContent.includes('Retard de travaux'),
    xssExecuted: Boolean(window.__XSS__),
    injectedNodes: document.querySelectorAll('#propertiesList img[onerror], #propertiesList script').length,
    inlineHandlers: document.querySelectorAll('#propertiesList [onclick]').length
}));

check('la section résultats est affichée', snapshot.resultsVisible);
check('les 3 propriétés sont rendues', snapshot.cardCount === 3, `${snapshot.cardCount} cartes`);
check('le total de briques est correct', snapshot.totalBricks === '70', snapshot.totalBricks);
check('l\'investissement total est correct', /700/.test(snapshot.totalInvestment), snapshot.totalInvestment);
check('les 4 mois de projection sont affichés', snapshot.projectionCount === 4);
check('le filtre pays détecte le Portugal', snapshot.countries.includes('Portugal'), snapshot.countries.join(','));
check('la description du warning est nettoyée et affichée', snapshot.warningRendered);
check('aucun HTML de l\'API n\'est exécuté', !snapshot.xssExecuted && snapshot.injectedNodes === 0);
check('aucun handler onclick inline', snapshot.inlineHandlers === 0);

// Interactions réelles : filtre puis tri
await page.selectOption('#propertyCountryFilter', 'Portugal');
await page.waitForFunction(() =>
    document.querySelectorAll('#propertiesList .property-card').length === 1, null, { timeout: 5000 })
    .then(() => check('le filtre pays réduit la liste à 1 propriété', true))
    .catch(() => check('le filtre pays réduit la liste à 1 propriété', false));

await page.selectOption('#propertyCountryFilter', 'all');
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
