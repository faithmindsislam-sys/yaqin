import type { Metadata, Viewport } from "next";
import { Amiri_Quran, DM_Serif_Display, Readex_Pro } from "next/font/google";
import { I18nProvider } from "@/lib/i18n";
import { SessionProvider } from "@/lib/session";
import { ContentProvider } from "@/lib/content";
import { OnboardingProvider } from "@/lib/onboarding-state";
import "./globals.css";

const readex = Readex_Pro({ variable: "--font-readex", subsets: ["latin", "arabic"], display: "swap" });
const dmSerif = DM_Serif_Display({
  variable: "--font-dmserif",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  display: "swap",
});
const amiriQuran = Amiri_Quran({ variable: "--font-amiri-quran", subsets: ["arabic"], weight: "400", display: "swap" });

export const metadata: Metadata = {
  title: "Yaqin — Knowledge that brings you closer",
  description:
    "Short visual Islamic lessons you can listen to and talk to, in Arabic and English, with every claim traceable to an approved source.",
};

export const viewport: Viewport = { themeColor: "#174a85" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" dir="ltr" className={`${readex.variable} ${dmSerif.variable} ${amiriQuran.variable}`} suppressHydrationWarning>
      <body className="min-h-screen">
        <I18nProvider>
          <OnboardingProvider><SessionProvider><ContentProvider>{children}</ContentProvider></SessionProvider></OnboardingProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
