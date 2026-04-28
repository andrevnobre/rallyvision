"use client";

import { useEffect, useState } from "react";
import { adminGetMetrics, type AdminMetrics } from "@/lib/api";

function Card({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: "20px 24px" }}>
      <div style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 6 }}>{label}</div>
      <div style={{ fontFamily: "var(--f-head)", fontSize: 32, fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 6 }}>{sub}</div>}
    </div>
  );
}

export default function AdminDashboard() {
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminGetMetrics().then(setMetrics).catch(e => setError(String(e)));
  }, []);

  if (error) return <p style={{ color: "#fca5a5" }}>{error}</p>;
  if (!metrics) return <p style={{ color: "var(--text-dim)" }}>A carregar…</p>;

  const { users_total, by_plan, videos_total, by_status, videos_today, errors_active } = metrics;

  return (
    <div>
      <div style={{ marginBottom: 32 }}>
        <div style={{ fontFamily: "var(--f-head)", fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em" }}>Dashboard</div>
        <div style={{ fontSize: 14, color: "var(--text-dim)", marginTop: 4 }}>Visão geral do sistema.</div>
      </div>

      <section style={{ marginBottom: 40 }}>
        <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 16 }}>Utilizadores</div>
        <div className="bv-grid-3" style={{ gap: 16 }}>
          <Card label="Total de utilizadores" value={users_total} />
          <Card label="Plano Free" value={by_plan.free} />
          <Card label="Plano Pro" value={by_plan.pro} sub={`Club: ${by_plan.club}`} />
        </div>
      </section>

      <section>
        <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 16 }}>Vídeos</div>
        <div className="bv-grid-3" style={{ gap: 16 }}>
          <Card label="Total processados" value={videos_total} />
          <Card label="Analisados hoje" value={videos_today} />
          <Card
            label="Erros activos"
            value={errors_active}
            sub={`Em processamento: ${by_status.processing} · Na fila: ${by_status.pending}`}
          />
        </div>
        <div style={{ marginTop: 24, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: "20px 24px" }}>
          <div style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 16 }}>Distribuição por estado</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            {(Object.entries(by_status) as [string, number][]).map(([s, n]) => (
              <div key={s} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                <span style={{ fontFamily: "var(--f-mono)", color: "var(--text-dim)" }}>{s}</span>
                <span style={{ fontFamily: "var(--f-head)", fontWeight: 700 }}>{n}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
