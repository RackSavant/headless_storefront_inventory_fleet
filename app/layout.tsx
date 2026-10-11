import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Rack & Sole",
  description: "Walk the store in 3D, try things on, and get full outfits built around what you pick.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#ebe4d8" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
