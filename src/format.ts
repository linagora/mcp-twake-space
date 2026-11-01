/** Formatting helpers: time zones, name matching, compact views of spaces and feed items. */

export function fold(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function zoneOffset(ms: number, timeZone: string): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
      .formatToParts(new Date(ms))
      .map((x) => [x.type, x.value]),
  );
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(ms / 1000) * 1000;
}

/** `YYYY-MM-DD` or `YYYY-MM-DDTHH:mm[:ss]` in the user's time zone, or an ISO time with offset -> epoch ms. */
export function parseWhen(value: string, timeZone: string): number {
  const v = value.trim();
  if (/[zZ]$|[+-]\d\d:?\d\d$/.test(v) && !Number.isNaN(Date.parse(v))) return Date.parse(v);
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(v);
  if (!m) throw new Error(`Invalid date "${value}": use YYYY-MM-DD or YYYY-MM-DDTHH:mm`);
  const [, y, mo, d, h = '0', mi = '0', s = '0'] = m;
  const guess = Date.UTC(+y, +mo - 1, +d, +h, +mi, +s);
  return guess - zoneOffset(guess - zoneOffset(guess, timeZone), timeZone);
}

/** Epoch ms or ISO -> `YYYY-MM-DD HH:mm` in the time zone. */
export function formatTime(value: number | string, timeZone: string): string {
  const ms = typeof value === 'number' ? value : Date.parse(value);
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
      .formatToParts(new Date(ms))
      .map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}

/** Items matching `query`: exact id first, then exact folded name, then every word contained. */
export function matchByName<T>(items: T[], query: string, id: (x: T) => string, names: (x: T) => string[]): T[] {
  const q = query.trim();
  const exact = items.filter((x) => id(x) === q);
  if (exact.length) return exact;
  const fq = fold(q);
  if (!fq) return [];
  const same = items.filter((x) => names(x).some((n) => fold(n) === fq));
  if (same.length) return same;
  const words = fq.split(' ');
  return items.filter((x) => {
    const hay = fold(names(x).join(' '));
    return words.every((w) => hay.includes(w));
  });
}

// ---------------------------------------------------------------- API shapes (docs/api.md)

export interface ApiMember {
  id: string;
  username: string;
  email?: string;
  displayName?: string | null;
  role?: string;
  workplaceFqdn?: string | null;
}

export interface ApiSpace {
  id: string;
  name: string;
  role: string | null;
  color: string | null;
  description: string;
  pinnedAt: string | null;
  openedAt: string | null;
  manages: boolean;
  members: ApiMember[];
  createdAt?: string;
  apps?: string[];
  chat?: boolean;
  mail?: boolean;
  homeserverUrl?: string | null;
  chatUrl?: string | null;
  banner?: string | null;
  groups?: { id: string; name: string; role: string }[];
  resources?: { kind: string; id: string | null }[];
}

export type Actor = { type: 'user'; id: string | null; name: string | null } | { type: 'token'; id: string; name: string } | { type: 'deleted_user' } | null;

export interface ApiFeedItem {
  id: string;
  kind: 'card' | 'post';
  category: string;
  time: string;
  updatedAt: string;
  reactions: { key: string; userIds: string[] }[];
  type?: string;
  actor?: Actor;
  object?: { type: string; id: string; title: string; container: { kind: string; id: string } | null };
  preview?: string | null;
  state?: Record<string, unknown>;
  files?: { created: number; updated: number; deleted: number; samples: string[] } | null;
  author?: Actor;
  body?: string;
  editedAt?: string | null;
  poll?: { kind: 'choice' | 'yes_no'; multiple: boolean; anonymous: boolean; options: { label: string; count: number; userIds: string[] }[]; closesAt: string | null; closedAt: string | null } | null;
  approval?: { state: string; approvers: { id: string; name: string | null; decision: string | null; comment: string | null; decidedAt: string | null }[]; closedAt: string | null } | null;
  announcement?: { title: string | null; color: string | null; pinnedAt: string | null; acknowledgedBy: string[] } | null;
  feedback?: { count: number; anonymous: boolean; average: number | null; mine: string | null; myRating: number | null; answers: unknown[] | null; closedAt: string | null } | null;
}

export function memberName(m: ApiMember): string {
  return m.displayName || m.username;
}

