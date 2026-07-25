import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        // jsdom fournit document/localStorage aux modules qui touchent au DOM
        environment: 'jsdom',
        include: ['tests/**/*.test.js'],
        setupFiles: ['tests/setup.js'],
        coverage: {
            include: ['src/**/*.js'],
            // Les charts sont de la config Chart.js quasi pure : peu testable en unitaire
            exclude: ['src/charts/**'],
            reporter: ['text', 'html']
        }
    }
});
