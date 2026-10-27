/** Test stub for next/font/google: returns the shape the app reads (style.fontFamily, variable). */
const font = (family: string) => () => ({ style: { fontFamily: family }, variable: `--font-${family.toLowerCase().replace(/\s+/g, "-")}`, className: "" });
export const Inter = font("Inter");
export const Roboto = font("Roboto");
export const Roboto_Condensed = font("Roboto Condensed");
export const Bebas_Neue = font("Bebas Neue");
export const Source_Serif_4 = font("Source Serif 4");
