/**
 * Props that make an element and everything in it unreachable (no focus, no
 * clicks, hidden from assistive tech) while it is off screen. React 18 does
 * not know the attribute yet, so it is passed as a string.
 */
export const inert = (on: boolean) => (on ? { inert: "" } : {}) as object;
