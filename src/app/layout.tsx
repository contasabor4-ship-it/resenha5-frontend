import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Resenha Games",
  description: "Jogos multiplayer online",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        {children}
        <div style={{ position: 'fixed', bottom: 8, right: 12, fontSize: 11, color: '#555', pointerEvents: 'none', zIndex: 9999 }}>
          Feito por Hugo O Goat
        </div>
      </body>
    </html>
  );
}
