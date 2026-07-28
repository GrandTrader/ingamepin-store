"use client";

import {
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";

type AdminOrdersTableScrollerProps = {
  children: ReactNode;
};

export default function AdminOrdersTableScroller({
  children,
}: AdminOrdersTableScrollerProps) {
  const topScroller = useRef<HTMLDivElement>(null);
  const tableScroller = useRef<HTMLDivElement>(null);
  const [contentWidth, setContentWidth] = useState(0);
  const syncing = useRef(false);

  useEffect(() => {
    const tableElement = tableScroller.current;

    if (!tableElement) {
      return;
    }

    const updateWidth = () => {
      setContentWidth(tableElement.scrollWidth);
    };

    updateWidth();

    const observer = new ResizeObserver(updateWidth);
    observer.observe(tableElement);

    const table = tableElement.querySelector("table");
    if (table) {
      observer.observe(table);
    }

    return () => observer.disconnect();
  }, []);

  function syncScroll(
    source: HTMLDivElement,
    destination: HTMLDivElement | null,
  ) {
    if (!destination || syncing.current) {
      return;
    }

    syncing.current = true;
    destination.scrollLeft = source.scrollLeft;

    requestAnimationFrame(() => {
      syncing.current = false;
    });
  }

  return (
    <>
      <div
        ref={topScroller}
        onScroll={(event) =>
          syncScroll(event.currentTarget, tableScroller.current)
        }
        className="overflow-x-auto border-b border-slate-200 bg-slate-50"
        aria-label="Slide orders table left or right"
      >
        <div
          className="h-4"
          style={{ width: Math.max(contentWidth, 1) }}
        />
      </div>

      <div
        ref={tableScroller}
        onScroll={(event) =>
          syncScroll(event.currentTarget, topScroller.current)
        }
        className="overflow-x-auto"
      >
        {children}
      </div>
    </>
  );
}
