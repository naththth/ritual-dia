import { describe, it, expect } from 'vitest';
import { effectiveSleep, effectiveHrv, isSuspicious } from '../../src/domain/wellness';

describe('sono do relógio', () => {
  it('noite curta sem resposta é suspeita e fica fora das contas', () => {
    const w = { sleepH: 3.75, hrv: 29 };
    expect(isSuspicious(w)).toBe(true);
    expect(effectiveSleep(w)).toBeUndefined();
    expect(effectiveHrv(w)).toBeUndefined();
  });
  it('confirmada vale como está', () => {
    const w = { sleepH: 3.75, hrv: 29, sleepFlag: 'confirmado' as const };
    expect(effectiveSleep(w)).toEqual({ h: 3.75, estimated: false });
    expect(effectiveHrv(w)).toBe(29);
  });
  it('relógio saiu: vale a estimativa dela e a VFC sai', () => {
    const w = { sleepH: 3.75, hrv: 29, sleepFlag: 'incompleto' as const, sleepManualH: 7 };
    expect(effectiveSleep(w)).toEqual({ h: 7, estimated: true });
    expect(effectiveHrv(w)).toBeUndefined();
  });
  it('sem relógio, só a estimativa', () => {
    expect(effectiveSleep({ sleepManualH: 7, sleepFlag: 'incompleto' })).toEqual({ h: 7, estimated: true });
  });
  it('noite normal passa direto', () => {
    expect(effectiveSleep({ sleepH: 7.4 })).toEqual({ h: 7.4, estimated: false });
  });
});
