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
                // Le code postal porte toute la déduction géographique : sans
                // lui la section n'aurait qu'une ligne « Localisation imprécise »
                address: { fr: '12 rue Garibaldi, 69003 Lyon' },
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
    // Suivi officiel de proj-1 : deux échéances jamais versées, précédées d'une
    // régularisée. Celle-ci ne doit plus son coupon mais doit encore sa pénalité,
    // recouvrée auprès de l'emprunteur et pas encore reversée — c'est le cas qui
    // sépare les deux courbes des arriérés.
    statuts: {
        'proj-1': {
            id: 'proj-1',
            suivi: true,
            statut: 'defaulted',
            impayees: 2,
            penalites: 8000,
            briquesProjet: 100000,
            premiereEcheanceImpayee: '2024-05-20',
            derniereEcheanceImpayee: '2024-06-20',
            contentieux: false,
            echeances: [
                { mois: '2024-04', statut: 'regularized', penalitesProjet: 8000 },
                { mois: '2024-05', statut: 'unpaid', penalitesProjet: 0 },
                { mois: '2024-06', statut: 'unpaid', penalitesProjet: 0 }
            ]
        }
    },
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

// Le favori est bâti après un aller-retour vers la source : il n'est pas prêt
// au même instant que le reste de la page.
await page.waitForFunction(
    () => document.getElementById('favoriCollecte')?.getAttribute('href')?.startsWith('javascript:'),
    { timeout: 10000 }
);

