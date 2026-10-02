// Soft painted-style scenery drawn in SVG, so it stays crisp at any size.
// Swap for reviewed illustrations in /public/img when they are generated.

export function Skyline({ className = "", tone = "teal" }: { className?: string; tone?: "teal" | "sky" }) {
  const far = tone === "teal" ? "#bfe3e4" : "#d7e9f3";
  const mid = tone === "teal" ? "#8ccfd1" : "#b5d6e8";
  const near = tone === "teal" ? "#4fb2b5" : "#86b9d6";
  return (
    <svg className={className} viewBox="0 0 1200 360" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
      <defs>
        <linearGradient id="sk-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="1" stopColor="#e6f4f6" />
        </linearGradient>
        <linearGradient id="sk-water" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#bfe6ea" />
          <stop offset="1" stopColor="#e9f6f8" />
        </linearGradient>
        <filter id="sk-soft">
          <feGaussianBlur stdDeviation="1.2" />
        </filter>
      </defs>
      <rect width="1200" height="360" fill="url(#sk-sky)" />
      {/* hills */}
      <path d="M0 250 C180 180 320 210 460 190 S760 150 900 185 1100 170 1200 190 V360 H0Z" fill={far} opacity=".7" filter="url(#sk-soft)" />
      {/* far city */}
      <g fill={mid} opacity=".85">
        <rect x="610" y="120" width="10" height="120" rx="3" />
        <path d="M606 122 L615 92 L624 122Z" />
        <rect x="905" y="135" width="9" height="105" rx="3" />
        <path d="M901 137 L909.5 110 L918 137Z" />
        <path d="M680 240 V200 a70 70 0 0 1 140 0 V240Z" />
        <circle cx="750" cy="150" r="6" />
        <rect x="746" y="150" width="8" height="12" />
        <rect x="830" y="195" width="60" height="45" rx="4" />
        <path d="M836 195 a24 24 0 0 1 48 0Z" />
        <rect x="560" y="200" width="44" height="40" rx="4" />
        <path d="M563 200 a19 19 0 0 1 38 0Z" />
      </g>
      {/* near palms */}
      <g fill={near} opacity=".9">
        <path d="M130 300 C135 250 140 215 150 180 L156 182 C148 220 146 260 144 300Z" />
        <path d="M152 182 C120 170 95 175 70 192 C100 180 125 182 150 190Z" />
        <path d="M153 180 C175 155 205 150 235 158 C205 160 180 168 156 188Z" />
        <path d="M151 181 C140 150 120 135 95 132 C120 145 135 160 148 186Z" />
        <path d="M154 182 C185 180 210 192 228 212 C205 198 180 192 154 190Z" />
        <path d="M1050 300 C1046 260 1043 230 1034 200 L1028 202 C1036 232 1038 262 1040 300Z" />
        <path d="M1032 202 C1060 188 1085 190 1108 205 C1082 196 1058 198 1035 208Z" />
        <path d="M1031 200 C1012 178 988 172 962 178 C988 182 1010 190 1028 207Z" />
        <path d="M1033 201 C1045 172 1066 160 1090 158 C1066 168 1050 182 1036 206Z" />
      </g>
      {/* water */}
      <path d="M0 268 C200 258 400 274 600 266 S1000 258 1200 268 V360 H0Z" fill="url(#sk-water)" />
      <g stroke="#ffffff" strokeOpacity=".7" strokeWidth="2" strokeLinecap="round">
        <path d="M240 296 h60 M520 310 h90 M820 300 h70 M380 330 h50 M980 326 h60" />
      </g>
    </svg>
  );
}

export function ArchFrame({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 300 420" aria-hidden="true">
      <defs>
        <linearGradient id="af-stone" x1="0" x2="1">
          <stop offset="0" stopColor="#f6f1e7" />
          <stop offset="1" stopColor="#e9e1d1" />
        </linearGradient>
      </defs>
      <path d="M0 420 V140 C0 60 70 10 150 10 S300 60 300 140 V420 H262 V150 C262 90 212 48 150 48 S38 90 38 150 V420Z" fill="url(#af-stone)" />
      <path d="M38 150 C38 90 88 48 150 48 S262 90 262 150" fill="none" stroke="#d8ccb6" strokeWidth="3" />
      <g fill="none" stroke="#d8ccb6" strokeWidth="1.5" opacity=".9">
        <path d="M60 420 V160 M240 420 V160" />
      </g>
    </svg>
  );
}

/** Eight-point star tile used as a faint background pattern. */
export function StarPattern({ className = "" }: { className?: string }) {
  return (
    <svg className={className} aria-hidden="true">
      <defs>
        <pattern id="star-tile" width="72" height="72" patternUnits="userSpaceOnUse">
          <g fill="none" stroke="currentColor" strokeWidth="1">
            <rect x="22" y="22" width="28" height="28" />
            <rect x="22" y="22" width="28" height="28" transform="rotate(45 36 36)" />
          </g>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#star-tile)" />
    </svg>
  );
}
