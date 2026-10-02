import Link from "next/link";

export function Mark({ size = 40 }: { size?: number }) {
  // Rub el Hizb: two interlaced squares, drawn as rounded strokes.
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <defs>
        <linearGradient id="yq-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2fb0b3" />
          <stop offset="1" stopColor="#0d666a" />
        </linearGradient>
      </defs>
      <g fill="none" stroke="url(#yq-g)" strokeWidth="4.2" strokeLinejoin="round">
        <rect x="11" y="11" width="26" height="26" rx="4" />
        <rect x="11" y="11" width="26" height="26" rx="4" transform="rotate(45 24 24)" />
      </g>
      <circle cx="24" cy="24" r="4.5" fill="#f3f9fc" stroke="url(#yq-g)" strokeWidth="2.4" />
    </svg>
  );
}

export function Logo({ compact = false, href = "/" }: { compact?: boolean; href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2.5" aria-label="Yaqin — home">
      <Mark size={compact ? 32 : 42} />
      <span className="flex flex-col leading-none">
        <span className={`font-serif text-ink ${compact ? "text-xl" : "text-[1.7rem]"}`} lang="en" dir="ltr">
          Yaqin
        </span>
        <span className={`text-teal-700 ${compact ? "text-xs" : "text-sm"} font-medium`} lang="ar" dir="rtl">
          يقين
        </span>
      </span>
    </Link>
  );
}
