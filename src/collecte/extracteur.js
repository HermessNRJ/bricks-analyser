/**
 * Extracteur exécuté dans la page app.bricks.co
 *
 * Ce fichier ne tourne pas dans l'application : il est emballé en favori par
 * src/ui/favori.js, puis exécuté par le navigateur *sur le site de Bricks*.
 * C'est toute l'idée. Le cookie de session est HttpOnly — aucun script ne peut
 * le lire — mais depuis app.bricks.co le navigateur l'attache lui-même à chaque
 * requête. Il n'y a donc rien à extraire, rien à coller, et rien à confier :
 * la session ne quitte pas l'onglet qui la détenait déjà.
 *
 * Contrainte qui explique la forme du fichier : il doit tenir dans une URL
 * « javascript: ». Pas d'import, pas de dépendance, une seule fonction anonyme.
 *
 * Contrainte qui explique ce qu'il ne fait pas : il ne calcule rien. Il appelle,
 * il ramasse, il écrit un fichier de JSON brut. Toute la normalisation reste
 * dans src/business/, en un seul exemplaire, celui que les tests couvrent —
 * une seconde copie ici dériverait en silence de la première.
 *
 * Ne couvre pas les statuts officiels : projects.bricks.co ne renvoie aucun
 * en-tête CORS et pose un Cross-Origin-Resource-Policy: same-origin, donc
 * app.bricks.co n'a pas le droit de lire ses réponses. Ils continuent de passer
 * par le proxy, qui n'a besoin que de cf_clearance — un laissez-passer anti-bot
 * qui ne donne accès à aucun compte.
 */

