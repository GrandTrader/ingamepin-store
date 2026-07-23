"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const slides = [
  {
    id: 1,
    label: "Secure Manual Delivery",
    title: "PlayStation Gift Cards India",
    description:
      "Purchase genuine PlayStation Store gift cards with fast digital delivery.",
    buttonText: "Shop PlayStation",
    href: "/products/playstation",
    background: "from-blue-700 via-blue-600 to-cyan-500",
    placeholder: "PlayStation Gift Card",
  },
  {
    id: 2,
    label: "Apple App Store",
    title: "Apple Gift Cards India",
    description:
      "Buy Apple App Store gift cards for apps, games, movies and subscriptions.",
    buttonText: "Shop Apple Cards",
    href: "/products/apple",
    background: "from-slate-700 via-purple-700 to-pink-500",
    placeholder: "Apple Gift Card",
  },
  {
    id: 3,
    label: "Steam Wallet",
    title: "Steam Wallet Gift Cards India",
    description:
      "Add funds to your Steam Wallet and purchase your favourite PC games.",
    buttonText: "Shop Steam Wallet",
    href: "/products/steam",
    background: "from-slate-900 via-blue-900 to-cyan-700",
    placeholder: "Steam Wallet Card",
  },
  {
    id: 4,
    label: "Fast Game Top-Up",
    title: "PUBG Mobile UC Top-Up",
    description:
      "Enter your game UID and receive UC directly in your PUBG Mobile account.",
    buttonText: "Top-Up Now",
    href: "/category/gaming-top-ups",
    background: "from-orange-800 via-red-700 to-yellow-500",
    placeholder: "PUBG Mobile UC",
  },
];

export default function HeroSlider() {
  const [currentSlide, setCurrentSlide] = useState(0);

  useEffect(() => {
    const slider = setInterval(() => {
      setCurrentSlide((previousSlide) =>
        previousSlide === slides.length - 1 ? 0 : previousSlide + 1
      );
    }, 5000);

    return () => clearInterval(slider);
  }, []);

  function previousSlide() {
    setCurrentSlide((previousSlide) =>
      previousSlide === 0 ? slides.length - 1 : previousSlide - 1
    );
  }

  function nextSlide() {
    setCurrentSlide((previousSlide) =>
      previousSlide === slides.length - 1 ? 0 : previousSlide + 1
    );
  }

  const slide = slides[currentSlide];

  return (
    <section className="mx-auto max-w-7xl px-3 pt-3 sm:px-5 sm:pt-8">
      <div
        className={`relative min-h-[236px] overflow-hidden rounded-2xl bg-gradient-to-br sm:min-h-[430px] sm:rounded-3xl ${slide.background}`}
      >
        <div className="absolute inset-0 bg-slate-950/10" />

        <div className="relative z-10 grid min-h-[236px] items-center gap-6 px-6 py-7 sm:min-h-[430px] sm:gap-10 sm:px-12 sm:py-14 md:grid-cols-2 md:px-20">
          <div className="max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/80 sm:text-sm sm:tracking-[0.3em]">
              {slide.label}
            </p>

            <h1 className="mt-2 max-w-[290px] text-[27px] font-black leading-[1.08] text-white sm:mt-5 sm:max-w-none sm:text-4xl md:text-6xl">
              {slide.title}
            </h1>

            <p className="mt-2 line-clamp-2 max-w-[300px] text-xs leading-5 text-white/80 sm:mt-5 sm:line-clamp-none sm:max-w-2xl sm:text-lg">
              {slide.description}
            </p>

            <div className="mt-4 flex gap-2 sm:mt-8 sm:flex-wrap sm:gap-4">
              <Link
                href={slide.href}
                className="rounded-lg bg-white px-4 py-2 text-xs font-bold text-slate-950 transition hover:bg-slate-200 sm:rounded-xl sm:px-6 sm:py-3 sm:text-base"
              >
                {slide.buttonText}
              </Link>

              <Link
                href="/products"
                className="rounded-lg border border-white/50 px-4 py-2 text-xs font-bold text-white transition hover:bg-white/10 sm:rounded-xl sm:px-6 sm:py-3 sm:text-base"
              >
                View All Products
              </Link>
            </div>
          </div>

          <div className="hidden items-center justify-center md:flex">
            <div className="flex h-[320px] w-[320px] rotate-3 items-center justify-center rounded-3xl border border-white/25 bg-white/10 p-8 text-center shadow-2xl backdrop-blur-sm">
              <div>
                <div className="text-6xl">🎮</div>

                <p className="mt-5 text-2xl font-black text-white">
                  {slide.placeholder}
                </p>

                <p className="mt-2 text-sm font-medium text-white/70">
                  Product image will be added later
                </p>
              </div>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={previousSlide}
          aria-label="Previous slide"
          className="absolute left-2 top-1/2 z-20 hidden -translate-y-1/2 rounded-full bg-slate-950/40 px-2.5 py-2 text-lg text-white transition hover:bg-slate-950/70 sm:block sm:left-4 sm:px-4 sm:py-3 sm:text-2xl"
        >
          ‹
        </button>

        <button
          type="button"
          onClick={nextSlide}
          aria-label="Next slide"
          className="absolute right-2 top-1/2 z-20 hidden -translate-y-1/2 rounded-full bg-slate-950/40 px-2.5 py-2 text-lg text-white transition hover:bg-slate-950/70 sm:block sm:right-4 sm:px-4 sm:py-3 sm:text-2xl"
        >
          ›
        </button>

        <div className="absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 gap-2 sm:bottom-6">
          {slides.map((item, index) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setCurrentSlide(index)}
              aria-label={`Open slide ${index + 1}`}
              className={`h-2 rounded-full transition-all sm:h-3 ${
                currentSlide === index
                  ? "w-9 bg-white"
                  : "w-3 bg-white/50"
              }`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
