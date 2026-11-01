/**
 * Prior approval of every action, asked by the server itself through MCP elicitation: the client shows
 * the user the exact action and the server acts only on an explicit "accept". Fail closed: a client that
 * cannot ask, a refusal, a timeout or an error means nothing is done.
 */
import { randomBytes } from 'node:crypto';
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';

export type ApprovalMode = 'elicit' | 'client';
export type Language = 'en' | 'fr';

export class ApprovalUnavailable extends Error {}

export class NotApproved extends Error {
  constructor(readonly outcome: 'decline' | 'cancel') {
    super(outcome);
  }
}

const T = {
  en: { space: 'Space', as: 'As', ref: 'Ref.', footer: 'Accept to do it now, refuse to cancel.' },
  fr: { space: 'Espace', as: 'En tant que', ref: 'Réf.', footer: 'Acceptez pour le faire maintenant, refusez pour annuler.' },
} as const;

export interface Request {
  action: string;
  as: string;
  space?: string;
  details: [string, string | undefined][];
}

export function approvalMessage(req: Request, lang: Language, ref: string): string {
  const t = T[lang];
  const sep = lang === 'fr' ? ' : ' : ': ';
  const lines = [`Twake Space${sep}${req.action}`, `${t.as}${sep}${req.as}`];
  if (req.space) lines.push(`${t.space}${sep}${req.space}`);
  for (const [label, value] of req.details) if (value !== undefined && value !== '') lines.push(value.includes('\n') ? `${label}${sep}\n${value}` : `${label}${sep}${value}`);
  lines.push('', `${t.ref} ${ref} · ${t.footer}`);
  return lines.join('\n');
}

export class Approver {
  constructor(
    private readonly server: Server,
    readonly mode: ApprovalMode,
    private readonly lang: Language,
    private readonly timeoutMs: number,
  ) {}

  /** Resolves when the user accepted; throws NotApproved or ApprovalUnavailable otherwise. */
  async confirm(req: Request): Promise<void> {
    if (this.mode === 'client') return;
    if (!this.server.getClientCapabilities()?.elicitation) {
      throw new ApprovalUnavailable(
        'This MCP client cannot ask the user for approval (no elicitation support), so mcp-twake-space refuses to act. ' +
          'Use a client that supports elicitation, or set TWAKE_SPACE_APPROVAL=client only if the client itself confirms every write tool with the user.',
      );
    }
    const ref = randomBytes(3).toString('hex');
    let result: { action: string };
    try {
      result = await this.server.elicitInput(
        { mode: 'form', message: approvalMessage(req, this.lang, ref), requestedSchema: { type: 'object', properties: {} } },
        { timeout: this.timeoutMs },
      );
    } catch {
      throw new NotApproved('cancel');
    }
    if (result.action !== 'accept') throw new NotApproved(result.action === 'decline' ? 'decline' : 'cancel');
  }
}
