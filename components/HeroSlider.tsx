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
      setCurrentSlide((previous) =>
        previous === slides.length - 1 ? 0 : previous + 1,
      );
    }, autoplayMs);

    return () => clearInterval(slider);
  }, [autoplayMs, slides.length]);

  if (slides.length === 0) return null;

  const safeIndex = Math.min(currentSlide, slides.length - 1);
  const slide = slides[safeIndex];

  return (
    <section className="mx-auto hidden max-w-6xl px-5 pt-6 sm:block">
      <div className="relative aspect-[1920/700] w-full overflow-hidden rounded-3xl bg-slate-900">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={slide.desktopImageUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-fill"
        />

        <Link
          href={slide.buttonUrl}
          className="absolute bottom-6 right-6 z-10 rounded-xl bg-cyan-400 px-6 py-3 text-base font-black text-slate-950 shadow-lg transition hover:bg-cyan-300 md:bottom-8 md:right-8"
        >
          Buy Now
        </Link>

        {slides.length > 1 && (
          <>
            <button
              type="button"
              onClick={() =>
                setCurrentSlide(
                  safeIndex === 0 ? slides.length - 1 : safeIndex - 1,
                )
              }
              aria-label="Previous slide"
              className="absolute left-4 top-1/2 z-20 -translate-y-1/2 rounded-full bg-slate-950/45 px-4 py-3 text-2xl text-white transition hover:bg-slate-950/75"
            >
              {"\u2039"}
            </button>

            <button
              type="button"
              onClick={() =>
                setCurrentSlide(
                  safeIndex === slides.length - 1 ? 0 : safeIndex + 1,
                )
              }
              aria-label="Next slide"
              className="absolute right-4 top-1/2 z-20 -translate-y-1/2 rounded-full bg-slate-950/45 px-4 py-3 text-2xl text-white transition hover:bg-slate-950/75"
            >
              {"\u203a"}
            </button>

            <div className="absolute bottom-6 left-1/2 z-20 flex -translate-x-1/2 gap-2">
              {slides.map((item, index) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setCurrentSlide(index)}
                  aria-label={`Open slide ${index + 1}`}
                  className={`h-3 rounded-full transition-all ${
                    safeIndex === index ? "w-9 bg-white" : "w-3 bg-white/50"
                  }`}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}


