// Sinais de que ela acordou, guardados no aparelho: o toque (ou a dispensa) no alarme de acordar, registrado pelo
// service worker, e a primeira vez que o Ritual fica visível de manhã. Servem só para preencher o "Acordei" do
// ritual da manhã, que ela confirma; nada é gravado no registro de sono sem ela ver.
const DB = 'ritual-signals';
const STORE = 'kv';

function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

/** Data local (YYYY-MM-DD) e hora (HH:MM) de um instante, no fuso do aparelho. */
export function localParts(d = new Date()) {
  const p = (n: number) => String(n).padStart(2, '0');
  return { date: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`, time: `${p(d.getHours())}:${p(d.getMinutes())}`, min: d.getHours() * 60 + d.getMinutes() };
}

/** Só conta como "acordei" o que acontece entre 3h e 12h. */
export const inMorning = (min: number) => min >= 3 * 60 && min < 12 * 60;

/** Guarda o horário se ainda não houver um mais cedo para o mesmo dia e tipo. */
export async function noteSignal(kind: 'alarm' | 'open', at = new Date()) {
  const { date, time, min } = localParts(at);
  if (!inMorning(min)) return;
  try {
    const db = await open();
    const key = `${kind}:${date}`;
    await new Promise<void>((res) => {
      const tx = db.transaction(STORE, 'readwrite');
      const st = tx.objectStore(STORE);
      const g = st.get(key);
      g.onsuccess = () => { if (!g.result || g.result > time) st.put(time, key); };
      tx.oncomplete = () => res();
      tx.onerror = () => res();
    });
    db.close();
  } catch { /* sem IndexedDB: fica a meta */ }
}

/** O horário mais provável de ter acordado nesse dia: o alarme primeiro, a primeira abertura como reserva. */
export async function wakeSignal(date: string): Promise<{ time: string; from: 'alarm' | 'open' } | undefined> {
  try {
    const db = await open();
    const read = (k: string) => new Promise<string | undefined>((res) => {
      const g = db.transaction(STORE).objectStore(STORE).get(k);
      g.onsuccess = () => res(g.result); g.onerror = () => res(undefined);
    });
    const [alarm, first] = [await read(`alarm:${date}`), await read(`open:${date}`)];
    db.close();
    return pickWake(alarm, first);
  } catch { return undefined; }
}

/** Alarme vence; sem ele, a primeira abertura. Se a abertura vier antes do alarme (acordou antes dele), vale a abertura. */
export function pickWake(alarm?: string, first?: string): { time: string; from: 'alarm' | 'open' } | undefined {
  if (alarm && first) return first < alarm ? { time: first, from: 'open' } : { time: alarm, from: 'alarm' };
  if (alarm) return { time: alarm, from: 'alarm' };
  if (first) return { time: first, from: 'open' };
  return undefined;
}
