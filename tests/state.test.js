import { describe, it, expect, beforeEach, vi } from 'vitest';
import { state } from '../src/core/state.js';

// state est un singleton : on le remet à zéro entre les tests.
beforeEach(() => {
    state.reset();
});

describe('get / set', () => {
    it('lit les valeurs par défaut', () => {
        expect(state.get('allData')).toEqual([]);
        expect(state.get('ui')).toEqual({ resultsVisible: false, loading: false, error: null });
    });

    it('écrit puis relit une valeur', () => {
        state.set('allData', [{ yearMonthDate: '2024-01' }]);
        expect(state.get('allData')).toEqual([{ yearMonthDate: '2024-01' }]);
    });

    it('retourne undefined pour une clé inconnue', () => {
        expect(state.get('inexistant')).toBeUndefined();
    });
});

describe('update', () => {
    it('fusionne partiellement un objet', () => {
        state.update('ui', { loading: true });

        expect(state.get('ui')).toEqual({ resultsVisible: false, loading: true, error: null });
    });

    it('ignore une clé inconnue', () => {
        expect(() => state.update('inexistant', { a: 1 })).not.toThrow();
        expect(state.get('inexistant')).toBeUndefined();
    });

    it('refuse la fusion sur un tableau (allData resterait inexploitable)', () => {
        state.set('allData', [{ yearMonthDate: '2024-01' }]);
        state.update('allData', { a: 1 });

        expect(state.get('allData')).toEqual([{ yearMonthDate: '2024-01' }]);
    });
});

describe('subscribe', () => {
    it('notifie avec l\'ancienne et la nouvelle valeur', () => {
        const spy = vi.fn();
        state.subscribe('allData', spy);

        state.set('allData', [1]);

        expect(spy).toHaveBeenCalledWith([1], []);
    });

    it('notifie aussi sur update', () => {
        const spy = vi.fn();
        state.subscribe('ui', spy);

        state.update('ui', { loading: true });

        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy.mock.calls[0][0].loading).toBe(true);
    });

    it('ne notifie que les abonnés de la clé concernée', () => {
        const uiSpy = vi.fn();
        state.subscribe('ui', uiSpy);

        state.set('allData', [1]);

        expect(uiSpy).not.toHaveBeenCalled();
    });

    it('permet de se désabonner', () => {
        const spy = vi.fn();
        const unsubscribe = state.subscribe('allData', spy);

        unsubscribe();
        state.set('allData', [1]);

        expect(spy).not.toHaveBeenCalled();
    });

    it('isole les erreurs d\'un abonné des autres', () => {
        const boom = vi.fn(() => { throw new Error('boom'); });
        const ok = vi.fn();
        state.subscribe('allData', boom);
        state.subscribe('allData', ok);

        expect(() => state.set('allData', [1])).not.toThrow();
        expect(ok).toHaveBeenCalled();
    });
});

describe('reset', () => {
    it('restaure les valeurs par défaut', () => {
        state.set('allData', [1, 2, 3]);
        state.update('ui', { loading: true });

        state.reset();

        expect(state.get('allData')).toEqual([]);
        expect(state.get('ui').loading).toBe(false);
    });

    it('notifie les abonnés existants', () => {
        const spy = vi.fn();
        state.subscribe('allData', spy);

        state.reset();

        expect(spy).toHaveBeenCalled();
    });
});

describe('getAll', () => {
    it('retourne une copie de surface de l\'état', () => {
        const snapshot = state.getAll();
        snapshot.allData = 'écrasé';

        expect(state.get('allData')).toEqual([]);
    });
});
