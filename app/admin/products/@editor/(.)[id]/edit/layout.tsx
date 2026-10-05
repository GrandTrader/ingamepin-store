import type { ReactNode } from "react";
import ProductEditorDialog from "@/components/ProductEditorDialog";

export default function ProductEditorLayout({ children }: { children: ReactNode }) {
  return <ProductEditorDialog>{children}</ProductEditorDialog>;
}
