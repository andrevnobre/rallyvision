"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

const FEATURES = [
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ width: 22, height: 22, color: "var(--green-l)" }}>
        <circle cx="12" cy="12" r="3" /><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
      </svg>
    ),
    title: "Rastreio de bola",
    desc: "Deteção contínua da trajetória da bola frame a frame, com visualização de percurso e identificação automática de rallies.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ width: 22, height: 22, color: "var(--green-l)" }}>
        <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M3 15h18M9 3v18" />
      </svg>
    ),
    title: "Heatmaps de posicionamento",
    desc: "Mapa de cobertura do campo por jogador. Identifica zonas de força, exposição defensiva e padrões de movimento.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ width: 22, height: 22, color: "var(--green-l)" }}>
        <polygon points="5 3 19 12 5 21 5 3" />
      </svg>
    ),
    title: "Replay frame-a-frame",
    desc: "Vídeo original sincronizado com vista de topo animada. Timeline clicável e slider de frames para análise detalhada.",
  },
];

const HOW_STEPS = [
  { num: 1, title: "Carrega o vídeo", desc: "Qualquer câmara, qualquer dispositivo. Drag-and-drop ou clique. Formatos MP4, MOV, AVI e MKV até 2 GB." },
  { num: 2, title: "Marca os cantos da quadra", desc: "Clica uma vez em cada canto no primeiro frame. A IA usa esse referencial para normalizar todos os ângulos." },
  { num: 3, title: "Recebe os resultados", desc: "Em minutos tens estatísticas, heatmaps e replay interativo. Exporta em PDF para partilhar com o treinador." },
];

const PLANS = [
  {
    tier: "Free",
    price: "€0",
    desc: "Para experimentar e perceber o valor da analítica automática.",
    features: ["2 vídeos por mês", "Heatmaps básicos", "Estatísticas de deteção"],
    missing: ["Replay interativo", "Exportação PDF"],
    cta: "Começar grátis",
    href: "/auth/register",
    featured: false,
  },
  {
    tier: "Pro",
    price: "€29",
    desc: "Para jogadores e treinadores exigentes com a sua performance.",
    features: ["8 vídeos por mês", "Heatmaps completos", "Estatísticas avançadas", "Replay frame-a-frame", "Exportação PDF"],
    missing: [],
    cta: "Começar agora",
    href: "/auth/register",
    featured: true,
  },
  {
    tier: "Club",
    price: "€99",
    desc: "Para clubes e treinadores com múltiplos jogadores e equipas.",
    features: ["20 vídeos por mês", "Tudo do plano Pro", "Dashboard multi-jogador", "Câmaras instaladas no clube", "Suporte dedicado"],
    missing: [],
    cta: "Falar com a equipa",
    href: "/auth/register",
    featured: false,
  },
];

