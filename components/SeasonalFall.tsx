"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

const leaves = ["🍂", "🍁", "🍃", "🍂", "🍁", "🍂", "🍃", "🍁", "🍂", "🍁", "🍃", "🍂"];

export default function SeasonalFall() {
  const pathname = usePathname();
  const [clientPathname, setClientPathname] = useState("");

  useEffect(() => {
    setClientPathname(pathname);
  }, [pathname]);

  if (!clientPathname || clientPathname.startsWith("/admin")) {
    return null;
  }

  return (
    <div className="seasonal-fall" aria-hidden="true">
      {leaves.map((leaf, index) => (
        <span className="seasonal-fall-leaf" key={leaf + "-" + index}>
          {leaf}
        </span>
      ))}
    </div>
  );
}
