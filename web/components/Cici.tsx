/**
 * Cici, the HamApps mascot (the box-cat from the HamApps logo), happy and holding the HamEats bowl. Drawn in the
 * logo's style and pose (see cici-art-guide.txt in the HamApps folder): solid cream body, thick navy outline, gold
 * lid, facing right toward the bowl. Used only in a few quiet spots: empty states, the About page and the footer.
 *
 * Navy lines disappear on a dark page, so in dark mode Cici sits on a light disc.
 */
export function Cici({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="-40 -40 1170 1070" aria-hidden className={`shrink-0 overflow-visible ${className}`}>
      <circle cx="545" cy="490" r="600" fill="#e6edf7" className="hidden dark:inline" />
      <CiciBowlArt />
    </svg>
  );
}

/** The drawing itself (Cici and the bowl) in its own 1100-unit space, for pictures that place it in a scene. */
export function CiciBowlArt() {
  return (
    <>
      {/* Cici, mirrored to face right. */}
      <g transform="translate(997 0) scale(-1 1)">
        <g transform="rotate(-6 500 420)">
          <path fill="#f8f4ee" d="M285 32 L432 102 L675 15 L972 165 L972 580 L605 715 L333 557 L334 178 Z" />
          <path fill="#e3c06f" d="M432 102 L675 15 L972 165 L818 226 Z" />
          <g fill="none" stroke="#0f366f" strokeWidth={38} strokeLinecap="round" strokeLinejoin="round">
            <path d="M334 178 L285 32 Q392 28 432 102" />
            <path d="M334 178 L331 552 L125 625" />
            <path d="M432 102 L675 15 L972 165 L972 580 L385 822" />
            <path d="M334 552 L608 700" />
            <path d="M820 248 L958 200" />
            <path d="M125 625 C125 560 105 500 70 497 C35 495 22 545 25 575 C28 605 40 630 58 645" />
            <path d="M385 822 C385 760 365 702 330 700 C290 700 275 745 278 770 C282 800 300 820 318 832" />
            <path d="M578 263 C650 195 740 150 808 138" />
            {/* Happy closed eyes. */}
            <path d="M388 438 Q412 392 438 442" />
            <path d="M515 498 Q566 410 620 502" />
          </g>
          <path fill="#0f366f" d="M786 140 L827 136 L816 232 L838 268 L840 365 L778 383 L773 285 Z" />
          <path fill="#0f366f" d="M786 507 L838 492 L845 610 L800 628 L790 620 Z" />
          <ellipse cx="402" cy="495" rx="30" ry="16" fill="#f29bb0" transform="rotate(14 402 495)" />
          <ellipse cx="600" cy="565" rx="38" ry="19" fill="#f29bb0" transform="rotate(14 600 565)" />
        </g>
      </g>
      {/* The HamEats bowl, with its gold H and steam, under Cici's paw. */}
      <g stroke="#0f366f" strokeWidth={32} strokeLinejoin="round" strokeLinecap="round">
        <path d="M395 735 H985 A295 250 0 0 1 395 735 Z" fill="#ffffff" />
        <g fill="none" stroke="#f0b100" strokeWidth={34}>
          <path d="M580 690 C555 640 615 600 585 540" />
          <path d="M695 690 C670 640 730 600 700 540" />
          <path d="M810 690 C785 640 845 600 815 540" />
        </g>
      </g>
      <path fill="#f0b100" d="M630 790 h42 v50 h52 v-50 h42 v132 h-42 v-50 h-52 v50 h-42 Z" />
    </>
  );
}
