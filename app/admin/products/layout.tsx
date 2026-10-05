import { Suspense, type ReactNode } from "react";
import ProductEditorNavigation from "@/components/ProductEditorNavigation";

export default function ProductsLayout({ children, editor }: { children: ReactNode; editor: ReactNode }) {
  return <Suspense fallback={children}><ProductEditorNavigation>{children}{editor}</ProductEditorNavigation></Suspense>;
}
