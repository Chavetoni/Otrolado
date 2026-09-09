import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AlertEvent } from './alerts';

/**
 * Hydration is a module-load side effect, so every test gets a fresh module
 * (`vi.resetModules` + dynamic import) and a storage whose read resolves only
 * when the test says so — that is how the pre-hydration window is reproduced.
 */
const h = vi.hoisted(() => {
  const state = { resolve: null as null | ((v: string | null) => void), writes: [] as string[] };
  const storage = {
    getItem: () => new Promise<string | null>((r) => { state.resolve = r; }),
    setItem: async (_k: string, v: string) => { state.writes.push(v); },
  };
  return { state, storage };
});
vi.mock('./storage', () => ({ storage: h.storage }));

type Mod = typeof import('./prefs');
const settle = () => new Promise((r) => setTimeout(r, 0));

async function load(stored: unknown, before?: (m: Mod) => void): Promise<Mod> {
  vi.resetModules();
  h.state.writes = [];
  const m = await import('./prefs');
  before?.(m);
  h.state.resolve!(stored === null ? null : typeof stored === 'string' ? stored : JSON.stringify(stored));
  await settle();
  await settle();
  return m;
}

const todayTrip = { targetMinutes: 1080, lane: 'sentri', viaPortId: '230501', viaName: 'Hidalgo', savedAt: new Date().toISOString() };
const event = (id: string): AlertEvent => ({ id, ruleId: 'spike', portId: '230501', title: id, body: '', at: new Date().toISOString(), tone: 'warn' });

beforeEach(() => {
  h.state.resolve = null;
});

describe('prefs hydration and replay', () => {
  it('replays a pre-hydration tap as the value the user saw, and writes once', async () => {
    const m = await load({ pinned: ['x'], watchlist: ['w'], rules: { spike: false } }, (mod) => {
      // Renders the defaults: unpinned, unwatched, spike ON. The user taps all
      // three and sees pinned / watched / spike OFF. Storage held the opposite
      // for each; a naive flip replayed over storage would invert every tap.
      mod.prefs.togglePin('x');
      mod.prefs.toggleWatch('w');
      mod.prefs.toggleRule('spike');
    });
    const p = m.peekPrefs();
    expect(p.pinned).toEqual(['x']);
    expect(p.watchlist).toEqual(['w']);
    expect(p.rules.spike).toBe(false);
    expect(h.state.writes).toHaveLength(1);
  });

  it('writes nothing when nothing was tapped before hydration', async () => {
    const m = await load({ pinned: ['x'] });
    expect(m.peekPrefs().pinned).toEqual(['x']);
    expect(h.state.writes).toHaveLength(0);
  });

  it('defaults a pre-lane trip to General and strips legacy fields', async () => {
    const legacy = { ...todayTrip, lane: undefined, mode: 'passenger', leaveMinutes: 1000, planMode: 'arrive', fromCurrentLocation: true };
    const m = await load({ trip: legacy });
    const t = m.peekPrefs().trip!;
    expect(t.lane).toBe('general');
    expect(Object.keys(t).sort()).toEqual(['lane', 'savedAt', 'targetMinutes', 'viaName', 'viaPortId']);
  });

  it("drops yesterday's trip and malformed trips", async () => {
    const yesterday = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    expect((await load({ trip: { ...todayTrip, savedAt: yesterday } })).peekPrefs().trip).toBeNull();
    expect((await load({ trip: { ...todayTrip, targetMinutes: 1500 } })).peekPrefs().trip).toBeNull();
    expect((await load({ trip: { ...todayTrip, viaPortId: '' } })).peekPrefs().trip).toBeNull();
    expect((await load({ trip: todayTrip })).peekPrefs().trip?.lane).toBe('sentri');
  });

  it('drops retired rule ids and survives corrupt JSON', async () => {
    // `reroute` was retired when "another crossing is faster" replaced it.
    // A stored value for it must not reappear as a key on the typed record.
    const m0 = await load({ rules: { reroute: true, spike: false } });
    expect(Object.keys(m0.peekPrefs().rules)).not.toContain('reroute');
    // Known ids still round-trip.
    expect(m0.peekPrefs().rules.spike).toBe(false);
    expect(m0.peekPrefs().rules.faster).toBe(true);
    const m = await load('{not json');
    expect(m.peekPrefs().pinned).toEqual([]);
    expect(m.peekPrefs().trip).toBeNull();
  });
});

describe('prefs.pushEvents', () => {
  it('dedupes by id without a state change, caps at 30 newest first', async () => {
    const m = await load(null);
    m.prefs.pushEvents([event('a')]);
    const before = m.peekPrefs();
    m.prefs.pushEvents([event('a')]);
    expect(m.peekPrefs()).toBe(before);
    m.prefs.pushEvents(Array.from({ length: 40 }, (_, i) => event(`e${i}`)));
    const ids = m.peekPrefs().activity.map((e) => e.id);
    expect(ids).toHaveLength(30);
    expect(ids[0]).toBe('e0');
    expect(ids).not.toContain('a');
  });
});
