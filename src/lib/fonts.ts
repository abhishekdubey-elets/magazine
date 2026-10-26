import { Inter, Roboto, Roboto_Condensed, Bebas_Neue, Source_Serif_4 } from "next/font/google";
import type { FontRole } from "./types";

/** UI typeface for the application chrome. */
export const inter = Inter({ subsets: ["latin"], variable: "--font-ui", display: "swap" });

/* Editorial typefaces used on magazine pages. Chosen to echo the reference
 * print file (Roboto body, condensed grotesque headlines, Bebas display). */
export const roboto = Roboto({
  subsets: ["latin"],
  weight: ["300", "400", "500", "700", "900"],
  style: ["normal", "italic"],
  variable: "--font-body",
  display: "swap",
});
export const robotoCondensed = Roboto_Condensed({
  subsets: ["latin"],
  weight: ["300", "400", "700", "800"],
  variable: "--font-headline",
  display: "swap",
});
export const bebas = Bebas_Neue({ subsets: ["latin"], weight: "400", variable: "--font-display", display: "swap" });
export const sourceSerif = Source_Serif_4({
  subsets: ["latin"],
  weight: ["400", "600"],
  style: ["normal", "italic"],
  variable: "--font-serif",
  display: "swap",
});

export const fontVariables = [inter, roboto, robotoCondensed, bebas, sourceSerif].map((f) => f.variable).join(" ");

/** Concrete CSS font-family stacks per editorial role (also used for canvas text measurement). */
export const fontFamilies: Record<FontRole, string> = {
  headline: robotoCondensed.style.fontFamily,
  display: bebas.style.fontFamily,
  body: roboto.style.fontFamily,
  sans: inter.style.fontFamily,
  serif: sourceSerif.style.fontFamily,
};

/** Human-readable family names for the properties panel and InDesign mapping. */
export const fontDisplayNames: Record<FontRole, string> = {
  headline: "Roboto Condensed",
  display: "Bebas Neue",
  body: "Roboto",
  sans: "Inter",
  serif: "Source Serif 4",
};
