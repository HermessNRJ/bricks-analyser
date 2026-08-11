/**
 * Configuration centrale de l'application Bricks Analyser
 */

export const CONFIG = {
    // LocalStorage
    LOCAL_STORAGE_KEY: 'bricksInvestmentData',

    // API Bricks.co — servie via le proxy nginx (voir nginx.conf) : un appel
    // direct au navigateur est bloqué par le CORS et par Cloudflare.
    API_BASE_URL: '/api',
    API_ENDPOINTS: {
        FINANCED: '/projects/financed',
        ALL_PROJECTS: '/projects',
        WARNINGS: '/investor/portfolio/properties/highlighted-updates',
        REVENUE: '/investor/portfolio/revenue',
        WALLET: '/wallet-transactions'
    },

    // Premier mois interrogé pour l'historique des revenus. Bricks ne renvoie
    // que les mois réellement versés : demander large ne coûte rien et évite
    // de tronquer l'historique d'un investisseur de la première heure.
    REVENUE_HISTORY_START: '2020-01',

    // Calculs financiers
    //
    // Le prélèvement forfaitaire unique a changé de taux : appliquer le taux
    // courant à tout l'historique surestimerait les impôts déjà payés. Le barème
    // est donc daté, et chaque mois cumulé se voit appliquer le taux qui avait
    // cours à l'époque. Le passage à 31,4 % date de janvier 2026.
    TAX_RATES: [
        { depuis: '0000-00', taux: 0.30 },
        { depuis: '2026-01', taux: 0.314 }
    ],
    DEFAULT_BRICK_PRICE: 10, // Prix par défaut si non spécifié

    // Charts
    CHART_COLORS: [
        '#667eea', '#764ba2', '#f093fb', '#f5576c',
        '#4facfe', '#00f2fe', '#43e97b', '#38f9d7',
        '#ffecd2', '#fcb69f', '#a8edea', '#fed6e3'
    ],
    MAX_CHART_SEGMENTS: 10, // Limite pour le graphique donut

    // UI
    PROJECTIONS_MONTHS: 4, // Nombre de mois de projection à afficher

    // Journalisation
    //
    // Aux niveaux « debug » et « info », les journaux recopient dans la console
    // les identifiants de projets, les montants et les alertes — soit tout le
    // portefeuille. « warn » ne laisse passer que ce qui signale un problème.
    // DEBUG expose en plus window.__appState__ : à réserver au développement.
    DEBUG: false,
    LOG_LEVEL: 'warn' // 'debug', 'info', 'warn', 'error', 'off'
};

/**
 * Taux d'imposition en vigueur pour un mois donné
 * @param {string} [mois] - Mois au format YYYY-MM ; le taux courant par défaut
 * @returns {number} Fraction d'imposition (0,314 pour 31,4 %)
 */
export function tauxImpositionPour(mois) {
    const reference = typeof mois === 'string' && mois ? mois : '9999-99';

    // Le barème est trié : le dernier palier atteint est celui qui s'applique
    return CONFIG.TAX_RATES.reduce(
        (retenu, palier) => (palier.depuis <= reference ? palier.taux : retenu),
        CONFIG.TAX_RATES[0].taux
    );
}

/**
 * Taux d'imposition applicable aujourd'hui
 * @returns {number} Fraction d'imposition courante
 */
export function tauxImpositionCourant() {
    return CONFIG.TAX_RATES[CONFIG.TAX_RATES.length - 1].taux;
}

// Conservé pour les calculs portant sur le présent (revenus attendus,
// simulation) : c'est toujours le taux du jour qui s'applique.
CONFIG.TAX_RATE = tauxImpositionCourant();