const snapshot = await page.evaluate(() => ({
    // Le favori tel qu'il partirait dans la barre : c'est la seule vérification
    // qui porte sur le code réellement installé, l'emballage compris.
    favori: (() => {
        const href = document.getElementById('favoriCollecte').getAttribute('href');
        const source = decodeURIComponent(href.slice('javascript:'.length));

        return {
            analysable: (() => { try { new Function(source); return true; } catch { return false; } })(),
            hotes: [...new Set([...source.matchAll(/https?:\/\/([\w.-]+)/g)].map(m => m[1]))],
            avecIdentifiants: source.includes("credentials: 'include'"),
            litLeCookie: source.includes('document.cookie')
        };
    })(),
    resultsVisible: !document.getElementById('results').classList.contains('hidden'),
    totalBricks: document.getElementById('totalBricks').textContent,
    totalInvestment: document.getElementById('totalInvestment').textContent,
    activeProperties: document.getElementById('totalProperties').textContent,
    cardCount: document.querySelectorAll('#propertiesList .property-card').length,
    projectionCount: document.querySelectorAll('#projectedRevenuesDisplay .stat-card').length,
    projectionNote: document.getElementById('projectionsNote').textContent.trim(),
    countries: [...document.getElementById('propertyCountryFilter').options].map(o => o.value),
    warningRendered: document.getElementById('propertiesList').textContent.includes('Retard de travaux'),
    resumeAlertes: document.querySelector('#propertiesList .alertes-entete')?.textContent
        .replace(/\s+/g, ' ').trim() ?? '',
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
    rendementTauxBrut: [...document.querySelectorAll('.rendement-taux-brut')].map(e => e.textContent.trim()),
    rendementMontants: [...document.querySelectorAll('.rendement-fenetre')]
        .map(e => [...e.querySelectorAll('.rendement-montants span')].map(s => s.textContent.trim())),
    repereRendement: document.getElementById('repereRendement').textContent.trim(),
    correspondanceRendement: document.getElementById('correspondanceRendement').textContent.trim(),
    repereApport: document.getElementById('repereApport').textContent.trim(),
    champRendement: document.getElementById('simRendement').value,
    // Le repère du graphique se lit dans les options du plugin : c'est la valeur
    // que le trait pointillé vient dessiner.
    repereGraphique: (() => {
        const chart = Object.values(window.Chart?.instances || {})
            .find(c => c.canvas.id === 'origineFondsChart');
        return chart?.options.plugins.repereMoyenne.valeur ?? null;
    })(),
    moisOrigine: (() => {
        const chart = Object.values(window.Chart?.instances || {})
            .find(c => c.canvas.id === 'origineFondsChart');
        return chart?.data.labels.length ?? 0;
    })(),
    // Les arriérés : les deux courbes, et la barre du total que dresse le plugin
    arrieresAffiche: document.getElementById('arrieresContainer').style.display !== 'none',
    arrieresNote: document.getElementById('arrieresNote').textContent.trim(),
    arrieresCourbes: (() => {
        const chart = Object.values(window.Chart?.instances || {})
            .find(c => c.canvas.id === 'arrieresChart');
        return chart
            ? chart.data.datasets.map(d => ({ label: d.label, fin: d.data[d.data.length - 1] }))
            : [];
    })(),
    arrieresRepere: (() => {
        const chart = Object.values(window.Chart?.instances || {})
            .find(c => c.canvas.id === 'arrieresChart');
        return chart?.options.plugins.repereTotal ?? null;
    })(),
    arrieresDernierMois: (() => {
        const chart = Object.values(window.Chart?.instances || {})
            .find(c => c.canvas.id === 'arrieresChart');
        return chart?.data.labels.at(-1) ?? null;
    })(),
    // Le camembert des versements : la partition doit retomber sur les
    // pastilles des fiches, et les projets soldés commencer hors du disque.
    statuts: (() => {
        const chart = Object.values(window.Chart?.instances || {})
            .find(c => c.canvas.id === 'statutsChart');

        if (!chart) {
            return null;
        }

        return {
            libelles: chart.data.labels,
            valeurs: chart.data.datasets[0].data,
            visibles: chart.data.labels.map((_, i) => chart.getDataVisibility(i))
        };
    })(),
    // La section Géographie avant tout dépliage : présente mais vide, c'est
    // tout l'intérêt du rendu différé.
    geoAvant: {
        cachee: document.getElementById('geographieSection').classList.contains('hidden'),
        lignes: document.querySelectorAll('#geoLieuxCorps tr').length
    },
    regionsMenu: [...document.getElementById('propertyRegionFilter').options].map(o => o.value),
    departementsMenu: [...document.getElementById('propertyDepartementFilter').options].map(o => o.textContent),
    detailInvestissement: document.getElementById('detailInvestissement').textContent.trim(),
    colonneApportCachee: document.querySelector('th.colonne-apport').classList.contains('hidden'),
    apportsAnnuels: [...document.querySelectorAll('#revenusAnnuelsCorps td.colonne-apport')]
        .map(e => e.textContent.trim())
}));

check('le favori installé est du JavaScript valide', snapshot.favori.analysable);
check('le favori ne joint que Bricks', snapshot.favori.hotes.join(',') === 'api.bricks.co',
    snapshot.favori.hotes.join(','));
check('le favori laisse le navigateur joindre la session',
    snapshot.favori.avecIdentifiants && !snapshot.favori.litLeCookie);

check('la section résultats est affichée', snapshot.resultsVisible);
check('les 3 propriétés sont rendues', snapshot.cardCount === 3, `${snapshot.cardCount} cartes`);
check('le total de briques est correct', snapshot.totalBricks === '70', snapshot.totalBricks);
check('l\'investissement total est correct', /700/.test(snapshot.totalInvestment), snapshot.totalInvestment);
// La série s'arrête au dernier mois qui change de montant : tant qu'aucun projet
// ne commence à verser, répéter le même chiffre trois fois n'apprendrait rien.
check('les projections s\'arrêtent au dernier changement de montant',
    snapshot.projectionCount >= 1 && snapshot.projectionCount <= 4, `${snapshot.projectionCount} mois`);
check('la note dit pourquoi la série s\'arrête là',
    /ne bouge plus ensuite/.test(snapshot.projectionNote), snapshot.projectionNote);
