import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BT Vision",
  description: "Beach tennis video analytics",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt">
      <body>{children}</body>
    </html>
  );
}
