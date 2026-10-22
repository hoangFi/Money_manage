import type { Metadata } from "next";
import { SessionProvider } from "quy-session";
import { Header, Sidebar } from "@/components/app";
import "./globals.css";

export const metadata: Metadata = {
  title: "Quỹ Chung",
  description: "Tiền chung không ai ôm được. Mọi khoản chi cần đủ người duyệt và có minh chứng công khai.",
};

// SessionProvider is the template's TideCloakProvider (or the demo stand-in, see next.config.ts).
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" data-theme="light" suppressHydrationWarning>
      <head>
        {/* Apply the saved theme before first paint so dark users don't see a light flash. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem("quy-chung-theme")==="dark")document.documentElement.dataset.theme="dark"}catch(e){}`,
          }}
        />
      </head>
      <body>
        <SessionProvider>
          <div className="shell">
            <Sidebar />
            <div className="content">
              <Header />
              <main>{children}</main>
            </div>
          </div>
        </SessionProvider>
      </body>
    </html>
  );
}
