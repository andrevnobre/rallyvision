"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { register, setToken } from "@/lib/api";

function getStrength(val: string): { width: string; color: string; label: string } {
  let score = 0;
  if (val.length >= 8) score++;
  if (/[A-Z]/.test(val)) score++;
  if (/[0-9]/.test(val)) score++;
  if (/[^A-Za-z0-9]/.test(val)) score++;
  const configs = [
    { width: "0%", color: "transparent", label: "" },
    { width: "25%", color: "#dc2626", label: "Fraca" },
    { width: "50%", color: "#f59e0b", label: "Média" },
    { width: "75%", color: "#3b82f6", label: "Boa" },
    { width: "100%", color: "#16a34a", label: "Forte" },
  ];
  return configs[score];
}

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const strength = getStrength(password);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      setError("A palavra-passe deve ter pelo menos 8 caracteres.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const token = await register(email, password);
      setToken(token);
      router.push("/");
    } catch (err) {
      const msg = String(err);
      setError(msg.includes("409") || msg.includes("já registado") ? "Este email já está registado." : "Erro ao criar conta.");
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
            <span style={{ fontSize: 14, color: "var(--text-dim)" }}>Já tens conta?</span>
            <Link href="/auth/login" className="bv-btn bv-btn-ghost bv-btn-sm">Entrar</Link>
          </div>
        </div>
      </nav>

      {/* AUTH CARD */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "48px 24px" }}>
        <div style={{ width: "100%", maxWidth: 440, background: "var(--surface)", border: "1px solid var(--border-2)", borderRadius: 20, padding: 40, boxShadow: "0 40px 80px rgba(0,0,0,0.4)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: "var(--f-head)", fontSize: 20, fontWeight: 700, letterSpacing: "-0.03em", marginBottom: 32 }}>
            <div className="bv-nav-logo-dot" />
            BT Vision
          </div>
          <div style={{ fontFamily: "var(--f-head)", fontSize: 26, fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 6 }}>Começar grátis.</div>
          <div style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 24, fontWeight: 300 }}>Cria a tua conta e analisa as primeiras 2 partidas sem custos.</div>

          {/* Free badge */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--green-bg)", border: "1px solid var(--green-dim)", borderRadius: "var(--radius)", padding: "12px 16px", fontSize: 13, color: "var(--green-l)", marginBottom: 24 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            Plano Free · Sem cartão de crédito · 2 análises por mês
          </div>

          <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
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
              <label className="bv-form-label" htmlFor="password">Password</label>
              <div className="bv-input-wrapper">
                <div className="bv-input-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                </div>
                <input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} required autoComplete="new-password" placeholder="Mínimo 8 caracteres" minLength={8} className="bv-form-input bv-input-with-icon" />
              </div>
              {password.length > 0 && (
                <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 4 }}>
                  <span style={{ fontSize: 12, color: "var(--text-dim)", whiteSpace: "nowrap" }}>
                    Força: {strength.label}
                  </span>
                  <div style={{ height: 3, flex: 1, background: "var(--surface-2)", borderRadius: 2, overflow: "hidden" }}>
                    <div style={{ height: "100%", borderRadius: 2, background: strength.color, width: strength.width, transition: "width 0.3s, background 0.3s" }} />
                  </div>
                </div>
              )}
            </div>

            <div style={{ fontSize: 12, color: "var(--text-dim)", lineHeight: 1.6 }}>
              Ao criar conta, aceitas os <a href="#" style={{ color: "var(--text-muted)", textDecoration: "underline" }}>Termos de Serviço</a> e a <a href="#" style={{ color: "var(--text-muted)", textDecoration: "underline" }}>Política de Privacidade</a> do BT Vision.
            </div>

            {error && <p style={{ fontSize: 13, color: "#fca5a5", padding: "10px 14px", background: "var(--red-bg)", borderRadius: "var(--radius)", border: "1px solid #7f1d1d" }}>{error}</p>}

            <button type="submit" disabled={loading} style={{ width: "100%", padding: 13, fontFamily: "var(--f-head)", fontSize: 15, fontWeight: 600, background: loading ? "var(--green-dim)" : "var(--green)", color: "#fff", border: "none", borderRadius: "var(--radius)", cursor: loading ? "not-allowed" : "pointer", transition: "background 0.15s" }}>
              {loading ? "A criar conta…" : "Criar conta grátis"}
            </button>
          </form>

          <div style={{ marginTop: 24, textAlign: "center", fontSize: 14, color: "var(--text-dim)" }}>
            Já tens conta?{" "}
            <Link href="/auth/login" style={{ color: "var(--green-l)" }}>Entrar</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
