import type { Metadata } from "next";
import { AppShell } from "@/components/shell/AppShell";
import { fontVariables } from "@/lib/fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "Elets PressFlow AI",
  description: "From editorial content to publication-ready pages.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${fontVariables} antialiased`}>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