(function () {
    'use strict';

    const API = 'https://api.bricks.co';

    /** Version de l'enveloppe. À incrémenter si sa forme change, pour qu'un
     *  fichier produit par un favori resté vieux soit refusé plutôt que mal lu. */
    const FORMAT = 1;

    /** Bricks ne renvoie que les mois réellement versés : demander large ne
     *  coûte rien et évite de tronquer l'historique d'un investisseur de la
     *  première heure. Même borne que CONFIG.REVENUE_HISTORY_START. */
    const DEBUT_REVENUS = '2020-01';

    /** Le journal compte un mouvement par jour rien que pour le solde boosté :
     *  demander vingt lignes à la fois en ferait des centaines d'allers-retours. */
    const TAILLE_LOT = 100;

    /** Garde-fou : au-delà, c'est que la pagination ne progresse pas. */
    const LOTS_MAX = 200;

    if (!/(^|\.)bricks\.co$/.test(location.hostname)) {
        alert('À lancer depuis une page ouverte sur app.bricks.co.');
        return;
    }

    // ------------------------------------------------------------------
    // Bandeau de progression
    // ------------------------------------------------------------------
    // Le journal des mouvements se pagine par centaines de lignes : sur un gros
    // portefeuille la collecte dure une minute, pendant laquelle la page de
    // Bricks reste normale. Sans ce bandeau, rien ne dirait que quelque chose
    // tourne, et le second clic sur le favori relancerait tout en parallèle.

    const existant = document.getElementById('__bricks_analyser');

    if (existant) {
        alert('Une collecte est déjà en cours dans cet onglet.');
        return;
    }

    const bandeau = document.createElement('div');
    bandeau.id = '__bricks_analyser';
    bandeau.setAttribute('role', 'status');
    bandeau.style.cssText = [
        'position:fixed', 'inset:0 0 auto 0', 'z-index:2147483647',
        'padding:14px 20px', 'background:#1c1917', 'color:#fafaf9',
        'font:14px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace',
        'text-align:center', 'box-shadow:0 2px 16px rgba(0,0,0,.35)'
    ].join(';');
    document.body.appendChild(bandeau);

    const dire = (texte) => { bandeau.textContent = 'Analyseur Bricks — ' + texte; };
    const finir = (texte, erreur) => {
        bandeau.textContent = 'Analyseur Bricks — ' + texte;
        bandeau.style.background = erreur ? '#7f1d1d' : '#14532d';
        setTimeout(() => bandeau.remove(), erreur ? 12000 : 6000);
    };

    dire('collecte en cours…');

    // ------------------------------------------------------------------
    // Appels
    // ------------------------------------------------------------------

    /**
     * GET authentifié sur l'API Bricks
     *
     * « credentials: include » est le cœur du procédé : la page est servie par
     * bricks.co, le navigateur joint donc le cookie de session de lui-même.
     *
     * @param {string} chemin - Chemin de l'endpoint, avec sa query éventuelle
     * @returns {Promise<*>} Corps de la réponse désérialisé
     */
    async function appel(chemin) {
        const reponse = await fetch(API + chemin, {
            credentials: 'include',
            headers: { Accept: 'application/json' }
        });

        if (reponse.status === 401 || reponse.status === 403) {
            throw new Error('session expirée — reconnectez-vous à Bricks, puis relancez le favori');
        }

        if (!reponse.ok) {
            throw new Error('HTTP ' + reponse.status + ' sur ' + chemin);
        }

        return reponse.json();
    }

    /**
     * Appel dont l'échec ne doit pas tout arrêter
     *
     * Les alertes, l'historique des revenus et le journal sont des
     * enrichissements : l'application sait retomber sur une estimation. Les
     * projets financés, eux, sont la matière même — leur échec passe par appel().
     *
     * @param {string} chemin - Chemin de l'endpoint
     * @param {*} defaut - Valeur rendue si l'appel échoue
     * @returns {Promise<*>} Réponse, ou `defaut`
     */
    async function accessoire(chemin, defaut) {
        try {
            return await appel(chemin);
        } catch {
            return defaut;
        }
    }

    /**
     * Ramasse le journal des mouvements, lot par lot
     *
     * Le curseur n'est pas documenté. S'il ne désigne pas exactement la ligne
     * suivante, les lots se recouvrent : un remboursement de capital compté deux
     * fois doublerait le capital rendu du mois. On retient donc les identifiants
     * déjà vus — c'est de la plomberie de collecte, pas du calcul, et c'est la
     * raison pour laquelle elle est ici et non dans src/business/.
     *
     * @returns {Promise<Array>} Transactions dédoublonnées
     */
    async function journal() {
        const transactions = [];
        const vus = new Set();
        let cursor = 0;

        for (let lot = 0; lot < LOTS_MAX; lot++) {
            let page;

            try {
                page = await appel('/wallet-transactions?cursor=' + cursor + '&take=' + TAILLE_LOT);
            } catch {
                // On garde ce qui a été obtenu plutôt que de tout perdre
                break;
            }

            const lignes = Array.isArray(page && page.data) ? page.data : [];

            if (lignes.length === 0) {
                break;
            }

            const inedites = lignes.filter((ligne) => {
                // Une ligne sans identifiant ne peut pas être dédoublonnée :
                // la garder est le moindre risque, en perdre une fausserait les totaux.
                if (!ligne || typeof ligne.id !== 'string' || !ligne.id) {
                    return true;
                }

                if (vus.has(ligne.id)) {
                    return false;
                }

                vus.add(ligne.id);
                return true;
            });

            transactions.push(...inedites);
            dire('journal des mouvements… ' + transactions.length + ' lignes');

            // Un lot entièrement déjà vu signale un curseur qui n'avance plus
            if (inedites.length === 0) {
                break;
            }

            cursor = Number.isFinite(page.cursor) && page.cursor > cursor
                ? page.cursor
                : cursor + lignes.length;
        }

        return transactions;
    }

    // ------------------------------------------------------------------
    // Écriture du fichier
    // ------------------------------------------------------------------

    /**
     * Propose le fichier au téléchargement
     *
     * Le seul transport qui ne suppose rien : ni popup autorisée, ni requête
     * vers le réseau local, ni origine complaisante. Le fichier atterrit dans
     * les téléchargements, et se charge dans l'analyseur d'un glisser-déposer.
     *
     * @param {Object} enveloppe - Contenu à écrire
     * @returns {string} Nom du fichier proposé
     */
    function telecharger(enveloppe) {
        const horodatage = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
        const nom = 'bricks-' + horodatage + '.json';

        const url = URL.createObjectURL(
            new Blob([JSON.stringify(enveloppe)], { type: 'application/json' })
        );

        const lien = document.createElement('a');
        lien.href = url;
        lien.download = nom;
        document.body.appendChild(lien);
        lien.click();
        lien.remove();

        // Laisser au navigateur le temps d'ouvrir le flux avant de révoquer
        setTimeout(() => URL.revokeObjectURL(url), 30000);

        return nom;
    }

    // ------------------------------------------------------------------
    // Déroulé
    // ------------------------------------------------------------------

    (async function () {
        try {
            const maintenant = new Date();
            const finRevenus = maintenant.getFullYear() + '-'
                + String(maintenant.getMonth() + 1).padStart(2, '0');

            dire('projets financés…');
            const financed = await appel('/projects/financed');

            dire('projets en cours et à venir…');
            const projets = await accessoire('/projects', { ongoing: { projects: [] }, upcoming: { projects: [] } });

            dire('alertes…');
            const alertes = await accessoire('/investor/portfolio/properties/highlighted-updates', []);

            dire('historique des revenus…');
            const revenus = await accessoire(
                '/investor/portfolio/revenue?startDate=' + DEBUT_REVENUS + '&endDate=' + finRevenus,
                null
            );

            dire('journal des mouvements…');
            const transactions = await journal();

            const nom = telecharger({
                format: 'bricks-analyser/collecte',
                version: FORMAT,
                genereLe: maintenant.toISOString(),
                brut: { financed, projets, alertes, revenus, transactions }
            });

            finir(nom + ' — ouvrez-le dans l\'analyseur.', false);

        } catch (err) {
            finir('échec : ' + (err && err.message ? err.message : err), true);
        }
    })();
})();