check('le filtre pays détecte le Portugal', snapshot.countries.includes('Portugal'), snapshot.countries.join(','));
check('la description du warning est nettoyée et affichée', snapshot.warningRendered);
// Le résumé du dépliant se compose par interpolation : une variable qui n'est
// pas la chaîne attendue s'y écrit telle quelle, et le libellé part en vrille
// sans que rien d'autre ne bronche.
check('le résumé des alertes se lit en français',
    /^▲? ?1 alerte (récente|ancienne)$/.test(snapshot.resumeAlertes), snapshot.resumeAlertes);
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
// Le simulateur raisonne en brut : sans cette ligne, les deux blocs affichaient
// deux pourcentages sans que rien ne dise lequel était lequel.
check('chaque fenêtre porte aussi son taux brut',
    snapshot.rendementTauxBrut.length === snapshot.rendementTaux.length
    && snapshot.rendementTauxBrut.every(t => /brut/.test(t)),
    snapshot.rendementTauxBrut.join(' / '));
check('chaque fenêtre donne le net et le brut au mois',
    snapshot.rendementMontants.every(([net, brut]) =>
        /nets par mois/.test(net || '') && /bruts/.test(brut || '')),
    JSON.stringify(snapshot.rendementMontants));
// Le repère du simulateur doit reprendre, au chiffre près, ce que la fenêtre la
// plus longue affiche : c'est tout l'objet du rapprochement.
check('le repère du simulateur rejoint la tuile de rendement',
    snapshot.repereRendement.includes(`${snapshot.rendementTaux.at(-1)} net`)
    && snapshot.repereRendement.includes(snapshot.rendementTauxBrut.at(-1)),
    `${snapshot.repereRendement} — tuile : ${snapshot.rendementTaux.at(-1)} net,`
    + ` ${snapshot.rendementTauxBrut.at(-1)}`);
// « soit 4,8 % net » s'enchaînait au repère et paraissait qualifier le taux
// annoncé par Bricks, alors qu'il découle du champ.
check('la correspondance nette nomme le taux dont elle part',
    /saisis\s*→/.test(snapshot.correspondanceRendement), snapshot.correspondanceRendement);
// Le champ partait du constaté, qui a DÉJÀ perdu ses échéances impayées, puis la
// simulation leur appliquait le taux d'impayés : les mêmes incidents comptaient
// deux fois et la projection tombait sous ce que le portefeuille fait vraiment.
check('le simulateur part du taux annoncé, que les impayés viendront creuser',
    Math.abs(Number(snapshot.champRendement) - 10.2) < 0.05, snapshot.champRendement);
// Deux hypothèses plausibles séparément peuvent viser un rendement que le
// portefeuille n'a jamais approché : la ligne doit le dire.
check('la correspondance se confronte au constaté',
    /le constaté/.test(snapshot.correspondanceRendement), snapshot.correspondanceRendement);
check('le repère ne dit pas « sur depuis le début »',
    !/sur depuis/.test(snapshot.repereRendement), snapshot.repereRendement);
check('le graphique des arriérés est dessiné', snapshot.arrieresAffiche
    && snapshot.arrieresCourbes.length === 2, JSON.stringify(snapshot.arrieresCourbes));
// Trois échéances au dossier, mais la régularisée a fini par verser son coupon :
// deux coupons manqués à 1,98 €, pas trois. C'est la règle que le graphique
// existe pour montrer — ce qui arrive sort de la courbe.
check('le coupon d\'une échéance régularisée quitte la courbe',
    Math.abs(snapshot.arrieresCourbes[0]?.fin - 3.96) < 0.02,
    `${snapshot.arrieresCourbes[0]?.fin} € de coupons`);
// Sa pénalité, elle, reste due : recouvrée auprès de l'emprunteur n'est pas
// encore arrivée chez l'obligataire. 8 000 € pour 100 000 briques, 25 détenues.
check('la pénalité d\'une régularisée reste due',
    Math.abs(snapshot.arrieresCourbes[1]?.fin - 2) < 0.02,
    `${snapshot.arrieresCourbes[1]?.fin} € de pénalités`);
