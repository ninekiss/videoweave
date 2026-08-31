import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VideoWeave",
  description: "Video generation, replication and temporal media workbench",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
