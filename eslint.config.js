import js from '@eslint/js';
import globals from 'globals';

/**
 * Le projet n'a pas de bundler : rien ne relit le code avant que le navigateur
 * ne l'exécute. Un import mort, une variable de boucle mal nommée ou une
 * promesse dont personne n'attend le résultat ne se voyaient donc qu'à
 * l'ouverture de la page — et seulement si le chemin fautif était emprunté.
 *
 * Le style n'est pas normé ici : indentation, guillemets et points-virgules
 * restent l'affaire de l'auteur. Les règles ajoutées ne visent que ce qui est
 * faux ou mort.
 */
export default [
    {
        ignores: ['node_modules/', 'coverage/', 'data/']
    },

    js.configs.recommended,

    {
        rules: {
            // Une variable qu'on ne lit jamais est soit un oubli, soit le reste
            // d'un remaniement. Le préfixe _ laisse une échappatoire explicite
            // pour un paramètre imposé par une signature.
            'no-unused-vars': ['error', {
                argsIgnorePattern: '^_',
                varsIgnorePattern: '^_',
                caughtErrorsIgnorePattern: '^_'
            }],

            // Une valeur relue après un await peut avoir changé entre-temps.
            // « allowProperties » écarte les écritures sur un nœud du DOM
            // capturé en const — loadingMsg.textContent après un fetch — où la
            // référence ne bouge pas et où la règle ne voit qu'un faux positif.
            'require-atomic-updates': ['error', { allowProperties: true }],
            'no-promise-executor-return': 'error',

            // Deux clés identiques dans un littéral, deux branches identiques
            // dans un if/else : toujours une faute de copie.
            'no-dupe-else-if': 'error',
            'no-unmodified-loop-condition': 'error',
            'no-unreachable-loop': 'error',
            'no-constant-binary-expression': 'error',
            'no-self-compare': 'error',
            'no-template-curly-in-string': 'error',

            // « var » a une portée de fonction et remonte : dans un fichier de
            // 1 800 lignes, c'est une source de surprise gratuite.
            'no-var': 'error',
            'prefer-const': 'error',

            // == compare 0, '' et null d'une façon que personne ne retient.
            // L'exception « == null » couvre null et undefined d'un coup, ce
            // qui est délibéré et lisible.
            eqeqeq: ['error', 'always', { null: 'ignore' }],

            // Un console.log oublié dans une page qui manipule un cookie de
            // session et un portefeuille : le module logger existe pour ça, et
            // lui sait se taire.
            'no-console': 'error'
        }
    },

    {
        // Le code de l'application tourne dans le navigateur. Chart.js et son
        // plugin treemap viennent de deux balises <script> : ils sont globaux.
        files: ['src/**/*.js'],
        languageOptions: {
            ecmaVersion: 2023,
            sourceType: 'module',
            globals: {
                ...globals.browser,
                Chart: 'readonly'
            }
        }
    },

    {
        // Le logger est la seule sortie console autorisée — c'est son travail.
        files: ['src/utils/logger.js'],
        rules: {
            'no-console': 'off'
        }
    },

    {
        // config.js documente dans ses commentaires des commandes à coller
        // dans la console du navigateur.
        files: ['tests/**/*.js', 'tests/**/*.mjs', 'tools/**/*.mjs'],
        languageOptions: {
            ecmaVersion: 2023,
            sourceType: 'module',
            globals: {
                ...globals.node,
                ...globals.browser
            }
        },
        rules: {
            // Le smoke test et le générateur de démo rendent compte sur la
            // sortie standard : c'est leur seule interface.
            'no-console': 'off'
        }
    }
];
