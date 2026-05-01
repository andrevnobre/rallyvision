"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { getToken, getMe } from "@/lib/api";

const NAV = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/users", label: "Utilizadores" },
  { href: "/admin/videos", label: "Vídeos" },
  { href: "/admin/feedback", label: "Feedback" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!getToken()) { router.push("/auth/login"); return; }
    getMe()
      .then(u => {
        if (!u.is_admin) { router.push("/"); return; }
        setReady(true);
      })
      .catch(() => router.push("/auth/login"));
  }, [router]);

  if (!ready) return null;

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <header className="bv-auth-header">
        <div className="bv-container bv-auth-header-inner">
          <Link href="/" className="bv-nav-logo">
            <div className="bv-nav-logo-dot" />
            BT Vision
          </Link>
          <div className="bv-header-sep" />
          <span style={{ fontSize: 12, fontFamily: "var(--f-head)", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-dim)", background: "var(--surface-2)", border: "1px solid var(--border-2)", padding: "2px 10px", borderRadius: 100 }}>
            Admin
          </span>
          <div style={{ flex: 1 }} />
          <Link href="/" style={{ fontSize: 13, color: "var(--text-dim)", textDecoration: "none" }}>← Voltar ao app</Link>
        </div>
      </header>

      <div style={{ flex: 1, display: "flex" }}>
        <nav style={{ width: 200, flexShrink: 0, borderRight: "1px solid var(--border)", padding: "24px 16px", display: "flex", flexDirection: "column", gap: 4 }}>
          {NAV.map(({ href, label }) => {
            const active = pathname === href || (href !== "/admin" && pathname.startsWith(href));
            return (
              <Link
                key={href}
                href={href}
                style={{
                  padding: "8px 12px", borderRadius: "var(--radius)", fontSize: 14,
                  fontFamily: "var(--f-head)", fontWeight: active ? 600 : 400,
                  color: active ? "var(--text)" : "var(--text-dim)",
                  background: active ? "var(--surface-2)" : "transparent",
                  textDecoration: "none", transition: "all 0.15s",
                }}
              >
                {label}
              </Link>
            );
          })}
        </nav>

        <main style={{ flex: 1, padding: "32px 40px", minWidth: 0 }}>
          {children}
        </main>
      </div>
    </div>
  );
}
