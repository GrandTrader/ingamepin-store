"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import styles from "./HeroSlider.module.css";

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

type Props = { slides: HeroSlide[]; autoplayMs?: number };

export default function HeroSlider({ slides, autoplayMs = 5000 }: Props) {
  if (!slides.length) return null;
  return <Carousel key={slides.map((slide) => slide.id).join(":")} slides={slides} autoplayMs={autoplayMs} />;
}

function Carousel({ slides, autoplayMs = 5000 }: Props) {
  // Two offers still need separate left and right previews around the centre.
  const panels = slides.length === 2 ? [...slides, ...slides] : slides;
  const count = panels.length;
  const multiple = slides.length > 1;
  const duration = Number.isFinite(autoplayMs) ? Math.max(2000, autoplayMs) : 5000;
  const [position, setPosition] = useState({ index: 0, revision: 0 });
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [paused, setPaused] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(true);
  const [pageVisible, setPageVisible] = useState(true);
  const [inView, setInView] = useState(false);
  const root = useRef<HTMLElement>(null);
  const elapsed = useRef(0);
  const gesture = useRef<{ x: number; y: number; id: number } | null>(null);
  const suppressClickUntil = useRef(0);
  const activeIndex = position.index % slides.length;
  const playing = multiple && !reducedMotion && !paused && !hovered && !focused && !dragging && pageVisible && inView;

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotion = () => setReducedMotion(media.matches);
    const updateVisibility = () => setPageVisible(document.visibilityState === "visible");
    updateMotion();
    updateVisibility();
    media.addEventListener("change", updateMotion);
    document.addEventListener("visibilitychange", updateVisibility);
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: 0.1 });
    if (root.current) observer.observe(root.current);
    return () => {
      media.removeEventListener("change", updateMotion);
      document.removeEventListener("visibilitychange", updateVisibility);
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    elapsed.current = 0;
    root.current?.style.setProperty("--hero-progress", "0");
  }, [position, duration]);

  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      elapsed.current += now - last;
      last = now;
      root.current?.style.setProperty("--hero-progress", String(Math.min(1, elapsed.current / duration)));
      if (elapsed.current >= duration) {
        setPosition((previous) => ({ index: (previous.index + 1) % count, revision: previous.revision + 1 }));
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, position, duration, count]);

  function goTo(index: number) {
    setPosition((previous) => ({ index: (index + count) % count, revision: previous.revision + 1 }));
  }

  function endGesture(event: PointerEvent<HTMLDivElement>) {
    const start = gesture.current;
    gesture.current = null;
    setDragging(false);
    if (!start || start.id !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    const x = event.clientX - start.x;
    const y = event.clientY - start.y;
    if (Math.abs(x) > 10 && Math.abs(x) > Math.abs(y)) suppressClickUntil.current = performance.now() + 400;
    if (Math.abs(x) >= 40 && Math.abs(x) > Math.abs(y) * 1.25) goTo(position.index + (x < 0 ? 1 : -1));
  }

  return (
    <section
      ref={root}
      className={styles.root}
      aria-label="Featured offers"
      aria-roledescription="carousel"
      data-single={!multiple}
      data-playing={playing}
      data-static={reducedMotion}
      onPointerEnter={(event) => { if (event.pointerType !== "touch") setHovered(true); }}
      onPointerLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}
      onKeyDown={(event) => {
        if (!multiple || event.altKey || event.ctrlKey || event.metaKey) return;
        if (event.key === "ArrowLeft") goTo(position.index - 1);
        else if (event.key === "ArrowRight") goTo(position.index + 1);
        else if (event.key === "Home") goTo(0);
        else if (event.key === "End") goTo(slides.length - 1);
        else return;
        event.preventDefault();
      }}
    >
      <div
        className={styles.stage}
        onDragStart={(event) => event.preventDefault()}
        onPointerDown={(event) => {
          if (!multiple || !event.isPrimary || event.button !== 0 || (event.target as HTMLElement).closest("button")) return;
          gesture.current = { x: event.clientX, y: event.clientY, id: event.pointerId };
        }}
        onPointerMove={(event) => {
          const start = gesture.current;
          if (!start || start.id !== event.pointerId) return;
          const x = Math.abs(event.clientX - start.x);
          const y = Math.abs(event.clientY - start.y);
          if (x > 10 && x > y) {
            setDragging(true);
            event.currentTarget.setPointerCapture(event.pointerId);
          }
        }}
        onPointerUp={endGesture}
        onPointerCancel={() => { gesture.current = null; setDragging(false); }}
        onClickCapture={(event) => {
          if (performance.now() < suppressClickUntil.current) { event.preventDefault(); event.stopPropagation(); }
        }}
      >
        {panels.map((slide, index) => {
          let offset = (index - position.index + count) % count;
          if (offset > count / 2) offset -= count;
          const active = offset === 0;
          const place = active ? "active" : offset === -1 ? "previous" : offset === 1 ? "next" : offset < 0 ? "before" : "after";
          const title = slide.title || `Featured offer ${index % slides.length + 1}`;
          return (
            <div key={`${slide.id}-${index}`} className={styles.slide} data-position={place} role="group" aria-roledescription="slide" aria-label={`${index % slides.length + 1} of ${slides.length}`} aria-hidden={!active}>
              <Link
                href={slide.buttonUrl}
                className={styles.link}
                aria-label={`${title} — ${slide.buttonText || "Buy Now"}`}
                tabIndex={active ? 0 : -1}
                prefetch={active ? undefined : false}
                draggable={false}
                onClick={(event) => { if (!active) { event.preventDefault(); goTo(index); } }}
              >
                <picture>
                  {slide.mobileImageUrl && <source media="(max-width: 639px)" srcSet={slide.mobileImageUrl} />}
                  <img src={slide.desktopImageUrl} alt="" width={1920} height={700} draggable={false} loading={active ? "eager" : "lazy"} fetchPriority={active ? "high" : "auto"} decoding="async" className={styles.image} />
                </picture>
                <span className={styles.cta}>{slide.buttonText || "Buy Now"}<span aria-hidden="true">↗</span></span>
              </Link>
            </div>
          );
        })}
        {multiple && <>
          <button type="button" className={`${styles.arrow} ${styles.previous}`} aria-label="Previous slide" onClick={() => goTo(position.index - 1)}><svg aria-hidden="true" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="m15 4-8 8 8 8" /></svg></button>
          <button type="button" className={`${styles.arrow} ${styles.next}`} aria-label="Next slide" onClick={() => goTo(position.index + 1)}><svg aria-hidden="true" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="m9 4 8 8-8 8" /></svg></button>
        </>}
      </div>
      {multiple && <div className={styles.controls}>
        <div className={styles.indicators} aria-label="Choose featured offer">
          {slides.map((slide, index) => <button key={slide.id} type="button" className={styles.indicator} aria-label={`Open slide ${index + 1}`} aria-current={activeIndex === index ? "true" : undefined} onClick={() => goTo(index)}><span><i /></span></button>)}
        </div>
        {!reducedMotion && <button type="button" className={styles.rotation} aria-label={paused ? "Play slideshow" : "Pause slideshow"} onClick={() => setPaused(!paused)}>
          {paused ? <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="m5 3 8 5-8 5Z" /></svg> : <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M4 3h3v10H4zm5 0h3v10H9z" /></svg>}
        </button>}
      </div>}
      <p className={styles.status} aria-live={playing ? "off" : "polite"} aria-atomic="true">Slide {activeIndex + 1} of {slides.length}: {slides[activeIndex].title || "Featured offer"}</p>
    </section>
  );
}
