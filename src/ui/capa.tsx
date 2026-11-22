// Capas ilustradas da Pauta: uma por tipo de lente, nas cores do app, com granulado leve.
// Entram quando a matéria não tem imagem boa (ou a imagem não carrega).
import { useId, useState, type CSSProperties } from 'react';
import type { PautaCapa } from '../db/types';

function Grain({ id, dark }: { id: string; dark?: boolean }) {
  return (
    <defs>
      <pattern id={id} width="6" height="6" patternUnits="userSpaceOnUse">
        <circle cx="1" cy="1" r="0.6" fill={dark ? '#000' : '#2A1A10'} opacity="0.14" />
        <circle cx="4" cy="4" r="0.5" fill="#FAF6EC" opacity={dark ? 0.18 : 0.3} />
      </pattern>
    </defs>
  );
}

function Art({ capa }: { capa: PautaCapa }) {
  switch (capa) {
    case 'carreira': return (<>
      <rect width="160" height="120" fill="#B3CEC6" />
      <circle cx="128" cy="24" r="42" fill="#6FA39A" opacity="0.6" /><circle cx="128" cy="24" r="24" fill="#FAF6EC" opacity="0.35" />
      <rect x="18" y="76" width="18" height="50" rx="4" fill="#0D4D4F" opacity="0.3" /><rect x="44" y="62" width="18" height="64" rx="4" fill="#0D4D4F" opacity="0.5" />
      <rect x="70" y="50" width="18" height="76" rx="4" fill="#0D4D4F" opacity="0.72" /><rect x="96" y="32" width="18" height="94" rx="4" fill="#0D4D4F" />
      <path d="M12 86 L50 66 L76 72 L112 36 L142 22" stroke="#FAF6EC" strokeWidth="3.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="142" cy="22" r="6" fill="#E8875A" stroke="#FAF6EC" strokeWidth="2.5" />
    </>);
    case 'dinheiro': return (<>
      <rect width="160" height="120" fill="#F4D78E" />
      <circle cx="34" cy="112" r="74" fill="#EDC15A" /><circle cx="34" cy="112" r="46" fill="#D2A432" opacity="0.7" />
      {[98, 84, 70, 56].map((y, k) => (
        <g key={y}>
          <path d={`M86 ${y}v9a26 8 0 0 0 52 0v-9`} fill="#D2A432" stroke="#4A2E06" strokeWidth="2.2" />
          <ellipse cx="112" cy={y} rx="26" ry="8" fill={k === 3 ? '#FAF6EC' : '#F4D78E'} stroke="#4A2E06" strokeWidth="2.2" />
        </g>
      ))}
      <path d="M48 22l3.5 9 9 3.5-9 3.5-3.5 9-3.5-9-9-3.5 9-3.5z" fill="#4A2E06" />
      <path d="M140 18l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" fill="#4A2E06" opacity="0.6" />
    </>);
    case 'saude': return (<>
      <rect width="160" height="120" fill="#3E4216" />
      {[[24, 22, 1.6], [58, 14, 1.2], [78, 34, 1.8], [40, 44, 1], [150, 70, 1.2]].map(([x, y, r]) => <circle key={`${x}`} cx={x} cy={y} r={r} fill="#F4D78E" />)}
      <circle cx="116" cy="38" r="34" fill="#F4D78E" opacity="0.12" /><circle cx="116" cy="38" r="22" fill="#F4D78E" /><circle cx="127" cy="31" r="19" fill="#3E4216" />
      <path d="M0 84 Q20 72 40 84 T80 84 T120 84 T160 84 V120 H0Z" fill="#979E6C" />
      <path d="M0 100 Q20 90 40 100 T80 100 T120 100 T160 100 V120 H0Z" fill="#CACC92" />
      <path d="M14 66 h22 l6 -12 l8 22 l6 -10 h20" stroke="#CACC92" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </>);
    case 'mercado': return (<>
      <rect width="160" height="120" fill="#CFC1DF" />
      <circle cx="34" cy="30" r="40" fill="#FAF6EC" opacity="0.5" />
      <rect x="16" y="56" width="32" height="70" rx="3" fill="#8E7FB8" /><rect x="54" y="28" width="38" height="98" rx="3" fill="#2B2456" />
      <rect x="98" y="64" width="26" height="62" rx="3" fill="#8E7FB8" /><rect x="128" y="42" width="24" height="84" rx="3" fill="#2B2456" opacity="0.85" />
      {[38, 52, 66, 80].flatMap((y, r) => [61, 74].map((x, c) => <rect key={`${x}-${y}`} x={x} y={y} width="7" height="7" fill={(r + c) % 2 === 0 ? '#EDC15A' : '#CFC1DF'} />))}
      <path d="M22 22 l10 -10 l10 10" stroke="#2B2456" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </>);
    case 'mundo': return (<>
      <rect width="160" height="120" fill="#EBBFC2" />
      <circle cx="30" cy="100" r="46" fill="#D18E97" opacity="0.45" />
      <circle cx="92" cy="62" r="40" fill="#5A1E37" />
      <ellipse cx="92" cy="62" rx="16" ry="40" fill="none" stroke="#EBBFC2" strokeWidth="2" opacity="0.8" />
      <path d="M52 62h80M58 42h68M58 82h68" stroke="#EBBFC2" strokeWidth="2" opacity="0.8" />
      <ellipse cx="92" cy="62" rx="62" ry="16" fill="none" stroke="#C0582C" strokeWidth="2.5" strokeDasharray="5 6" transform="rotate(-18 92 62)" />
      <circle cx="148" cy="44" r="6" fill="#E8875A" stroke="#FAF6EC" strokeWidth="2.5" />
    </>);
    default: return (<>
      <rect width="160" height="120" fill="#F2B48C" />
      <circle cx="116" cy="40" r="34" fill="none" stroke="#E8875A" strokeWidth="3" strokeDasharray="4 7" /><circle cx="116" cy="40" r="22" fill="#E8875A" />
      <path d="M0 90 Q40 62 80 84 T160 76 V120 H0Z" fill="#D18E97" />
      <path d="M0 104 Q50 86 100 102 T160 98 V120 H0Z" fill="#C0582C" />
    </>);
  }
}

/** Capa de lente. size em px ou proporção livre pelo style (width/height). */
export function Capa({ capa, className, style, round }: { capa: PautaCapa; className?: string; style?: CSSProperties; round?: number }) {
  const gid = `g${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <svg className={`capa ${className ?? ''}`} style={{ borderRadius: round, ...style }} viewBox="0 0 160 120" preserveAspectRatio="xMidYMid slice" aria-hidden focusable="false">
      <Grain id={gid} dark={capa === 'saude'} />
      <Art capa={capa} />
      <rect width="160" height="120" fill={`url(#${gid})`} />
    </svg>
  );
}

/** Imagem da matéria quando houver; se não houver ou não carregar, a capa da lente. */
export function NewsImage({ src, capa, className, style, round }: { src?: string; capa: PautaCapa; className?: string; style?: CSSProperties; round?: number }) {
  const [bad, setBad] = useState(false);
  if (!src || bad) return <Capa capa={capa} className={className} style={style} round={round} />;
  return <img className={`capa ${className ?? ''}`} style={{ borderRadius: round, objectFit: 'cover', ...style }} src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBad(true)} />;
}