// La barre se dresse sur les mois DESSINÉS : la lire ailleurs qu'au bout des
// courbes annoncerait un total qu'elles n'atteignent jamais.
check('la barre du total additionne les deux courbes',
    Math.abs((snapshot.arrieresRepere?.coupons + snapshot.arrieresRepere?.penalites)
        - (snapshot.arrieresCourbes[0]?.fin + snapshot.arrieresCourbes[1]?.fin)) < 0.01,
    JSON.stringify(snapshot.arrieresRepere));
// Un trou creusé en 2024 est toujours ouvert aujourd'hui : une courbe qui
// s'arrêterait à la dernière échéance laisserait croire l'inverse.
check('la courbe court jusqu\'au mois courant',
    snapshot.arrieresDernierMois === new Date().toISOString().slice(0, 7),
    snapshot.arrieresDernierMois);
// Projet français : le prélèvement mordra sur ce qui finira par arriver
check('la note chiffre ce que le prélèvement laisserait',
    /le prélèvement en laisserait/.test(snapshot.arrieresNote), snapshot.arrieresNote);

// Aucune part n'est annoncée : ce serait comparer un flux — tout ce qui est
// entré depuis l'ouverture — à l'état du capital encore engagé aujourd'hui.
check('la tuile du capital dit ce qui a été versé depuis l\'ouverture',
    /600/.test(snapshot.detailInvestissement)
    && /depuis l'ouverture/.test(snapshot.detailInvestissement),
    snapshot.detailInvestissement);
// Le simulateur lisait ce repère dans la courbe d'investissement, qui amortit et
// compte les briques payées avec les coupons réinvestis : il annonçait presque le
// double de ce que le graphique montrait sur la même période.
check('le repère d\'apport se lit dans le journal, pas dans l\'investissement',
    /versés de votre poche/.test(snapshot.repereApport), snapshot.repereApport);
// Trois mois d'historique : annoncer « vos 12 derniers mois » ferait dire au
// repère le contraire de ce qu'il calcule.
check('le repère annonce la fenêtre qu\'il mesure vraiment',
    snapshot.repereApport.startsWith(`vos ${snapshot.moisOrigine} derniers mois`),
    `${snapshot.repereApport} — ${snapshot.moisOrigine} mois dessinés`);
// Le trait restait calé sur tout l'historique quand les barres n'en montraient
// qu'une fenêtre : moyenne × mois dessinés doit retomber sur les 600 € versés.
check('le trait moyen du graphique porte sur les mois dessinés',
    Math.abs(snapshot.repereGraphique * snapshot.moisOrigine - 600) < 0.01,
    `${snapshot.repereGraphique} € × ${snapshot.moisOrigine} mois`);
// Les deux blocs répondent à la même question et doivent donc, sur la même
// fenêtre, donner le même chiffre.
// Intl sépare le montant du symbole par une espace fine insécable : comparer à
// une espace ordinaire échouerait sur deux chiffres pourtant identiques.
check('le graphique et le simulateur donnent le même rythme',
    snapshot.repereApport.replace(/\s/g, ' ')
        .includes(`${Math.round(snapshot.repereGraphique)} €`),
    `${snapshot.repereApport} — trait à ${snapshot.repereGraphique} €`);
// Le camembert reprend la même partition que les pastilles : une propriété qui
// verse, deux muettes, aucune soldée. Un total qui s'en écarterait voudrait dire
// qu'un état échappe au disque.
check('le camembert reprend les quatre états de versement',
    snapshot.statuts?.libelles.join(' / ')
        === 'À jour / Démarrage en attente / En retard / Déjà remboursé',
    snapshot.statuts?.libelles.join(' / ') ?? 'aucun graphique');
