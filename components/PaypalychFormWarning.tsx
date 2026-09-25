"use client";
import { useEffect, useRef, useState } from "react";
import PaypalychProductWarning from "./PaypalychProductWarning";

export default function PaypalychFormWarning({ initialIdentities = [] }: { initialIdentities?: string[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [identities, setIdentities] = useState(initialIdentities);
  useEffect(() => {
    const form = ref.current?.closest("form");
    if (!form) return;
    const update = () => {
      const values = ["name", "name_ru", "slug"].map(name => {
        const field = form.elements.namedItem(name);
        return field instanceof HTMLInputElement ? field.value : "";
      });
      const category = form.elements.namedItem("category_id");
      if (category instanceof HTMLSelectElement) values.push(category.selectedOptions[0]?.textContent ?? "");
      setIdentities(values);
    };
    form.addEventListener("input", update);
    form.addEventListener("change", update);
    update();
    return () => { form.removeEventListener("input", update); form.removeEventListener("change", update); };
  }, []);
  return <div ref={ref}><PaypalychProductWarning identities={identities} /></div>;
}
