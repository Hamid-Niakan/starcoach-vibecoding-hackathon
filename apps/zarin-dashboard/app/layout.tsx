import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "داشبورد تحلیلی زرین‌پال",
  description: "بینش‌های قابل اقدام و قابل ردیابی برای پذیرندگان",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fa" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
