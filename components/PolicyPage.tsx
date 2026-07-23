import type { ReactNode } from "react";

type Section = {
  title: string;
  content: ReactNode;
};

export default function PolicyPage({
  eyebrow,
  title,
  summary,
  sections,
}: {
  eyebrow: string;
  title: string;
  summary: string;
  sections: Section[];
}) {
  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <section className="border-b border-white/10 bg-slate-900">
        <div className="mx-auto max-w-4xl px-5 py-12 sm:py-16">
          <p className="text-sm font-bold uppercase tracking-[0.25em] text-cyan-400">
            {eyebrow}
          </p>
          <h1 className="mt-3 text-4xl font-black sm:text-5xl">{title}</h1>
          <p className="mt-5 max-w-3xl text-base leading-7 text-slate-300 sm:text-lg">
            {summary}
          </p>
          <p className="mt-4 text-sm text-slate-500">Last updated: July 23, 2026</p>
        </div>
      </section>

      <section className="mx-auto w-full max-w-4xl px-5 py-10 sm:py-14">
        <div className="space-y-6">
          {sections.map((section, index) => (
            <article
              key={section.title}
              className="rounded-2xl border border-white/10 bg-slate-900 p-5 sm:p-8"
            >
              <h2 className="text-xl font-black text-cyan-400 sm:text-2xl">
                {index + 1}. {section.title}
              </h2>
              <div className="mt-4 space-y-4 text-sm leading-7 text-slate-300 sm:text-base [&_a]:font-bold [&_a]:text-cyan-400 [&_a]:hover:text-cyan-300 [&_li]:ml-5 [&_li]:pl-1 [&_ul]:list-disc [&_ul]:space-y-2">
                {section.content}
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