export function actorName(a: Actor | undefined): string | undefined {
  if (!a) return undefined;
  if (a.type === 'token') return `${a.name} (API token)`;
  if (a.type === 'deleted_user') return 'deleted user';
  return a.name ?? 'someone outside the space';
}

/** Compact view of a feed item for the assistant. `me` is the caller's user id when known. */
export function feedItemOut(it: ApiFeedItem, ctx: { tz: string; names: (id: string) => string; me?: string }) {
  const out: Record<string, unknown> = {
    id: it.id,
    kind: it.kind,
    category: it.category,
    time: formatTime(it.time, ctx.tz),
  };
  if (it.updatedAt && it.updatedAt !== it.time) out.updated = formatTime(it.updatedAt, ctx.tz);
  if (it.kind === 'card') {
    out.event = it.type;
    out.by = actorName(it.actor);
    if (it.object) out.object = { type: it.object.type, title: it.object.title, id: it.object.id };
    if (it.preview) out.preview = it.preview;
    if (it.files) out.files = it.files;
    if (it.state && Object.keys(it.state).length) out.state = it.state;
  } else {
    out.author = actorName(it.author);
    out.text = it.body;
    if (it.editedAt) out.edited = formatTime(it.editedAt, ctx.tz);
    if (it.poll) {
      const p = it.poll;
      out.poll = {
        kind: p.kind,
        multiple: p.multiple || undefined,
        anonymous: p.anonymous || undefined,
        options: p.options.map((o) => ({ label: o.label, votes: o.count, voters: p.anonymous ? undefined : o.userIds.map(ctx.names) })),
        closes: p.closesAt ? formatTime(p.closesAt, ctx.tz) : undefined,
        closed: p.closedAt ? formatTime(p.closedAt, ctx.tz) : undefined,
        my_vote: ctx.me ? p.options.filter((o) => o.userIds.includes(ctx.me!)).map((o) => o.label) : undefined,
      };
    }
    if (it.approval) {
      const a = it.approval;
      out.approval = {
        state: a.state,
        approvers: a.approvers.map((x) => ({ name: x.name ?? 'left the space', decision: x.decision ?? 'pending', comment: x.comment ?? undefined })),
        waiting_on_me: ctx.me ? a.state === 'pending' && !a.closedAt && a.approvers.some((x) => x.id === ctx.me && !x.decision) : undefined,
        closed: a.closedAt ? formatTime(a.closedAt, ctx.tz) : undefined,
      };
    }
    if (it.announcement) {
      const a = it.announcement;
      out.announcement = {
        title: a.title ?? undefined,
        pinned: Boolean(a.pinnedAt),
        acknowledged: a.acknowledgedBy.length,
        acknowledged_by_me: ctx.me ? a.acknowledgedBy.includes(ctx.me) : undefined,
      };
    }
    if (it.feedback) {
      const f = it.feedback;
      out.feedback = { answers: f.count, average: f.average ?? undefined, anonymous: f.anonymous || undefined, answered_by_me: f.mine !== null || f.myRating !== null, closed: f.closedAt ? formatTime(f.closedAt, ctx.tz) : undefined };
    }
  }
  if (it.reactions?.length) out.reactions = it.reactions.map((r) => ({ emoji: r.key, count: r.userIds.length, by: r.userIds.map(ctx.names) }));
  return out;
}

/** What a feed item asks of the caller, if anything. */
export function waitingOnMe(it: ApiFeedItem, me: string | undefined): string | undefined {
  if (!me || it.kind !== 'post') return undefined;
  if (it.author?.type === 'user' && it.author.id === me) return undefined;
  if (it.approval && it.approval.state === 'pending' && !it.approval.closedAt && it.approval.approvers.some((a) => a.id === me && !a.decision)) return 'approval requested from you';
  if (it.poll && !it.poll.closedAt && !it.poll.options.some((o) => o.userIds.includes(me))) return it.poll.kind === 'yes_no' ? 'yes/no question you have not answered' : 'poll you have not voted in';
  if (it.feedback && !it.feedback.closedAt && it.feedback.mine === null && it.feedback.myRating === null) return 'feedback request you have not answered';
  if (it.announcement && !it.announcement.acknowledgedBy.includes(me)) return 'announcement you have not acknowledged';
  return undefined;
}
