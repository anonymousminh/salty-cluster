import { describe, expect, it } from 'vitest';
import { MAX_CHAT_LENGTH, cleanChatText, motionFor } from '../src';

describe('cleanChatText', () => {
  it('trims and collapses whitespace', () => {
    expect(cleanChatText('  hello   there \n friend ')).toEqual({ ok: true, text: 'hello there friend' });
  });

  it('strips control and bidi-override characters', () => {
    const r = cleanChatText('hi' + String.fromCharCode(0) + ' ' + String.fromCharCode(0x202e) + 'there' + String.fromCharCode(0x200b) + '!');
    expect(r).toEqual({ ok: true, text: 'hi there !' });
  });

  it('rejects empty and non-string input', () => {
    expect(cleanChatText('   \n\t ')).toMatchObject({ ok: false, code: 'empty' });
    expect(cleanChatText(42)).toMatchObject({ ok: false, code: 'bad_message' });
    expect(cleanChatText(undefined)).toMatchObject({ ok: false, code: 'bad_message' });
  });

  it('enforces the length limit in characters, not bytes', () => {
    expect(cleanChatText('a'.repeat(MAX_CHAT_LENGTH))).toMatchObject({ ok: true });
    expect(cleanChatText('a'.repeat(MAX_CHAT_LENGTH + 1))).toMatchObject({ ok: false, code: 'too_long' });
    // 200 emoji are 400 UTF-16 units but still 200 characters.
    expect(cleanChatText('😀'.repeat(MAX_CHAT_LENGTH))).toMatchObject({ ok: true });
  });

  it('keeps markup as plain text (escaping is the renderer\'s job)', () => {
    expect(cleanChatText('<img src=x onerror=alert(1)>')).toEqual({ ok: true, text: '<img src=x onerror=alert(1)>' });
  });
});

describe('motionFor', () => {
  it('maps gait to a compact motion code', () => {
    expect(motionFor(0, false)).toBe(0);
    expect(motionFor(1, false)).toBe(1);
    expect(motionFor(2, false)).toBe(2);
    expect(motionFor(2, true)).toBe(3);
  });
});
