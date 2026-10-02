import Image from "next/image";
import Link from "next/link";

export function Mark({ size = 40 }: { size?: number }) {
  return (
    <span className="brand-mark" style={{ width: size, height: size }} aria-hidden="true">
      <Image src="/yaqin-logo.png" alt="" width={2172} height={724} style={{ width: size * 4.1, height: size * 1.37 }} />
    </span>
  );
}

export function Logo({ compact = false, href = "/" }: { compact?: boolean; href?: string }) {
  return (
    <Link href={href} className={`brand-logo ${compact ? "brand-logo-compact" : ""}`} aria-label="Yaqin — home">
      <Image src="/yaqin-logo.png" alt="Yaqin · يقين" width={2172} height={724} preload />
    </Link>
  );
}
