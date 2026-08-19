import { Sora, Inter } from "next/font/google";
import "./globals.css";
import BotonSoporteWhatsapp from "@/components/BotonSoporteWhatsapp";
import BotonVenderRapido from "@/components/BotonVenderRapido";

const sora = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata = {
  title: "EMPREMAS",
  description: "Gestión comercial y facturación electrónica para pequeños comercios",
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="es"
      className={`${sora.variable} ${inter.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-cream">
        {children}
        <BotonVenderRapido />
        <BotonSoporteWhatsapp />
      </body>
    </html>
  );
}
