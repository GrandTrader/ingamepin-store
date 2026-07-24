"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export type HeroSlide = {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  desktopImageUrl: string;
  mobileImageUrl: string | null;
  buttonText: string;
  buttonUrl: string;
};

export default function HeroSlider({
  slides,
  autoplayMs = 5000,
}: {
  slides: HeroSlide[];
  autoplayMs?: number;
}) {
  const [currentSlide, setCurrentSlide] = useState(0);

  useEffect(() => {
    if (slides.length < 2) return;
    const slider = setInterval(() => {
      setCurrentSlide((previous) => previous === slides.length - 1 ? 0 : previous + 1);
    }, autoplayMs);
    return () => clearInterval(slider);
  }, [autoplayMs, slides.length]);

  if (slides.length === 0) return null;
  const safeIndex = Math.min(currentSlide, slides.length - 1);
  const slide = slides[safeIndex];

  return (
    <section className="mx-auto max-w-7xl px-3 pt-3 sm:px-5 sm:pt-8">
      <div className="relative min-h-[236px] overflow-hidden rounded-2xl bg-slate-900 sm:min-h-[430px] sm:rounded-3xl">
        <picture>
          {slide.mobileImageUrl && <source media="(max-width: 639px)" srcSet={slide.mobileImageUrl} />}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={slide.desktopImageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
        </picture>
        <div className="absolute inset-0 bg-gradient-to-r from-slate-950/90 via-slate-950/55 to-slate-950/10" />

        <div className="relative z-10 grid min-h-[236px] items-center gap-6 px-6 py-7 sm:min-h-[430px] sm:gap-10 sm:px-12 sm:py-14 md:grid-cols-2 md:px-20">
          <div className="max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-300 sm:text-sm sm:tracking-[0.3em]">{slide.eyebrow}</p>
            <h1 className="mt-2 max-w-[290px] text-[27px] font-black leading-[1.08] text-white sm:mt-5 sm:max-w-none sm:text-4xl md:text-6xl">{slide.title}</h1>
            <p className="mt-2 line-clamp-2 max-w-[300px] text-xs leading-5 text-white/80 sm:mt-5 sm:line-clamp-none sm:max-w-2xl sm:text-lg">{slide.description}</p>
            <div className="mt-4 flex gap-2 sm:mt-8 sm:flex-wrap sm:gap-4">
              <Link href={slide.buttonUrl} className="rounded-lg bg-cyan-400 px-4 py-2 text-xs font-bold text-slate-950 transition hover:bg-cyan-300 sm:rounded-xl sm:px-6 sm:py-3 sm:text-base">{slide.buttonText}</Link>
              <Link href="/products" className="rounded-lg border border-white/50 px-4 py-2 text-xs font-bold text-white transition hover:bg-white/10 sm:rounded-xl sm:px-6 sm:py-3 sm:text-base">View All Products</Link>
            </div>
          </div>
        </div>

        {slides.length > 1 && (
          <>
            <button type="button" onClick={() => setCurrentSlide(safeIndex === 0 ? slides.length - 1 : safeIndex - 1)} aria-label="Previous slide" className="absolute left-2 top-1/2 z-20 hidden -translate-y-1/2 rounded-full bg-slate-950/40 px-2.5 py-2 text-lg text-white hover:bg-slate-950/70 sm:block sm:left-4 sm:px-4 sm:py-3 sm:text-2xl">‹</button>
            <button type="button" onClick={() => setCurrentSlide(safeIndex === slides.length - 1 ? 0 : safeIndex + 1)} aria-label="Next slide" className="absolute right-2 top-1/2 z-20 hidden -translate-y-1/2 rounded-full bg-slate-950/40 px-2.5 py-2 text-lg text-white hover:bg-slate-950/70 sm:block sm:right-4 sm:px-4 sm:py-3 sm:text-2xl">›</button>
            <div className="absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 gap-2 sm:bottom-6">
              {slides.map((item, index) => (
                <button key={item.id} type="button" onClick={() => setCurrentSlide(index)} aria-label={`Open slide ${index + 1}`} className={`h-2 rounded-full transition-all sm:h-3 ${safeIndex === index ? "w-9 bg-white" : "w-3 bg-white/50"}`} />
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
