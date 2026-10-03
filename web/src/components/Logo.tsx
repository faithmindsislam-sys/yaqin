import Image from "next/image";
import Link from "next/link";

export function Logo({ compact = false, href = "/" }: { compact?: boolean; href?: string }) {
  return (
    <Link href={href} className={`brand-logo ${compact ? "brand-logo-compact" : ""}`} aria-label="Yaqin — home">
      <Image src="/yaqin-logo.png" alt="يقين · Yaqin" width={1388} height={621} preload />
    </Link>
  );
}
