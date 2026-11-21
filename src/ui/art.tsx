// Ilustrações vetoriais nas cores do app (sem pessoas), com grão leve, e o medidor em arco.
// O movimento é sutil e para quando o aparelho pede menos movimento (ver .art-* no CSS).
import { useId } from 'react';

function Grain({ id }: { id: string }) {
  return (
    <filter id={id}>
      <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves={2} stitchTiles="stitch" />
      <feColorMatrix type="saturate" values="0" />
      <feComponentTransfer><feFuncA type="table" tableValues="0 0.10" /></feComponentTransfer>
    </filter>
  );
}

/** Poente (noite) ou nascer do sol (manhã), atrás do card do ritual. */
export function SkyScene({ period }: { period: 'am' | 'pm' }) {
  const u = useId().replace(/:/g, '');
  const pm = period === 'pm';
  const sky = pm ? ['#2A1A10', '#5A1E37', '#C0582C', '#E8875A'] : ['#F2B48C', '#F4C78E', '#EDC15A', '#F7D58A'];
  const hills = pm ? ['#7A3352', '#5A1E37', '#3A1426'] : ['#D9764A', '#C0582C', '#8F3E1C'];
  return (
    <svg className="art-fill" viewBox="0 0 358 250" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs>
        <linearGradient id={`${u}s`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={sky[0]} /><stop offset="0.45" stopColor={sky[1]} /><stop offset="0.8" stopColor={sky[2]} /><stop offset="1" stopColor={sky[3]} />
        </linearGradient>
        <radialGradient id={`${u}g`} cx="0.5" cy="0.5" r="0.5"><stop offset="0" stopColor="#F7D58A" stopOpacity="0.9" /><stop offset="1" stopColor="#F7D58A" stopOpacity="0" /></radialGradient>
        <linearGradient id={`${u}d`} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#2A1A10" stopOpacity={pm ? 0.75 : 0.45} /><stop offset="0.6" stopColor="#2A1A10" stopOpacity="0" /></linearGradient>
        <Grain id={`${u}n`} />
      </defs>
      <rect width="358" height="250" fill={`url(#${u}s)`} />
      <circle cx="268" cy="168" r="90" fill={`url(#${u}g)`} />
      <g className="art-bob"><circle cx="268" cy={pm ? 172 : 150} r="38" fill={pm ? '#EDC15A' : '#FAF6EC'} /></g>
      {pm && <g fill="#F6DDE3"><circle cx="40" cy="30" r="1.6" /><circle cx="96" cy="18" r="1.2" /><circle className="art-tw" cx="150" cy="40" r="1.4" /><circle cx="210" cy="22" r="1.1" /><circle className="art-tw" cx="320" cy="34" r="1.5" /></g>}
      <path d="M0 190 C 60 160, 120 175, 180 168 S 290 150, 358 172 L358 250 L0 250 Z" fill={hills[0]} />
      <path d="M0 212 C 70 190, 150 205, 220 196 S 320 186, 358 200 L358 250 L0 250 Z" fill={hills[1]} />
      <path d="M0 232 C 90 214, 180 230, 260 222 S 340 214, 358 222 L358 250 L0 250 Z" fill={hills[2]} />
      <rect width="358" height="250" fill={`url(#${u}d)`} />
      <rect width="358" height="250" filter={`url(#${u}n)`} />
    </svg>
  );
}

/** Copo que enche até a fração da meta de água, com a superfície ondulando. */
export function WaterGlass({ level }: { level: number }) {
  const u = useId().replace(/:/g, '');
  const f = Math.max(0, Math.min(1, level));
  const y = Math.round(104 - 92 * f);
  const wave = (x0: number, yy: number) => `M${x0} ${yy} q 8 -5 16 0 t 16 0 t 16 0 t 16 0 t 16 0 t 16 0 t 16 0 t 16 0 V110 H${x0} Z`;
  const glass = 'M6 10 L58 10 L52 102 Q51 106 47 106 L17 106 Q13 106 12 102 Z';
  return (
    <svg width="58" height="100" viewBox="0 0 64 110" role="img" aria-label={`Copo com ${Math.round(f * 100)}% da meta de água`}>
      <defs><clipPath id={`${u}c`}><path d={glass} /></clipPath></defs>
      <g clipPath={`url(#${u}c)`}>
        <rect width="64" height="110" fill="#DCEBE6" />
        {f > 0 && <>
          <g className="art-wave"><path d={wave(0, y)} fill="#0D4D4F" /></g>
          <g className="art-wave2"><path d={wave(-8, y + 3)} fill="#1E6668" opacity="0.7" /></g>
          <circle className="art-bub" cx="22" cy={y + 22} r="2.2" fill="#B3CEC6" />
          <circle className="art-bub b2" cx="38" cy={y + 40} r="1.6" fill="#B3CEC6" />
        </>}
      </g>
      <path d={glass} fill="none" stroke="#0D4D4F" strokeWidth="2.4" strokeLinejoin="round" />
      <path d="M14 20 L12 60" stroke="#FAF6EC" strokeWidth="3" strokeLinecap="round" opacity="0.7" />
    </svg>
  );
}

/** Prato visto de cima, para a refeição sugerida (o que já foi registrado usa a foto real). */
export function PlateArt({ size = 150, steam = true }: { size?: number; steam?: boolean }) {
  const u = useId().replace(/:/g, '');
  return (
    <svg width={size} height={size} viewBox="0 0 150 150" aria-hidden>
      <defs><radialGradient id={`${u}r`} cx="0.45" cy="0.4" r="0.6"><stop offset="0" stopColor="#FFFDF7" /><stop offset="1" stopColor="#EFE6D3" /></radialGradient></defs>
      <ellipse cx="78" cy="82" rx="64" ry="62" fill="#4A1F0A" opacity="0.18" />
      <circle cx="75" cy="76" r="62" fill="#FAF6EC" />
      <circle cx="75" cy="76" r="48" fill={`url(#${u}r)`} stroke="#E4D8BD" strokeWidth="2" />
      <path d="M44 58 C 50 40, 82 38, 90 54 C 96 66, 84 80, 66 80 C 50 80, 40 72, 44 58 Z" fill="#EDC15A" />
      <path d="M50 60 C 56 50, 76 48, 82 58" fill="none" stroke="#D2A432" strokeWidth="3" strokeLinecap="round" />
      <circle cx="60" cy="66" r="3" fill="#979E6C" /><circle cx="72" cy="62" r="2.4" fill="#979E6C" /><circle cx="78" cy="70" r="2" fill="#C0582C" />
      <path d="M88 76 C 100 64, 118 70, 116 86 C 114 100, 96 104, 88 96 C 82 90, 82 82, 88 76 Z" fill="#CACC92" />
      <path d="M94 80 C 100 74, 108 76, 110 82 M92 90 C 98 86, 106 88, 108 94" fill="none" stroke="#979E6C" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="104" cy="88" r="5" fill="#C0582C" /><circle cx="96" cy="96" r="4" fill="#D9764A" />
      <path d="M46 92 C 52 82, 76 84, 80 96 C 82 108, 60 116, 50 108 C 44 104, 42 98, 46 92 Z" fill="#FFFDF7" stroke="#E4D8BD" strokeWidth="1.5" />
      <g fill="#E4D8BD"><ellipse cx="56" cy="96" rx="2.4" ry="1.2" /><ellipse cx="64" cy="100" rx="2.4" ry="1.2" transform="rotate(30 64 100)" /><ellipse cx="70" cy="94" rx="2.4" ry="1.2" transform="rotate(-20 70 94)" /><ellipse cx="60" cy="106" rx="2.4" ry="1.2" /></g>
      {steam && <g className="art-steam" fill="none" stroke="#FAF6EC" strokeWidth="2.4" strokeLinecap="round" opacity="0.85"><path d="M62 30 c -4 -6 4 -10 0 -16" /><path className="s2" d="M76 26 c -4 -6 4 -10 0 -16" /><path d="M90 30 c -4 -6 4 -10 0 -16" /></g>}
    </svg>
  );
}

/** Cena do esporte para o próximo treino: estrada (corrida e pedal) ou raia (natação). Sem pessoas. */
export function SportScene({ sport }: { sport: 'run' | 'bike' | 'swim' | 'strength' }) {
  const u = useId().replace(/:/g, '');
  const water = sport === 'swim';
  return (
    <svg className="art-fill" viewBox="0 0 358 170" preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id={`${u}s`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={water ? '#B3CEC6' : '#F2B48C'} /><stop offset="0.7" stopColor={water ? '#DCEBE6' : '#F7D58A'} /><stop offset="1" stopColor={water ? '#8DB6AC' : '#EDC15A'} /></linearGradient>
        <linearGradient id={`${u}d`} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#FAF6EC" stopOpacity="0.85" /><stop offset="0.55" stopColor="#FAF6EC" stopOpacity="0" /></linearGradient>
        <Grain id={`${u}n`} />
      </defs>
      <rect width="358" height="170" fill={`url(#${u}s)`} />
      {water ? (
        <>
          <g className="art-bob"><circle cx="280" cy="40" r="22" fill="#FAF6EC" opacity="0.9" /></g>
          <rect x="0" y="70" width="358" height="100" fill="#6FA39A" />
          {[92, 120, 148].map((y) => <g key={y} className="art-wave"><path d={`M0 ${y} q 12 -5 24 0 t 24 0 t 24 0 t 24 0 t 24 0 t 24 0 t 24 0 t 24 0 t 24 0 t 24 0 t 24 0 t 24 0 t 24 0 t 24 0 t 24 0 t 24 0`} fill="none" stroke="#DCEBE6" strokeWidth="2" opacity="0.6" /></g>)}
          {[106, 134].map((y) => <g key={y}>{Array.from({ length: 18 }, (_, i) => <circle key={i} cx={200 + i * 9} cy={y} r="3" fill={i % 4 === 0 ? '#C0582C' : '#FAF6EC'} />)}</g>)}
        </>
      ) : (
        <>
          <g className="art-bob"><circle cx="270" cy="92" r="26" fill="#FAF6EC" opacity="0.9" /></g>
          <path d="M0 104 C 70 84, 140 100, 210 90 S 320 78, 358 92 L358 170 L0 170 Z" fill="#CACC92" />
          <path d="M0 124 C 80 108, 170 122, 250 112 S 330 104, 358 112 L358 170 L0 170 Z" fill="#979E6C" />
          <path d="M300 170 C 286 148, 250 132, 226 118 C 216 112, 214 108, 220 106 L 230 106 C 238 112, 270 128, 358 150 L358 170 Z" fill={sport === 'bike' ? '#5A1E37' : '#C0582C'} />
          <path d="M240 118 L252 124 M268 132 L282 140 M300 148 L318 158" stroke="#FAF6EC" strokeWidth="2.4" strokeLinecap="round" />
          <g fill="#33360F"><circle cx="190" cy="104" r="9" /><rect x="189" y="108" width="2" height="10" /><circle cx="206" cy="100" r="6" /><rect x="205" y="103" width="2" height="9" /><circle cx="330" cy="118" r="10" /><rect x="329" y="124" width="2" height="12" /></g>
        </>
      )}
      <rect width="358" height="170" fill={`url(#${u}d)`} />
      <rect width="358" height="170" filter={`url(#${u}n)`} />
    </svg>
  );
}

/** Medidor em arco (meia-lua) com um marcador na posição de f (0 a 1). */
export function Arc({ f, from, to, track = 'rgba(255,255,255,.10)', knob = '#FAF6EC', width = 300, label }: { f: number; from: string; to: string; track?: string; knob?: string; width?: number; label: string }) {
  const u = useId().replace(/:/g, '');
  const r = width / 2 - 32, cx = width / 2, cy = r + 16, L = Math.PI * r;
  const ff = Math.max(0, Math.min(1, f));
  const a = Math.PI * (1 - ff), kx = cx + r * Math.cos(a), ky = cy - r * Math.sin(a);
  const d = `M${cx - r} ${cy} A${r} ${r} 0 0 1 ${cx + r} ${cy}`;
  return (
    <svg className="arc" width="100%" viewBox={`0 0 ${width} ${Math.round(cy + 16)}`} role="img" aria-label={label}>
      <defs><linearGradient id={`${u}a`} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor={from} /><stop offset="1" stopColor={to} /></linearGradient></defs>
      <path d={d} fill="none" stroke={track} strokeWidth="22" strokeLinecap="round" />
      <path className="arc-fill" d={d} fill="none" stroke={`url(#${u}a)`} strokeWidth="22" strokeLinecap="round" strokeDasharray={`${(L * ff).toFixed(1)} ${L.toFixed(1)}`} />
      <circle cx={kx} cy={ky} r="15" fill={knob} /><circle cx={kx} cy={ky} r="6" fill={to} />
    </svg>
  );
}