check('le camembert compte comme les pastilles',
    snapshot.statuts?.valeurs.join(',') === '1,0,2,0',
    snapshot.statuts?.valeurs.join(','));
check('les projets soldés commencent décochés',
    snapshot.statuts?.visibles.join(',') === 'true,true,true,false',
    snapshot.statuts?.visibles.join(','));

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

// Trois fiches tiennent sur une page : ni onglets ni réglage de taille à montrer
check('la pagination se tait quand tout tient sur une page',
    await page.locator('#pagination').evaluate(n => n.classList.contains('hidden')));

// La géographie. Les trois cas du portefeuille de test se retrouvent ici : un
// bien situé par son code postal, un bien étranger rangé sous son pays, et une
// adresse dont on n'a rien pu tirer — comptée, jamais fondue dans une région.
check('la section Géographie est proposée', !snapshot.geoAvant.cachee);
check('elle ne se dessine pas tant qu\'elle est repliée',
    snapshot.geoAvant.lignes === 0, `${snapshot.geoAvant.lignes} lignes`);
check('le menu des régions liste ce que le portefeuille contient, l\'imprécis en dernier',
    snapshot.regionsMenu.join(' / ') === 'all / Auvergne-Rhône-Alpes / Portugal / Localisation imprécise',
    snapshot.regionsMenu.join(' / '));
check('le menu des départements nomme le code',
    snapshot.departementsMenu.join(' / ') === 'Tous / 69 — Rhône',
    snapshot.departementsMenu.join(' / '));

await page.click('#geographieSection summary');
await page.waitForTimeout(300);

const geo = await page.evaluate(() => ({
    departements: document.getElementById('geoDepartements').textContent,
    villes: document.getElementById('geoVilles').textContent,
    premiere: document.getElementById('geoPremiereRegion').textContent,
    note: document.getElementById('geoNote').textContent.replace(/\s+/g, ' ').trim(),
    regions: [...document.querySelectorAll('.geo-region-nom')].map(e => e.textContent),
    lignes: document.querySelectorAll('#geoLieuxCorps tr').length,
    communes: [...document.querySelectorAll('#geoLieuxCorps .geo-lieu-bouton')].map(e => e.textContent),
    // L'adresse piégée passe par le tableau : elle doit y arriver échappée
    injectes: document.querySelectorAll('#geoLieuxCorps script, #geoLieuxCorps img[onerror]').length
}));

check('le dépliage compose le tableau', geo.lignes === 3, `${geo.lignes} lignes`);
check('le code postal situe le bien lyonnais',
    geo.departements === '1' && geo.villes === '1' && geo.communes.includes('Lyon'),
    `${geo.departements} départements, ${geo.villes} communes, ${geo.communes.join(' / ')}`);
check('le bien étranger passe en tête, sous son pays',
    geo.premiere === 'Portugal' && geo.regions[0] === 'Portugal',
    `${geo.premiere} — ${geo.regions.join(' / ')}`);
check('l\'adresse illisible est comptée, pas rangée dans une région',
    geo.regions.includes('Localisation imprécise')
    && /1 propriété n'a pas d'adresse exploitable/.test(geo.note),
    geo.note);
check('aucun HTML de l\'API n\'est exécuté dans le tableau des localisations',
    !geo.injectes && !(await page.evaluate(() => Boolean(window.__XSS__))));

// La carte : le tracé n'est pas dans la page, il arrive du réseau au dépliage.
await page.waitForSelector('#geoCarteTrace svg', { timeout: 10000 })
    .then(() => check('le tracé des départements est chargé au dépliage', true))
    .catch(() => check('le tracé des départements est chargé au dépliage', false));

const carte = await page.evaluate(() => {
    const teintes = {};
    document.querySelectorAll('#geoCarteTrace path[data-code]').forEach(c => {
        const rang = c.dataset.palier || 'aucun';
        teintes[rang] = (teintes[rang] || 0) + 1;
    });

    return {
        chemins: document.querySelectorAll('#geoCarteTrace path[data-code]').length,
        teintes,
        // Cachée aux lecteurs d'écran : la même chose est dans le tableau,
        // sous une forme qui s'énonce.
        masquee: document.getElementById('geoCarte').getAttribute('aria-hidden'),
        note: document.getElementById('geoCarteNote').textContent.trim()
    };
});

