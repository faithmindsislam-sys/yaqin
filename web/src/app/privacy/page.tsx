"use client";

import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { useI18n } from "@/lib/i18n";

const POINTS = [
  {
    en: "We store your account email and learning progress (which lessons you read, quiz results, notes). Guests' progress stays on their own device.",
    ar: "نحفظ بريد حسابك وتقدّمك التعليمي (الدروس المقروءة، نتائج الاختبارات، الملاحظات). أما تقدّم الزوار فيبقى على أجهزتهم.",
  },
  {
    en: "We never infer, label or store your religious beliefs or practice. Your chosen track only decides which lessons you see.",
    ar: "لا نستنتج قناعاتك أو ممارستك الدينية ولا نصنّفها ولا نخزّنها. المسار الذي تختاره يحدّد الدروس فقط.",
  },
  {
    en: "Questions to the tutor are processed to answer you. We log only the answer level, cited sources and response time — not your question text.",
    ar: "تُعالَج أسئلتك للمعلّم لإجابتك فقط. نسجّل مستوى الإجابة والمصادر المذكورة وزمن الاستجابة — لا نص سؤالك.",
  },
  {
    en: "Voice input is transcribed by your browser and sent only when you submit it.",
    ar: "يُحوَّل صوتك إلى نص في متصفحك، ولا يُرسل إلا عند إرسالك له.",
  },
  {
    en: "Yaqin is an AI-assisted tool, not a scholar. It does not issue personal fatwas.",
    ar: "«يقين» أداة مدعومة بالذكاء الاصطناعي وليست عالمًا، ولا تصدر فتاوى شخصية.",
  },
];

export default function Privacy() {
  const { t } = useI18n();
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-5 py-10">
        <h1 className="font-serif text-4xl text-ink">{t({ en: "Privacy", ar: "الخصوصية" })}</h1>
        <ul className="card mt-6 space-y-4 p-6 text-ink-soft">
          {POINTS.map((p) => (
            <li key={p.en} className="flex gap-3">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-teal-500" />
              {t(p)}
            </li>
          ))}
        </ul>
      </main>
      <SiteFooter />
    </>
  );
}
