import { logger } from '../src/utils/logger.js';

// Les modules loggent en niveau debug par défaut : on coupe le bruit dans les tests.
logger.setLevel('off');
