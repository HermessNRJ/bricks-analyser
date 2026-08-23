/**
 * Contrat de nginx.conf, vérifié contre l'image réellement construite
 *
 * Ni le lint, ni les tests unitaires, ni le smoke ne lisent nginx.conf : le
 * smoke tourne contre le serveur python de « npm run serve », qui ne relaie
 * rien et n'envoie aucun en-tête de sécurité. Tout ce fichier de configuration
 * n'était donc tenu par rien.
 *
 * Ce n'est pas une inquiétude de principe. Le relais des vignettes, écrit en
 * expression régulière, perdait contre la règle de cache des images imbriquée
 * dans « location / » : seuls les .webp étaient relayés, et la panne ne se
 * voyait que sur une partie des photos. Lint, tests unitaires et smoke étaient
 * tous verts.
 *
 * Ce qui est éprouvé ici est le routage, pas les API d'en face. Un relais qui
 * fonctionne peut répondre 403, 404 ou 502 selon l'humeur du réseau et de
 * Cloudflare ; ce qui ne doit jamais arriver, c'est qu'il rende la page
 * d'accueil. « try_files … /index.html » répond 200 pour tout chemin inconnu,
 * et c'est exactement la signature d'un relais qui n'a pas pris.
 *
 * Prérequis : l'image doit tourner.
 *   docker compose up -d --build
 *
 * Usage :
 *   npm run test:nginx
 *   BASE_URL=http://localhost:8082 npm run test:nginx
 */

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:8080';

const checks = [];
const check = (label, condition, detail = '') => {
    checks.push({ label, ok: Boolean(condition), detail });
};

/**
 * Interroge un chemin sans jamais suivre de redirection
 * @param {string} chemin - Chemin absolu, à partir de la racine
 * @returns {Promise<{statut: number, entetes: Headers, corps: string}>} La réponse
 */
async function demander(chemin) {
    const reponse = await fetch(BASE_URL + chemin, { redirect: 'manual' });

    return {
        statut: reponse.status,
        entetes: reponse.headers,
        corps: await reponse.text()
    };
}

/** La page d'accueil, reconnaissable à son titre */
const estLaPage = (corps) => corps.includes("Analyseur d'Investissements Bricks");

// ---------------------------------------------------------------------------
// La page et ses ressources
// ---------------------------------------------------------------------------

const accueil = await demander('/index.html');

check('la page d\'accueil répond', accueil.statut === 200 && estLaPage(accueil.corps));

const css = await demander('/src/styles/main.css');

check('la feuille de style est servie comme telle',
    css.statut === 200 && /text\/css/.test(css.entetes.get('content-type')),
    css.entetes.get('content-type'));

const module = await demander('/src/events/appInitializer.js');

// Un seul type, et pas deux : « add_header Content-Type » n'écrase pas celui
// que nginx a déduit de l'extension, il s'y ajoute. Deux Content-Type dans une
// même réponse ne sont pas du HTTP valide.
check('les modules ES sont servis comme du JavaScript',
    module.statut === 200 && /^application\/javascript/.test(module.entetes.get('content-type') || ''),
    module.entetes.get('content-type'));

check('un seul type est déclaré pour un module',
    !(module.entetes.get('content-type') || '').includes(','),
    module.entetes.get('content-type'));

const inconnu = await demander('/une-page-qui-nexiste-pas');

check('un chemin inconnu retombe sur la page d\'accueil',
    inconnu.statut === 200 && estLaPage(inconnu.corps));

// ---------------------------------------------------------------------------
// Les en-têtes de sécurité
// ---------------------------------------------------------------------------

const csp = accueil.entetes.get('content-security-policy') || '';

check('la CSP est envoyée', csp.length > 0);

// Le pilier de tout le reste : c'est lui qui interdit à la page où le cookie de
// session est saisi d'ouvrir un canal vers ailleurs, et c'est lui qui oblige à
// passer par les relais plutôt que d'appeler les API directement.
check('la CSP garde connect-src sur self', /connect-src 'self'/.test(csp), csp.slice(0, 60));

check('la CSP interdit les objets et cadre la base', /object-src 'none'/.test(csp) && /base-uri 'self'/.test(csp));

check('le type déclaré fait foi', accueil.entetes.get('x-content-type-options') === 'nosniff');

