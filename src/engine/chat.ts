import {
  ChatPolicy,
  ChatAction,
  ChatMessage,
  ChatAudience,
} from './types';

export class ChatEnforcer {
  private policy: ChatPolicy;

  constructor(policy: ChatPolicy) {
    this.policy = policy;
  }

  validate(action: ChatAction, senderSeat: number): string | null {
    if (this.policy === 'None') return 'Chat is disabled for this game';
    if (this.policy === 'PublicOnly' && action.audience !== 'public')
      return 'Only public messages allowed under PublicOnly policy';
    if (this.policy === 'Partner' && action.audience === 'target')
      return 'Cross-table targeting not allowed under Partner policy';
    if (action.audience === 'target' && action.targetSeat === undefined)
      return 'Target seat required for targeted messages';
    if (action.audience === 'target' && action.targetSeat === senderSeat)
      return 'Cannot target yourself';
    return null;
  }

  isVisible(msg: ChatMessage, viewerSeat: number): boolean {
    if (msg.audience === 'public') return true;
    if (msg.audience === 'partner') {
      const partnerSeat = (msg.seat + 2) % 4;
      return viewerSeat === msg.seat || viewerSeat === partnerSeat;
    }
    if (msg.audience === 'target') {
      return viewerSeat === msg.seat || viewerSeat === msg.targetSeat;
    }
    return false;
  }

  filterForSeat(messages: ChatMessage[], viewerSeat: number): ChatMessage[] {
    return messages.filter(m => this.isVisible(m, viewerSeat));
  }

  detectLie(action: ChatAction, senderSeat: number, hand: string[]): boolean {
    const text = action.text.toLowerCase();
    if (text.includes('i have no spades') && hand.some(c => c.endsWith('S')))
      return true;
    if (text.includes('i have no hearts') && hand.some(c => c.endsWith('H')))
      return true;
    if (text.includes('i have no diamonds') && hand.some(c => c.endsWith('D')))
      return true;
    if (text.includes('i have no clubs') && hand.some(c => c.endsWith('C')))
      return true;
    return false;
  }
}

export function chatAudienceToCode(a: ChatAudience): number {
  switch (a) {
    case 'public': return 0;
    case 'partner': return 1;
    case 'target': return 2;
  }
}
