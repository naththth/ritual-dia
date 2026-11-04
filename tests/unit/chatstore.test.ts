import 'fake-indexeddb/auto';
import { describe, expect, it, beforeEach } from 'vitest';
import { db, getMeta, setMeta, useTestDB } from '../../src/db/db';

describe('conversas na conta', () => {
  beforeEach(async () => { useTestDB(`chat-${Math.random()}`); });

  it('conversas das especialistas vão para os registros que sincronizam', async () => {
    await setMeta('coach-chat', [{ from: 'me', text: 'oi', at: 1 }]);
    const rec: any = await db.records.get('chatstore:coach-chat');
    expect(rec.kind).toBe('chatstore');
    expect(rec.dirty).toBe(1);
    expect(await getMeta('coach-chat')).toEqual([{ from: 'me', text: 'oi', at: 1 }]);
    expect(await db.meta.get('coach-chat')).toBeUndefined();
  });

  it('conversa antiga do aparelho migra para a conta na primeira leitura', async () => {
    await db.meta.put({ key: 'food-sessions', value: [{ id: 's1' }] });
    expect(await getMeta('food-sessions')).toEqual([{ id: 's1' }]);
    expect(((await db.records.get('chatstore:food-sessions')) as any).value).toEqual([{ id: 's1' }]);
  });

  it('o resto continua só no aparelho', async () => {
    await setMeta('lastBackup', 5);
    expect(await db.records.get('chatstore:lastBackup')).toBeUndefined();
    expect(await getMeta('lastBackup')).toBe(5);
  });
});