check('la carte porte les 101 départements', carte.chemins === 101, `${carte.chemins} tracés`);
// Un seul bien situé, dans le Rhône : lui seul est teint, les cent autres
// départements restent au ton du vide plutôt qu'au premier palier.
check('seul le département qui porte quelque chose est teinté',
    carte.teintes['5'] === 1 && carte.teintes.aucun === 100,
    JSON.stringify(carte.teintes));
check('la carte est cachée aux lecteurs d\'écran', carte.masquee === 'true');
check('la note nomme le département le plus chargé',
    /Rhône \(69\)/.test(carte.note), carte.note);

// Cliquer un département renvoie au registre ; un département vide ne fait rien
await page.click('#dep-69');
await page.waitForTimeout(400);

const apresCarte = await page.evaluate(() => ({
    fiches: document.querySelectorAll('#propertiesList .property-card').length,
    puces: [...document.querySelectorAll('.puce')].map(e => e.textContent.trim().replace(/\s+/g, ' '))
}));

check('cliquer un département filtre le registre',
    apresCarte.fiches === 1 && apresCarte.puces.some(p => p.startsWith('69 — Rhône')),
    `${apresCarte.fiches} fiches — ${apresCarte.puces.join(' / ')}`);

await page.click('[data-clear="departementFilter"]');
await page.waitForTimeout(300);
await page.click('#dep-15');
await page.waitForTimeout(300);

check('cliquer un département vide ne filtre rien',
    await page.evaluate(() => document.querySelectorAll('.puce').length) === 0);

// La recherche du tableau mord sur les colonnes de texte, département compris
await page.fill('#geoRecherche', 'rhône');
await page.waitForTimeout(200);

const cherche = await page.evaluate(() => ({
    lignes: document.querySelectorAll('#geoLieuxCorps tr[data-lieu]').length,
    communes: [...document.querySelectorAll('#geoLieuxCorps tr[data-lieu] .geo-lieu-bouton')]
        .map(e => e.textContent),
    compte: document.getElementById('geoLieuxCompte').textContent.replace(/\s+/g, ' ').trim()
}));

check('la recherche mord sur le nom du département',
    cherche.lignes === 1 && cherche.communes[0] === 'Lyon',
    `${cherche.lignes} lignes : ${cherche.communes.join(' / ')}`);
check('le décompte rappelle le total quand la recherche filtre',
    cherche.compte === '1 sur 3 localisations', cherche.compte);

await page.fill('#geoRecherche', 'zzz');
await page.waitForTimeout(200);
check('une recherche sans réponse le dit',
    await page.locator('.geo-lieux-vide').isVisible());

await page.fill('#geoRecherche', '');
await page.waitForTimeout(200);

// Le clic sur une ligne renvoie au registre, filtré sur ce lieu précis
await page.click('#geoLieuxCorps tr[data-lieu] .geo-lieu-bouton:has-text("Lyon")');
await page.waitForTimeout(400);

const apresClic = await page.evaluate(() => ({
    fiches: [...document.querySelectorAll('#propertiesList .property-name')].map(e => e.textContent.trim()),
    puces: [...document.querySelectorAll('.puce')].map(e => e.textContent.trim().replace(/\s+/g, ' ')),
    retenu: localStorage.getItem('propertyLieuFilter')
}));

check('cliquer une localisation ne garde que ses biens au registre',
    apresClic.fiches.length === 1 && apresClic.fiches[0].includes('Lyon'),
    apresClic.fiches.join(' / '));
check('le filtre de lieu est rappelé en puce, nommé',
    apresClic.puces.some(p => p.startsWith('Lyon (69)')), apresClic.puces.join(' / '));