check('la page ne s\'encadre pas ailleurs', accueil.entetes.get('x-frame-options') === 'SAMEORIGIN');

check('le referrer est retenu', /strict-origin/.test(accueil.entetes.get('referrer-policy') || ''));

check('la version de nginx n\'est pas annoncée',
    !/nginx\/\d/.test(accueil.entetes.get('server') || ''), accueil.entetes.get('server'));

// ---------------------------------------------------------------------------
// Les quatre relais
// ---------------------------------------------------------------------------
// On ne demande pas qu'ils réussissent — l'amont est hors de portée d'un test —
// mais qu'ils prennent la main. Rendre la page d'accueil signifie qu'ils ne
// l'ont pas prise.

for (const [nom, chemin] of [
    ['l\'API Bricks', '/api/projects/financed'],
    ['le suivi de projet', '/projects-api/projects/x/echeances-investors'],
    ['la dernière version publiée', '/version-api'],
    ['les vignettes', '/vignette/00000000-0000-0000-0000-000000000000.webp']
]) {
    const reponse = await demander(chemin);

    check(`le relais vers ${nom} prend la main`, !estLaPage(reponse.corps), `${chemin} → ${reponse.statut}`);
}

// Pour les vignettes, « ce n'est pas la page d'accueil » ne suffit pas à
// conclure : un chemin en .png qui échappe au relais tombe sur le service de
// fichiers statiques, qui répond un 404 maison — pas la page d'accueil non
// plus. C'est ainsi que la panne avait traversé une première rédaction de ce
// test.
//
// Le signal juste est le type imposé par le relais : « proxy_hide_header
// Content-Type » puis « add_header … always » donnent une réponse en image/*
// quel que soit le code, y compris si l'amont est injoignable. Rien d'autre
// dans la configuration ne produit ça, et ça ne dépend pas du réseau.
const relayeCommeImage = (reponse) => /^image\//.test(reponse.entetes.get('content-type') || '');

for (const extension of ['webp', 'png', 'jpg', 'jpeg', 'JPG']) {
    const reponse = await demander(`/vignette/00000000-0000-0000-0000-000000000000.${extension}`);

    check(`une vignette .${extension} passe par le relais`,
        relayeCommeImage(reponse), `${reponse.statut} · ${reponse.entetes.get('content-type')}`);
}

const sousDossier = await demander('/vignette/opti/00000000-0000-0000-0000-000000000000.jpg');

check('le sous-dossier opti passe par le relais',
    relayeCommeImage(sousDossier), `${sousDossier.statut} · ${sousDossier.entetes.get('content-type')}`);

// ---------------------------------------------------------------------------
// Ce que le relais des vignettes doit refuser
// ---------------------------------------------------------------------------
// Un relais qui accepterait un chemin arbitraire serait un proxy d'images
// ouvert sur la machine. Ces chemins doivent mourir chez nous, jamais partir.

for (const chemin of [
    '/vignette/',
    '/vignette/opti/',
    '/vignette/autre/photo.jpg',
    '/vignette/document.pdf',
    '/vignette/tracé.svg',
    '/vignette/../../etc/passwd',
    '/vignette/%2e%2e%2fetc%2fpasswd'
]) {
    const reponse = await demander(chemin);

    check(`refusé : ${chemin}`,
        !relayeCommeImage(reponse), `${reponse.statut} · ${reponse.entetes.get('content-type')}`);
}

// ---------------------------------------------------------------------------
// Les données locales
// ---------------------------------------------------------------------------

const donnees = await demander('/data/demo.json');

// Le dossier n'entre pas dans l'image. Un repli sur index.html rendrait du HTML
// annoncé en 200, et l'analyse JSON échouerait trois étapes plus loin, sans
// rapport apparent avec la cause.
check('les données absentes répondent un 404 franc',
    donnees.statut === 404 && !estLaPage(donnees.corps), `→ ${donnees.statut}`);

// ---------------------------------------------------------------------------

const failed = checks.filter(c => !c.ok);
for (const { label, ok, detail } of checks) {
    console.log(`${ok ? '✓' : '✗'} ${label}${detail ? ` (${detail})` : ''}`);
}
console.log(`\n${checks.length - failed.length}/${checks.length} vérifications passées`);

process.exit(failed.length === 0 ? 0 : 1);
