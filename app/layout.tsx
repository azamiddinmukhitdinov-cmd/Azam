import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Для тебя, Лианночка ♡",
  description: "Одно маленькое письмо. Одно особенное свидание.",
  robots: { index: false, follow: false },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body className="antialiased">{children}</body>
    </html>
  );
}
