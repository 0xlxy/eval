import type { Metadata } from "next";
import { Navbar } from "@/components/navbar";
import { CommandPalette } from "@/components/command-palette";
import { getSearchItems } from "@/lib/search-data";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dev Eval - Engineering Productivity",
  description: "Daily commit analysis and engineering efficiency evaluation",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const searchItems = await getSearchItems();
  return (
    <html
      lang="en"
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col">
        <Navbar />
        <CommandPalette items={searchItems} />
        <main className="flex-1 container mx-auto px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
