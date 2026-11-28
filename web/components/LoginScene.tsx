import { CiciBowlArt } from "@/components/Cici";

const NAVY = "#0f366f";
const GOLD = "#f0b100";

/** A four-point sparkle centered on (x, y), r long from the middle to each point. */
const sparkle = (x: number, y: number, r: number) => {
  const k = r * 0.3;
  return `M${x} ${y - r} L${x + k} ${y - k} L${x + r} ${y} L${x + k} ${y + k} L${x} ${y + r} L${x - k} ${y + k} L${x - r} ${y} L${x - k} ${y - k} Z`;
};

/** A five-point star centered on (x, y), for the chalk doodles. */
const star = (x: number, y: number, r: number) =>
  Array.from({ length: 10 }, (_, i) => {
    const a = (Math.PI / 5) * i - Math.PI / 2;
    const d = i % 2 ? r * 0.45 : r;
    return `${i ? "L" : "M"}${(x + d * Math.cos(a)).toFixed(1)} ${(y + d * Math.sin(a)).toFixed(1)}`;
  }).join(" ") + " Z";

/**
 * The picture at the top of the login screen: a corner of a dining hall, with Cici at a table holding the HamEats
 * bowl, a chalkboard announcing today's special (the Poke Bowl from the example alert below it) and a hanging lamp.
 * Drawn in the Cici art style (thick navy outlines, cream and gold). It's its own little lit room, so it stays light in
 * dark mode too.
 */
export function LoginScene({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 1200 700" role="img" aria-label="Cici at a dining hall table with a HamEats bowl, under a chalkboard that says Today's special: Poke Bowl" className={className}>
      <defs>
        <linearGradient id="login-wall" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fdf8ee" />
          <stop offset="1" stopColor="#f2e7d2" />
        </linearGradient>
        <radialGradient id="login-glow">
          <stop offset="0" stopColor="#ffe9a8" stopOpacity="0.9" />
          <stop offset="1" stopColor="#ffe9a8" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Wall, with a lower panel. */}
      <rect width="1200" height="700" fill="url(#login-wall)" />
      <rect y="470" width="1200" height="230" fill="#e9dcc2" />
      <path d="M0 470 H1200" stroke={NAVY} strokeWidth={10} opacity={0.25} />

      {/* Hanging lamp. */}
      <path d="M800 0 V40" stroke={NAVY} strokeWidth={10} />
      <circle cx="800" cy="110" r="150" fill="url(#login-glow)" />
      <path d="M745 100 L770 40 H830 L855 100 Z" fill={GOLD} stroke={NAVY} strokeWidth={14} strokeLinejoin="round" />

      {/* Chalkboard: today's special. */}
      <g transform="rotate(-3 330 200)">
        <rect x="95" y="60" width="470" height="285" rx="18" fill="#c98f4e" stroke={NAVY} strokeWidth={14} />
        <rect x="123" y="88" width="414" height="229" rx="8" fill="#2e4a3c" />
        <text x="330" y="150" textAnchor="middle" className="font-display" fontWeight={700} fontSize={34} letterSpacing={5} fill="#f4efe1" opacity={0.8}>
          TODAY&apos;S SPECIAL
        </text>
        <text x="330" y="240" textAnchor="middle" className="font-display" fontWeight={700} fontSize={82} fill="#fdfaf2">
          Poke Bowl
        </text>
        <path d="M190 270 C250 258 300 282 360 268 S450 262 470 272" fill="none" stroke={GOLD} strokeWidth={8} strokeLinecap="round" />
        <path d={star(160, 285, 16)} fill={GOLD} />
        <path d={star(508, 292, 14)} fill={GOLD} />
        <rect x="150" y="345" width="360" height="14" rx="6" fill="#a8733b" stroke={NAVY} strokeWidth={8} />
        <rect x="200" y="333" width="40" height="12" rx="5" fill="#fdfaf2" />
      </g>

      {/* Cici at the table, the bowl resting on it. */}
      <g transform="translate(615 150) scale(0.46)">
        <CiciBowlArt />
      </g>

      {/* Table. */}
      <rect x="-20" y="596" width="1240" height="34" rx="10" fill="#e3a865" stroke={NAVY} strokeWidth={14} />
      <rect x="0" y="630" width="1200" height="80" fill="#d08f4c" stroke={NAVY} strokeWidth={14} />

      {/* Sparkles. */}
      <g fill={GOLD} stroke={NAVY} strokeWidth={7} strokeLinejoin="round">
        <path d={sparkle(560, 440, 34)} />
        <path d={sparkle(1150, 260, 26)} />
        <path d={sparkle(70, 440, 22)} />
      </g>
    </svg>
  );
}
