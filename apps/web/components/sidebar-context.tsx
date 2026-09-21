"use client";

import { createContext, useContext } from "react";

export const SidebarCtx = createContext<{ open: boolean; setOpen: (next: boolean) => void }>({
  open: false,
  setOpen: () => {},
});

export function useSidebar() {
  return useContext(SidebarCtx);
}
