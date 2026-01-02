/**
 * Configuration centrale de l'application Bricks Analyser
 */

export const CONFIG = {
    // LocalStorage
    LOCAL_STORAGE_KEY: 'bricksInvestmentData',

    // API Bricks.co
    API_BASE_URL: 'https://api.bricks.co',
    API_ENDPOINTS: {
        FINANCED: '/projects/financed',
        ALL_PROJECTS: '/projects',
        WARNINGS: '/investor/portfolio/properties/highlighted-updates'
    },

    // Calculs financiers
    TAX_RATE: 0.30, // Flat tax 30%
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

    // Logging
    DEBUG: true, // Passer à false en production
    LOG_LEVEL: 'debug' // 'debug', 'info', 'warn', 'error', 'off'
};
