/**
 * Utilitaires pour détecter et extraire les informations de pays
 */

/**
 * Mapping des codes pays vers les noms complets
 */
const COUNTRY_NAMES = {
    'FR': 'France',
    'PT': 'Portugal',
    'ES': 'Espagne',
    'IT': 'Italie',
    'DE': 'Allemagne',
    'BE': 'Belgique',
    'CH': 'Suisse',
    'LU': 'Luxembourg',
    'NL': 'Pays-Bas',
    'GB': 'Royaume-Uni',
    'US': 'États-Unis',
    'CA': 'Canada',
    'MA': 'Maroc',
    'TN': 'Tunisie',
    'SN': 'Sénégal',
    'CI': 'Côte d\'Ivoire',
    'GR': 'Grèce',
    'TR': 'Turquie',
    'PL': 'Pologne',
    'RO': 'Roumanie',
    'CZ': 'République Tchèque',
    'AT': 'Autriche',
    'DK': 'Danemark',
    'SE': 'Suède',
    'NO': 'Norvège',
    'FI': 'Finlande'
};

/**
 * Extrait le code pays depuis un emoji de drapeau
 * Les emojis de drapeaux sont composés de deux Regional Indicator Symbols
 * @param {string} flagEmoji - Emoji de drapeau (ex: 🇫🇷)
 * @returns {string|null} Code pays à 2 lettres (ex: 'FR') ou null
 */
function extractCountryCodeFromFlag(flagEmoji) {
    if (!flagEmoji || flagEmoji.length < 2) return null;

    // Les Regional Indicator Symbols commencent à U+1F1E6 (A) et vont jusqu'à U+1F1FF (Z)
    const REGIONAL_INDICATOR_A = 0x1F1E6;

    const codePoints = [];
    for (let i = 0; i < flagEmoji.length; i++) {
        const codePoint = flagEmoji.codePointAt(i);
        if (codePoint >= REGIONAL_INDICATOR_A && codePoint <= 0x1F1FF) {
            // Convertir le Regional Indicator en lettre (A-Z)
            const letter = String.fromCharCode(65 + (codePoint - REGIONAL_INDICATOR_A));
            codePoints.push(letter);

            // Les emojis sur certains systèmes prennent 2 positions dans la chaîne
            if (codePoint > 0xFFFF) {
                i++; // Sauter le surrogate pair
            }
        }
    }

    if (codePoints.length === 2) {
        return codePoints.join('');
    }

    return null;
}

/**
 * Détecte et extrait le pays depuis le nom d'un projet
 * Cherche les emojis de drapeaux dans le nom
 * @param {string} projectName - Nom du projet
 * @returns {string} Nom du pays ou 'France' par défaut
 */
export function detectCountryFromProjectName(projectName) {
    if (!projectName) return 'France';

    // Regex pour trouver les emojis de drapeaux (Regional Indicator Symbols)
    const flagRegex = /[\u{1F1E6}-\u{1F1FF}][\u{1F1E6}-\u{1F1FF}]/gu;
    const flags = projectName.match(flagRegex);

    if (flags && flags.length > 0) {
        // Prendre le premier drapeau trouvé
        const countryCode = extractCountryCodeFromFlag(flags[0]);

        if (countryCode && COUNTRY_NAMES[countryCode]) {
            return COUNTRY_NAMES[countryCode];
        }
    }

    // Par défaut, considérer que c'est la France
    // (la majorité des projets Bricks sont en France)
    return 'France';
}

/**
 * Détecte le pays depuis l'objet projet complet
 * @param {Object} project - Objet projet de l'API
 * @returns {string} Nom du pays
 */
export function detectCountryFromProject(project) {
    // Priorité 1 : chercher dans le nom en français
    if (project.name?.fr) {
        const country = detectCountryFromProjectName(project.name.fr);
        if (country !== 'France') return country; // Si on trouve un drapeau, on le retourne
    }

    // Priorité 2 : chercher dans le nom en anglais
    if (project.name?.en) {
        const country = detectCountryFromProjectName(project.name.en);
        if (country !== 'France') return country;
    }

    // Priorité 3 : chercher dans le nom simple (string)
    if (typeof project.name === 'string') {
        const country = detectCountryFromProjectName(project.name);
        if (country !== 'France') return country;
    }

    // Par défaut : France
    return 'France';
}