function CheckIcon() {
  return (
    <div style={{ width: 18, height: 18, borderRadius: "50%", background: "var(--green-bg)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--green-l)" strokeWidth={3}><polyline points="20 6 9 17 4 12" /></svg>
    </div>
  );
}

export default function LandingPage() {
  const ballHeatmapRef = useRef<HTMLCanvasElement>(null);
  const playerHeatmapRef = useRef<HTMLCanvasElement>(null);
  const howCanvasRef = useRef<HTMLCanvasElement>(null);
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    const ball = ballHeatmapRef.current;
    if (ball) {
      const ctx = ball.getContext("2d")!;
      const W = ball.width, H = ball.height;
      ctx.fillStyle = "#052e16";
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = "rgba(34,197,94,0.3)";
      ctx.lineWidth = 1;
      ctx.strokeRect(20, 10, W - 40, H - 20);
      ctx.beginPath(); ctx.moveTo(W / 2, 10); ctx.lineTo(W / 2, H - 10); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(20, H / 2); ctx.lineTo(W - 20, H / 2); ctx.stroke();
      [[150,90,0.8],[160,95,0.7],[140,80,0.6],[170,100,0.5],[155,88,0.9],[100,60,0.4],[200,110,0.3],[120,70,0.6],[180,100,0.5],[145,85,0.8]].forEach(([x,y,a]) => {
        const g = ctx.createRadialGradient(x,y,0,x,y,22);
        g.addColorStop(0, `rgba(234,179,8,${a})`);
        g.addColorStop(1, "transparent");
        ctx.fillStyle = g;
        ctx.fillRect(x-22, y-22, 44, 44);
      });
    }

    const players = playerHeatmapRef.current;
    if (players) {
      const ctx = players.getContext("2d")!;
      const W = players.width, H = players.height;
      ctx.fillStyle = "#0a0f1e";
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = "rgba(148,163,184,0.15)";
      ctx.lineWidth = 1;
      ctx.strokeRect(20, 10, W - 40, H - 20);
      ctx.beginPath(); ctx.moveTo(W / 2, 10); ctx.lineTo(W / 2, H - 10); ctx.stroke();
      const zones = [
        { pts:[[75,55],[85,65],[70,60],[90,58],[78,68]], color:"59,130,246" },
        { pts:[[215,55],[225,65],[210,60],[230,58],[218,68]], color:"249,115,22" },
        { pts:[[75,115],[85,125],[70,120],[90,118],[78,128]], color:"168,85,247" },
        { pts:[[215,115],[225,125],[210,120],[230,118],[218,128]], color:"34,197,94" },
      ];
      zones.forEach(({ pts, color }) => {
        pts.forEach(([px,py]) => {
          const g = ctx.createRadialGradient(px,py,0,px,py,28);
          g.addColorStop(0, `rgba(${color},0.6)`);
          g.addColorStop(1, "transparent");
          ctx.fillStyle = g;
          ctx.fillRect(px-28, py-28, 56, 56);
        });
      });
    }

    const how = howCanvasRef.current;
    if (how) {
      const ctx = how.getContext("2d")!;
      const W = how.width, H = how.height;
      ctx.fillStyle = "#0a0f1e";
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = "rgba(34,197,94,0.4)";
      ctx.lineWidth = 2;
      ctx.strokeRect(40, 30, W - 80, H - 60);
      ctx.beginPath(); ctx.moveTo(W/2, 30); ctx.lineTo(W/2, H-30); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(40, H/2); ctx.lineTo(W-40, H/2); ctx.stroke();
      [{ x:120,y:100,col:"#3b82f6",lbl:"J1" },{ x:350,y:100,col:"#f97316",lbl:"J2" },{ x:120,y:250,col:"#a855f7",lbl:"J3" },{ x:350,y:250,col:"#22c55e",lbl:"J4" }].forEach(p => {
        ctx.beginPath(); ctx.arc(p.x, p.y, 14, 0, Math.PI*2); ctx.fillStyle = p.col+"33"; ctx.fill();
        ctx.beginPath(); ctx.arc(p.x, p.y, 8, 0, Math.PI*2); ctx.fillStyle = p.col; ctx.fill();
        ctx.fillStyle = "#fff"; ctx.font = 'bold 9px "Space Grotesk", sans-serif';
        ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(p.lbl, p.x, p.y);
      });
      [[240,180],[245,165],[248,150],[242,138],[235,130]].forEach(([x,y],i,arr) => {
        ctx.beginPath(); ctx.arc(x,y,4*(i+1)/arr.length+1,0,Math.PI*2);
        ctx.fillStyle = `rgba(234,179,8,${(i+1)/arr.length*0.8})`; ctx.fill();
      });
    }
  }, []);

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>

      {/* NAV */}
      <nav className="bv-nav">
        <div className="bv-container bv-nav-inner">
          <Link href="/landing" className="bv-nav-logo">
            <div className="bv-nav-logo-dot" />
            BT Vision
          </Link>
          <div className="bv-nav-links">
            <a href="#features" className="bv-nav-link">Funcionalidades</a>
            <a href="#pricing" className="bv-nav-link">Preços</a>
          </div>
          <div className="bv-nav-actions">
            <Link href="/auth/login" className="bv-btn bv-btn-ghost bv-btn-sm">Entrar</Link>
            <Link href="/auth/register" className="bv-btn bv-btn-green bv-btn-sm">Começar grátis</Link>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <section style={{ minHeight: "calc(100vh - 60px)", display: "flex", flexDirection: "column", justifyContent: "center", position: "relative", overflow: "hidden", padding: "80px 0 60px" }}>
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none", background: "radial-gradient(ellipse 70% 60% at 65% 50%, rgba(22,163,74,0.06) 0%, transparent 60%), radial-gradient(ellipse 40% 50% at 20% 80%, rgba(37,99,235,0.04) 0%, transparent 50%)" }} />
        <div className="bv-container">
          <div className="bv-grid-hero" style={{ gap: 64, alignItems: "center" }}>
            <div>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "var(--green-bg)", border: "1px solid var(--green-dim)", borderRadius: 100, padding: "6px 14px", marginBottom: 28, fontFamily: "var(--f-head)", fontSize: 13, fontWeight: 600, color: "var(--green-l)", letterSpacing: "0.04em" }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--green-l)" }} />
                Lançamento em Portugal · 2026
              </div>
              <h1 style={{ fontSize: "clamp(36px, 4vw, 54px)", fontWeight: 700, marginBottom: 20 }}>
                Analisa cada rally.<br /><em style={{ fontStyle: "normal", color: "var(--green-l)" }}>Melhora cada ponto.</em>
              </h1>
              <p style={{ fontSize: 18, color: "var(--text-muted)", lineHeight: 1.65, marginBottom: 36, maxWidth: 480, fontWeight: 300 }}>
                Carrega o vídeo do treino ou jogo. A IA deteta jogadores, bola e posicionamento — e entrega estatísticas, heatmaps e replay em minutos.
              </p>
              <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                <Link href="/auth/register" className="bv-btn bv-btn-green bv-btn-green-lg">Começar grátis</Link>
                <a href="#features" className="bv-btn bv-btn-ghost bv-btn-green-lg">Ver funcionalidades</a>
              </div>
              <div style={{ marginTop: 32, fontSize: 13, color: "var(--text-dim)", display: "flex", alignItems: "center", gap: 8 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
                Sem cartão de crédito
                <div style={{ width: 4, height: 4, borderRadius: "50%", background: "var(--text-dim)" }} />
                2 análises grátis por mês
                <div style={{ width: 4, height: 4, borderRadius: "50%", background: "var(--text-dim)" }} />
                Resultados em minutos
              </div>
            </div>

            {/* MOCKUP */}
            <div style={{ background: "var(--surface)", border: "1px solid var(--border-2)", borderRadius: 20, overflow: "hidden", boxShadow: "0 0 0 1px rgba(255,255,255,0.04), 0 40px 80px rgba(0,0,0,0.6), 0 0 60px rgba(22,163,74,0.08)", aspectRatio: "16/10" }}>
              <div style={{ height: 38, background: "var(--surface-2)", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10, padding: "0 16px" }}>
                {["#ef4444","#f59e0b","#22c55e"].map((c,i) => <div key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: c }} />)}
                <div style={{ flex: 1, background: "var(--surface-3)", borderRadius: 4, height: 18, marginLeft: 8, opacity: 0.3 }} />
              </div>
              <div style={{ padding: 16, height: "calc(100% - 38px)", display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8 }}>
                  {[["94%","Bola detetada"],["100%","Jogadores"],["87%","Frames úteis"],["28:14","Duração"]].map(([v,l]) => (
                    <div key={l} style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 12px" }}>
                      <div style={{ fontFamily: "var(--f-head)", fontSize: 22, fontWeight: 700, color: "var(--green-l)", letterSpacing: "-0.02em" }}>{v}</div>
                      <div style={{ fontSize: 10, color: "var(--text-dim)", fontFamily: "var(--f-head)", marginTop: 2 }}>{l}</div>
                    </div>
                  ))}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, flex: 1 }}>
                  <div style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden", position: "relative" }}>
                    <div style={{ position: "absolute", top: 8, left: 10, fontFamily: "var(--f-head)", fontSize: 9, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-dim)" }}>Heatmap bola</div>
                    <canvas ref={ballHeatmapRef} width={300} height={180} style={{ width: "100%", height: "100%", display: "block" }} />
                  </div>
                  <div style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden", position: "relative" }}>
                    <div style={{ position: "absolute", top: 8, left: 10, fontFamily: "var(--f-head)", fontSize: 9, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-dim)" }}>Posicionamento</div>
                    <canvas ref={playerHeatmapRef} width={300} height={180} style={{ width: "100%", height: "100%", display: "block" }} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* LOGOS STRIP */}
      <div style={{ borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)", padding: "20px 0", background: "var(--surface)" }}>
        <div className="bv-container" style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "space-between", flexWrap: "wrap" }}>
          <div style={{ fontSize: 12, color: "var(--text-dim)", fontFamily: "var(--f-head)", fontWeight: 500, letterSpacing: "0.06em", textTransform: "uppercase", whiteSpace: "nowrap" }}>Utilizado por clubes de</div>
          <div style={{ display: "flex", alignItems: "center", gap: 32, flexWrap: "wrap" }}>
            {["Clube BT Lisboa","Arena Beach Sports","BT Cascais","Oeiras Beach Club","Setúbal BT"].map(n => (
              <div key={n} style={{ fontFamily: "var(--f-head)", fontSize: 14, fontWeight: 600, color: "var(--surface-3)", letterSpacing: "-0.01em" }}>{n}</div>
            ))}
          </div>
        </div>
      </div>

      {/* FEATURES */}
      <section id="features" style={{ padding: "100px 0" }}>
        <div className="bv-container">
          <div style={{ fontFamily: "var(--f-head)", fontSize: 13, fontWeight: 600, color: "var(--green)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>Funcionalidades</div>
          <h2 style={{ fontSize: "clamp(28px, 3vw, 42px)", fontWeight: 700, marginBottom: 16, maxWidth: 540 }}>Análise automática. Sem operador.</h2>
          <p style={{ fontSize: 17, color: "var(--text-muted)", maxWidth: 520, lineHeight: 1.65, marginBottom: 56, fontWeight: 300 }}>
            Tudo o que precisas para analisar uma partida — entregue automaticamente após o upload do vídeo.
          </p>
          <div className="bv-grid-3" style={{ gap: 24 }}>
            {FEATURES.map(f => (
              <div key={f.title} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: "32px 28px", display: "flex", flexDirection: "column", gap: 16, transition: "border-color 0.2s, transform 0.2s" }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border-2)"; (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLElement).style.transform = ""; }}>
                <div style={{ width: 48, height: 48, borderRadius: 12, background: "var(--green-bg)", border: "1px solid var(--green-dim)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {f.icon}
                </div>
                <div style={{ fontFamily: "var(--f-head)", fontSize: 18, fontWeight: 600, letterSpacing: "-0.01em" }}>{f.title}</div>
                <div style={{ fontSize: 14, color: "var(--text-muted)", lineHeight: 1.65, fontWeight: 300 }}>{f.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section style={{ padding: "0 0 100px" }}>
        <div className="bv-container">
          <div style={{ fontFamily: "var(--f-head)", fontSize: 13, fontWeight: 600, color: "var(--green)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>Como funciona</div>
          <h2 style={{ fontSize: "clamp(28px, 3vw, 42px)", fontWeight: 700, marginBottom: 0 }}>Três passos. Nenhuma configuração.</h2>
          <div className="bv-grid-2" style={{ gap: 80, alignItems: "center", marginTop: 56 }}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {HOW_STEPS.map((s, i) => (
                <div key={s.num} onClick={() => setActiveStep(i)}
                  style={{ display: "flex", gap: 20, padding: "24px 0", borderBottom: i < HOW_STEPS.length - 1 ? "1px solid var(--border)" : "none", cursor: "pointer" }}>
                  <div style={{ width: 36, height: 36, borderRadius: "50%", flexShrink: 0, background: activeStep === i ? "var(--green)" : "var(--surface-2)", border: `1px solid ${activeStep === i ? "var(--green)" : "var(--border-2)"}`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--f-head)", fontSize: 14, fontWeight: 700, color: activeStep === i ? "#fff" : "var(--text-dim)", boxShadow: activeStep === i ? "0 0 12px rgba(22,163,74,0.4)" : "none", transition: "all 0.2s" }}>
                    {s.num}
                  </div>
                  <div style={{ paddingTop: 4 }}>
                    <h3 style={{ fontFamily: "var(--f-head)", fontSize: 16, fontWeight: 600, marginBottom: 4, color: activeStep === i ? "var(--text)" : "var(--text-muted)", transition: "color 0.2s" }}>{s.title}</h3>
                    <p style={{ fontSize: 14, color: "var(--text-dim)", lineHeight: 1.6 }}>{s.desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ background: "var(--surface)", border: "1px solid var(--border-2)", borderRadius: "var(--radius-lg)", aspectRatio: "4/3", overflow: "hidden" }}>
              <canvas ref={howCanvasRef} width={480} height={360} style={{ width: "100%", height: "100%", display: "block" }} />
            </div>
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section id="pricing" style={{ padding: "0 0 100px" }}>
        <div className="bv-container">
          <div style={{ fontFamily: "var(--f-head)", fontSize: 13, fontWeight: 600, color: "var(--green)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>Planos</div>
          <h2 style={{ fontSize: "clamp(28px, 3vw, 42px)", fontWeight: 700, marginBottom: 16 }}>Simples. Sem surpresas.</h2>
          <p style={{ fontSize: 17, color: "var(--text-muted)", marginBottom: 0, fontWeight: 300 }}>Começa grátis. Escala conforme precisas.</p>
          <div className="bv-grid-3" style={{ gap: 24, marginTop: 56, alignItems: "start" }}>
            {PLANS.map(p => (
              <div key={p.tier} style={{ background: "var(--surface)", border: `1px solid ${p.featured ? "var(--green)" : "var(--border)"}`, borderRadius: "var(--radius-lg)", padding: "32px 28px", display: "flex", flexDirection: "column", gap: 24, position: "relative", boxShadow: p.featured ? "0 0 0 1px var(--green), 0 20px 60px rgba(22,163,74,0.1)" : "none" }}>
                {p.featured && <div style={{ position: "absolute", top: -14, left: "50%", transform: "translateX(-50%)", background: "var(--green)", color: "#fff", fontFamily: "var(--f-head)", fontSize: 12, fontWeight: 600, padding: "4px 14px", borderRadius: 100, letterSpacing: "0.04em", whiteSpace: "nowrap" }}>Mais popular</div>}
                <div style={{ fontFamily: "var(--f-head)", fontSize: 13, fontWeight: 600, color: p.featured ? "var(--green)" : "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.1em" }}>{p.tier}</div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                  <div style={{ fontFamily: "var(--f-head)", fontSize: 48, fontWeight: 700, letterSpacing: "-0.04em" }}>{p.price}</div>
                  <div style={{ fontSize: 14, color: "var(--text-dim)" }}>/mês</div>
                </div>
                <div style={{ fontSize: 14, color: "var(--text-muted)", lineHeight: 1.55, fontWeight: 300 }}>{p.desc}</div>
                <hr style={{ border: "none", borderTop: "1px solid var(--border)" }} />
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {p.features.map(f => (
                    <div key={f} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, color: "var(--text-muted)" }}>
                      <CheckIcon />{f}
                    </div>
                  ))}
                  {p.missing.map(f => (
                    <div key={f} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, color: "var(--text-dim)" }}>
                      <div style={{ width: 18, height: 18, borderRadius: "50%", background: "var(--surface-2)", flexShrink: 0 }} />{f}
                    </div>
                  ))}
                </div>
                <Link href={p.href} className={`bv-btn ${p.featured ? "bv-btn-green" : "bv-btn-ghost"}`} style={{ width: "100%", justifyContent: "center" }}>{p.cta}</Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA BANNER */}
      <div className="bv-container" style={{ marginBottom: 100 }}>
        <div style={{ background: "var(--surface)", border: "1px solid var(--border-2)", borderRadius: 24, padding: "64px 48px", display: "flex", alignItems: "center", gap: 48, position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 60% 100% at 80% 50%, rgba(22,163,74,0.07) 0%, transparent 60%)", pointerEvents: "none" }} />
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: 32, fontWeight: 700, marginBottom: 10 }}>Pronto para analisar a tua próxima partida?</h2>
            <p style={{ fontSize: 16, color: "var(--text-muted)", fontWeight: 300 }}>Começa grátis. Sem cartão de crédito. Resultados em minutos.</p>
          </div>
          <Link href="/auth/register" className="bv-btn bv-btn-green bv-btn-green-lg" style={{ flexShrink: 0 }}>Criar conta grátis</Link>
        </div>
      </div>

      {/* FOOTER */}
      <footer className="bv-footer">
        <div className="bv-container" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 24 }}>
          <Link href="/landing" className="bv-nav-logo" style={{ fontSize: 16 }}>
            <div className="bv-nav-logo-dot" />
            BT Vision
          </Link>
          <div style={{ fontSize: 13, color: "var(--text-dim)" }}>© 2026 BT Vision. Todos os direitos reservados.</div>
          <div style={{ display: "flex", gap: 24 }}>
            {["Privacidade","Termos","Contacto"].map(l => (
              <a key={l} href="#" style={{ fontSize: 13, color: "var(--text-dim)", transition: "color 0.15s" }}
                onMouseEnter={e => (e.currentTarget.style.color = "var(--text-muted)")}
                onMouseLeave={e => (e.currentTarget.style.color = "var(--text-dim)")}>{l}</a>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}