check('la clé du lieu est celle du tableau', apresClic.retenu === '69/Lyon', apresClic.retenu);

// La puce se retire comme les autres
await page.click('[data-clear="lieuFilter"]');
await page.waitForTimeout(300);
check('retirer la puce rouvre le registre',
    await page.evaluate(() => document.querySelectorAll('#propertiesList .property-card').length) === 3);

await page.click('#geographieSection summary');

// L'interrupteur de thème. Ce qui se vérifie ici n'est pas la couleur — un
// canevas ne se relit pas — mais que la feuille de nuit change d'état, que la
// préférence soit écrite, et que le basculement fasse redessiner les graphiques
// sans réveiller d'instance détruite.
const themeAvant = await page.evaluate(() => ({
    affiche: document.documentElement.dataset.themeAffiche,
    media: document.getElementById('feuilleNuit').media
}));

check('la feuille de nuit part sur la préférence du système',
    themeAvant.media === '(prefers-color-scheme: dark)', themeAvant.media);

const erreursAvantTheme = pageErrors.length;

await page.click('#basculeTheme');
await page.waitForTimeout(700);

const themeApres = await page.evaluate(() => ({
    affiche: document.documentElement.dataset.themeAffiche,
    demande: document.documentElement.dataset.theme,
    media: document.getElementById('feuilleNuit').media,
    retenu: localStorage.getItem('theme'),
    // Le canevas est retracé : l'instance ne doit pas être celle d'avant
    statutsVivant: Object.values(window.Chart?.instances || {})
        .some(c => c.canvas.id === 'statutsChart')
}));

check('l\'interrupteur mène au thème opposé',
    themeApres.affiche !== themeAvant.affiche,
    `${themeAvant.affiche} → ${themeApres.affiche}`);
check('la feuille de nuit est mise en service ou désarmée',
    ['all', 'not all'].includes(themeApres.media), themeApres.media);
check('le thème choisi est retenu pour la prochaine visite',
    themeApres.retenu === themeApres.demande,
    `${themeApres.retenu} / ${themeApres.demande}`);
check('les graphiques sont redessinés après le basculement', themeApres.statutsVivant);
check('basculer le thème ne lève aucune exception',
    pageErrors.length === erreursAvantTheme,
    pageErrors.slice(erreursAvantTheme).join(' | '));

// Un second appui doit ramener à ce qui était affiché : c'est ce qui rend un
// bouton à deux positions suffisant. Il remet aussi la page d'aplomb pour la
// suite du test et pour une éventuelle capture.
await page.click('#basculeTheme');
await page.waitForTimeout(400);

const themeRetour = await page.evaluate(() => document.documentElement.dataset.themeAffiche);

check('un second appui revient au thème de départ',
    themeRetour === themeAvant.affiche, `${themeApres.affiche} → ${themeRetour}`);

await page.evaluate(() => localStorage.removeItem('theme'));

// Deux tracés rapprochés, comme lorsque les résultats s'affichent une seconde
// fois : le treemap est reconstruit avant que ses redessins différés se soient
// exécutés. Ils réveillaient l'instance détruite, et Chart.js levait trois fois
// la même exception — rien ne manquait à l'écran, mais la console en devenait
// inutilisable. L'attente dépasse le dernier des redessins.
const erreursAvantRetrace = pageErrors.length;

await page.evaluate(async () => {
    const [chartManager, coeur] = await Promise.all([
        import('/src/charts/chartManager.js'),
        import('/src/core/state.js')
    ]);

    const resultats = coeur.state.get('lastResults');

    chartManager.createCharts(resultats);
    chartManager.createCharts(resultats);
});

await page.waitForTimeout(800);

check('retracer les graphiques ne réveille aucune instance détruite',
    pageErrors.length === erreursAvantRetrace,
    pageErrors.slice(erreursAvantRetrace).join(' | '));

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
