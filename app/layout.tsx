import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Assets Watcher",
  description: "Educational portfolio intelligence for manually tracked US stocks.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
