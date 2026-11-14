import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { THEME_STORAGE_KEY } from "@/lib/theme";

export const metadata: Metadata = {
  title: "DAVELE — Modern Secure Productivity & Notes",
  description: "A premium, private, and secure notes application built for high focus and productivity.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#121214" },
    { media: "(prefers-color-scheme: light)", color: "#f6f5fa" },
  ],
};

// Runs synchronously in <head> before first paint, so the saved theme is
// applied immediately on every full page load (no light/dark flash).
// Dark is the default when nothing has been saved yet.
const themeScript = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");var d=t==="light"?false:t==="system"?window.matchMedia("(prefers-color-scheme: dark)").matches:true;var r=document.documentElement;r.classList.toggle("dark",d);r.style.colorScheme=d?"dark":"light";}catch(e){}})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark h-full antialiased" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full flex flex-col bg-bg text-fg font-sans">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
