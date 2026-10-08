"use client";

import { createContext, useContext } from "react";

const ReadOnlyContext = createContext(false);

export function ReadOnlyProvider({ children }: { children: React.ReactNode }) {
  return <ReadOnlyContext value={true}>{children}</ReadOnlyContext>;
}

/** True inside an <EditGate> for a viewer. Panel actions use it to disable their controls. */
export const useReadOnly = () => useContext(ReadOnlyContext);
