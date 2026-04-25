"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { login, setToken } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const token = await login(email, password);
      setToken(token);
      router.push("/");
    } catch {
      setError("Email ou palavra-passe incorretos.");
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      {/* NAV */}
      <nav className="bv-nav">
        <div className="bv-container bv-nav-inner">
          <Link href="/landing" className="bv-nav-logo">
            <div className="bv-nav-logo-dot" />
            BT Vision
          </Link>
          <div className="bv-nav-actions">
            <span style={{ fontSize: 14, color: "var(--text-dim)" }}>Ainda não tens conta?</span>
            <Link href="/auth/register" className="bv-btn bv-btn-green bv-btn-sm">Criar conta</Link>
          </div>
        </div>
      </nav>

      {/* AUTH CARD */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "48px 24px" }}>
        <div style={{ width: "100%", maxWidth: 420, background: "var(--surface)", border: "1px solid var(--border-2)", borderRadius: 20, padding: 40, boxShadow: "0 40px 80px rgba(0,0,0,0.4)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: "var(--f-head)", fontSize: 20, fontWeight: 700, letterSpacing: "-0.03em", marginBottom: 32 }}>
            <div className="bv-nav-logo-dot" />
            BT Vision
          </div>
          <div style={{ fontFamily: "var(--f-head)", fontSize: 26, fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 6 }}>Bem-vindo de volta.</div>
          <div style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 32, fontWeight: 300 }}>Entra na tua conta para aceder às análises.</div>

          <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div className="bv-form-group">
              <label className="bv-form-label" htmlFor="email">Email</label>
              <div className="bv-input-wrapper">
                <div className="bv-input-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" />
                  </svg>
                </div>
                <input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" placeholder="andre@exemplo.com" className="bv-form-input bv-input-with-icon" />
              </div>
            </div>

            <div className="bv-form-group">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <label className="bv-form-label" htmlFor="password">Password</label>
                <a href="#" style={{ fontSize: 12, color: "var(--green-l)" }}>Esqueci a password</a>
              </div>
              <div className="bv-input-wrapper">
                <div className="bv-input-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                </div>
                <input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} required autoComplete="current-password" placeholder="••••••••" className="bv-form-input bv-input-with-icon" />
              </div>
            </div>

            {error && <p style={{ fontSize: 13, color: "#fca5a5", padding: "10px 14px", background: "var(--red-bg)", borderRadius: "var(--radius)", border: "1px solid #7f1d1d" }}>{error}</p>}

            <button type="submit" disabled={loading} style={{ width: "100%", padding: 13, fontFamily: "var(--f-head)", fontSize: 15, fontWeight: 600, background: loading ? "var(--green-dim)" : "var(--green)", color: "#fff", border: "none", borderRadius: "var(--radius)", cursor: loading ? "not-allowed" : "pointer", transition: "background 0.15s" }}>
              {loading ? "A entrar…" : "Entrar"}
            </button>
          </form>

          <div style={{ marginTop: 24, textAlign: "center", fontSize: 14, color: "var(--text-dim)" }}>
            Ainda não tens conta?{" "}
            <Link href="/auth/register" style={{ color: "var(--green-l)" }}>Criar conta grátis</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
