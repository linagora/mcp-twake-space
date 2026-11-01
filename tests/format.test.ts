import { describe, expect, it } from 'vitest';
import { feedItemOut, fold, formatTime, matchByName, parseWhen, waitingOnMe, type ApiFeedItem } from '../src/format.js';

const TZ = 'Europe/Paris';
const ME = 'me';

describe('dates', () => {
  it('reads local times on both sides of the October DST change', () => {
    expect(new Date(parseWhen('2026-10-24T10:00', TZ)).toISOString()).toBe('2026-10-24T08:00:00.000Z');
    expect(new Date(parseWhen('2026-10-26T10:00', TZ)).toISOString()).toBe('2026-10-26T09:00:00.000Z');
    expect(new Date(parseWhen('2026-11-05', TZ)).toISOString()).toBe('2026-11-04T23:00:00.000Z');
  });

  it('keeps explicit offsets and refuses free text', () => {
    expect(parseWhen('2026-11-05T14:00:00Z', TZ)).toBe(Date.parse('2026-11-05T14:00:00Z'));
    expect(parseWhen('2026-11-05T14:00:00+01:00', TZ)).toBe(Date.parse('2026-11-05T13:00:00Z'));
    expect(() => parseWhen('demain', TZ)).toThrow(/YYYY-MM-DD/);
  });

  it('formats in the user time zone', () => {
    expect(formatTime('2026-07-01T12:00:00Z', TZ)).toBe('2026-07-01 14:00');
    expect(formatTime(Date.parse('2026-12-01T12:00:00Z'), TZ)).toBe('2026-12-01 13:00');
  });
});

describe('matchByName', () => {
  const items = [
    { id: 'a1', name: 'Équipe Design' },
    { id: 'a2', name: 'Design system' },
    { id: 'a3', name: 'Projet Atlas' },
  ];
  const m = (q: string) => matchByName(items, q, (x) => x.id, (x) => [x.name]).map((x) => x.id);

  it('prefers the exact id, then the exact name, then all words', () => {
    expect(m('a3')).toEqual(['a3']);
    expect(m('equipe design')).toEqual(['a1']);
    expect(m('design')).toEqual(['a1', 'a2']);
    expect(m('atlas projet')).toEqual(['a3']);
    expect(m('   ')).toEqual([]);
    expect(fold('  Équipe   DÉSIGN ')).toBe('equipe design');
  });
});

const post = (over: Partial<ApiFeedItem>): ApiFeedItem => ({
  id: 'p', kind: 'post', category: 'messages', time: '2026-11-01T09:00:00Z', updatedAt: '2026-11-01T09:00:00Z', reactions: [],
  author: { type: 'user', id: 'bob', name: 'Bob DURAND' }, body: 'x', editedAt: null, poll: null, approval: null, announcement: null, feedback: null, ...over,
});

describe('waitingOnMe', () => {
  it('finds what asks something of me, and nothing in my own posts', () => {
    const approval = { state: 'pending', approvers: [{ id: ME, name: 'Me', decision: null, comment: null, decidedAt: null }], closedAt: null };
    expect(waitingOnMe(post({ approval }), ME)).toMatch(/approval/);
    expect(waitingOnMe(post({ approval: { ...approval, approvers: [{ ...approval.approvers[0], decision: 'approved' }] } }), ME)).toBeUndefined();
    expect(waitingOnMe(post({ approval, author: { type: 'user', id: ME, name: 'Me' } }), ME)).toBeUndefined();
    const poll = { kind: 'yes_no' as const, multiple: false, anonymous: false, options: [{ label: 'yes', count: 0, userIds: [] }, { label: 'no', count: 0, userIds: [] }], closesAt: null, closedAt: null };
    expect(waitingOnMe(post({ poll }), ME)).toMatch(/yes\/no/);
    expect(waitingOnMe(post({ poll: { ...poll, closedAt: '2026-11-01T10:00:00Z' } }), ME)).toBeUndefined();
    expect(waitingOnMe(post({ announcement: { title: null, color: null, pinnedAt: null, acknowledgedBy: [] } }), ME)).toMatch(/announcement/);
    expect(waitingOnMe(post({ feedback: { count: 0, anonymous: false, average: null, mine: null, myRating: null, answers: null, closedAt: null } }), ME)).toMatch(/feedback/);
    expect(waitingOnMe(post({}), undefined)).toBeUndefined();
  });
});

describe('feedItemOut', () => {
  it('hides the voters of an anonymous poll and names token authors', () => {
    const out = feedItemOut(
      post({
        author: { type: 'token', id: 't', name: 'Bot' },
        poll: { kind: 'choice', multiple: false, anonymous: true, options: [{ label: 'A', count: 2, userIds: [ME] }, { label: 'B', count: 0, userIds: [] }], closesAt: null, closedAt: null },
      }),
      { tz: TZ, names: () => 'someone', me: ME },
    );
    expect(out.author).toBe('Bot (API token)');
    expect(out.poll).toMatchObject({ anonymous: true, my_vote: ['A'], options: [{ label: 'A', votes: 2, voters: undefined }, { label: 'B', votes: 0, voters: undefined }] });
  });
});
