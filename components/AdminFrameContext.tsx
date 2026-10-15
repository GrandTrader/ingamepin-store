"use client";
import { createContext, useContext } from "react";
export const AdminFrameContext = createContext<{ walletCount: number; setWalletCount: (count: number) => void } | null>(null);
export const useAdminFrame = () => useContext(AdminFrameContext);
