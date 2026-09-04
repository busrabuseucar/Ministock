import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "MiniStock — Stok ve hareket takibi",
  description:
    "Ürünlerini, stok giriş ve çıkışlarını ve düşük stokları tek ekrandan takip et.",
  icons: { icon: "/favicon.svg" },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="tr">
      <body>{children}</body>
    </html>
  );
}
