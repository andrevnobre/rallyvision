"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";

type Profile = "jogador" | "coach" | "clube";

// ── Palette (canvas não lê CSS vars) ─────────────────────────────────────────
const C = {
  green:    "#16a34a",
  greenL:   "#22c55e",
  greenDim: "#14532d",
  blue:     "#3b82f6",
  amber:    "#f59e0b",
  court:    "#0c2318",
  courtLine:"#166534",
  surface:  "#1e293b",
  border:   "#334155",
  text:     "#f1f5f9",
  textDim:  "#64748b",
};

// ── Canvas: trajetória da bola ────────────────────────────────────────────────
function BallTrajectoryCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current; if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const W = canvas.width, H = canvas.height;
    const cx = W * 0.05, cy = H * 0.1, cw = W * 0.9, ch = H * 0.8;

    const paths: [number,number,number,number,number,number][] = [
      [0.1,0.5, 0.4,0.08, 0.88,0.45],
      [0.88,0.45, 0.55,0.88, 0.12,0.65],
      [0.12,0.65, 0.5,0.2,  0.85,0.3],
      [0.85,0.3,  0.4,0.75, 0.1,0.5],
    ];
    let pi = 0, t = 0;
    const trail: {x:number,y:number,age:number}[] = [];
    let af: number;

    const bz = (t:number,p0:number,cp:number,p1:number) =>
      (1-t)*(1-t)*p0 + 2*(1-t)*t*cp + t*t*p1;

    function draw() {
      ctx.clearRect(0,0,W,H);
      // court
      ctx.fillStyle = C.court; ctx.fillRect(cx,cy,cw,ch);
      ctx.strokeStyle = C.courtLine; ctx.lineWidth = 1.5;
      ctx.strokeRect(cx,cy,cw,ch);
      ctx.beginPath(); ctx.moveTo(cx+cw/2,cy); ctx.lineTo(cx+cw/2,cy+ch); ctx.stroke();
      ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(cx,cy+ch/2); ctx.lineTo(cx+cw,cy+ch/2); ctx.stroke();

      const [x0,y0,cpx,cpy,x1,y1] = paths[pi];
      const bx = cx + bz(t,x0,cpx,x1)*cw;
      const by = cy + bz(t,y0,cpy,y1)*ch;

      // trail
      trail.forEach(p => {
        const a = Math.max(0, (1 - p.age/22)*0.55);
        ctx.beginPath(); ctx.arc(p.x,p.y, 3*(1-p.age/22),0,Math.PI*2);
        ctx.fillStyle = `rgba(34,197,94,${a})`; ctx.fill();
        p.age++;
      });

      // players
      [{ x:0.18,y:0.28,c:C.blue },{ x:0.18,y:0.72,c:C.blue },
       { x:0.82,y:0.28,c:C.amber },{ x:0.82,y:0.72,c:C.amber }]
      .forEach(p => {
        ctx.beginPath(); ctx.arc(cx+p.x*cw, cy+p.y*ch, 7,0,Math.PI*2);
        ctx.fillStyle = p.c; ctx.fill();
      });

      // ball glow
      ctx.shadowBlur = 10; ctx.shadowColor = C.greenL;
      ctx.beginPath(); ctx.arc(bx,by,5,0,Math.PI*2);
      ctx.fillStyle = C.greenL; ctx.fill();
      ctx.shadowBlur = 0;

      trail.push({x:bx,y:by,age:0});
      if (trail.length > 22) trail.shift();
      t += 0.013;
      if (t >= 1) { t = 0; trail.length = 0; pi = (pi+1)%paths.length; }
      af = requestAnimationFrame(draw);
    }
    draw();
    return () => cancelAnimationFrame(af);
  }, []);
  return <canvas ref={ref} width={420} height={260} style={{ width:"100%", maxWidth:420, borderRadius:12, display:"block" }} />;
}

// ── Canvas: heatmap de posicionamento ─────────────────────────────────────────
function HeatmapCanvas({ spots }: { spots: {x:number,y:number,r:number,a:number}[] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current; if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const W = canvas.width, H = canvas.height;
    const cx = W*0.05, cy = H*0.1, cw = W*0.9, ch = H*0.8;
    let frame = 0, af: number;

    function draw() {
      ctx.clearRect(0,0,W,H);
      ctx.fillStyle = C.court; ctx.fillRect(cx,cy,cw,ch);

      // heatmap blobs
      spots.forEach(s => {
        const pulse = 0.7 + 0.3 * Math.sin(frame * 0.02 + s.r);
        const grd = ctx.createRadialGradient(
          cx+s.x*cw, cy+s.y*ch, 0,
          cx+s.x*cw, cy+s.y*ch, s.r*cw
        );
        grd.addColorStop(0, `rgba(22,163,74,${s.a*pulse})`);
        grd.addColorStop(1, "rgba(22,163,74,0)");
        ctx.fillStyle = grd;
        ctx.fillRect(cx,cy,cw,ch);
      });

      ctx.strokeStyle = C.courtLine; ctx.lineWidth = 1.5;
      ctx.strokeRect(cx,cy,cw,ch);
      ctx.beginPath(); ctx.moveTo(cx+cw/2,cy); ctx.lineTo(cx+cw/2,cy+ch); ctx.stroke();
      ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(cx,cy+ch/2); ctx.lineTo(cx+cw,cy+ch/2); ctx.stroke();

      frame++;
      af = requestAnimationFrame(draw);
    }
    draw();
    return () => cancelAnimationFrame(af);
  }, [spots]);
  return <canvas ref={ref} width={420} height={260} style={{ width:"100%", maxWidth:420, borderRadius:12, display:"block" }} />;
}

// ── Canvas: gráfico de evolução ───────────────────────────────────────────────
function EvolutionChartCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current; if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const W = canvas.width, H = canvas.height;
    const pad = { t:20, r:20, b:40, l:40 };
    const cw = W-pad.l-pad.r, ch = H-pad.t-pad.b;

    const series = [
      { label:"Detecção de bola", color:C.green,  data:[42,55,61,70,74,82,87] },
      { label:"Posicionamento",   color:C.blue,   data:[60,63,68,72,75,78,80] },
    ];
    const labels = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul"];
    const maxV = 100;

    let prog = 0, af: number;

    function draw() {
      ctx.clearRect(0,0,W,H);
      // grid
      ctx.strokeStyle = C.border; ctx.lineWidth = 0.5;
      [0,25,50,75,100].forEach(v => {
        const y = pad.t + ch*(1 - v/maxV);
        ctx.beginPath(); ctx.moveTo(pad.l,y); ctx.lineTo(pad.l+cw,y); ctx.stroke();
        ctx.fillStyle = C.textDim; ctx.font = "10px sans-serif"; ctx.textAlign = "right";
        ctx.fillText(String(v), pad.l-4, y+3);
      });

      // x labels
      ctx.textAlign = "center"; ctx.fillStyle = C.textDim; ctx.font = "10px sans-serif";
      labels.forEach((l,i) => {
        const x = pad.l + (i/(labels.length-1))*cw;
        ctx.fillText(l, x, H-8);
      });

      // lines
      const pts = Math.min(series[0].data.length, 1 + Math.floor(prog));
      series.forEach(s => {
        ctx.beginPath();
        ctx.strokeStyle = s.color; ctx.lineWidth = 2.5;
        s.data.slice(0, pts).forEach((v,i) => {
          const x = pad.l + (i/(labels.length-1))*cw;
          const y = pad.t + ch*(1 - v/maxV);
          i === 0 ? ctx.moveTo(x,y) : ctx.lineTo(x,y);
        });
        ctx.stroke();

        // dots
        s.data.slice(0, pts).forEach((v,i) => {
          const x = pad.l + (i/(labels.length-1))*cw;
          const y = pad.t + ch*(1 - v/maxV);
          ctx.beginPath(); ctx.arc(x,y,4,0,Math.PI*2);
          ctx.fillStyle = s.color; ctx.fill();
        });
      });

      if (prog < series[0].data.length - 1) { prog += 0.06; af = requestAnimationFrame(draw); }
      else {
        // legend
        series.forEach((s,i) => {
          const lx = pad.l + i*140, ly = H - pad.b + 26;
          ctx.beginPath(); ctx.arc(lx+6,ly,5,0,Math.PI*2);
          ctx.fillStyle = s.color; ctx.fill();
          ctx.fillStyle = C.textDim; ctx.font = "11px sans-serif"; ctx.textAlign = "left";
          ctx.fillText(s.label, lx+14, ly+4);
        });
      }
    }
    draw();
    return () => cancelAnimationFrame(af);
  }, []);
  return <canvas ref={ref} width={420} height={220} style={{ width:"100%", maxWidth:420, borderRadius:12, display:"block" }} />;
}

// ── Mockup CSS: dashboard multi-jogador ──────────────────────────────────────
function MultiPlayerMockup() {
  const players = [
    { name:"João Silva",  pct:87, rallies:14, trend:"+5%" },
    { name:"Ana Costa",   pct:79, rallies:11, trend:"+2%" },
    { name:"Rui Mendes",  pct:82, rallies:13, trend:"+8%" },
    { name:"Lara Pinto",  pct:71, rallies: 9, trend:"+1%" },
  ];
  return (
    <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:12, overflow:"hidden", maxWidth:420, width:"100%" }}>
      <div style={{ padding:"10px 16px", borderBottom:`1px solid ${C.border}`, display:"flex", justifyContent:"space-between", fontSize:12, color:C.textDim }}>
        <span>Jogador</span><span>Detecção bola</span><span>Rallies</span><span>Evolução</span>
      </div>
      {players.map((p,i) => (
        <div key={p.name} style={{ padding:"10px 16px", borderBottom: i < players.length-1 ? `1px solid ${C.border}` : "none", display:"flex", justifyContent:"space-between", alignItems:"center", fontSize:13 }}>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <div style={{ width:28, height:28, borderRadius:"50%", background:C.greenDim, display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:700, color:C.greenL }}>
              {p.name.split(" ").map(w=>w[0]).join("")}
            </div>
            <span style={{ color:C.text, fontWeight:500 }}>{p.name}</span>
          </div>
          <span style={{ color:C.greenL, fontFamily:"monospace" }}>{p.pct}%</span>
          <span style={{ color:C.textDim }}>{p.rallies}</span>
          <span style={{ color:C.green, fontSize:12 }}>{p.trend}</span>
        </div>
      ))}
    </div>
  );
}

// ── Mockup CSS: pipeline de upload ───────────────────────────────────────────
function PipelineMockup() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setStep(s => (s+1)%5), 1200);
    return () => clearInterval(id);
  }, []);
  const steps = [
    { icon:"📷", label:"Câmera grava" },
    { icon:"☁️", label:"Upload automático" },
    { icon:"⚙️", label:"Análise IA" },
    { icon:"📊", label:"Relatório pronto" },
  ];
  return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:0, flexWrap:"wrap", maxWidth:420 }}>
      {steps.map((s,i) => (
        <div key={s.label} style={{ display:"flex", alignItems:"center" }}>
          <div style={{
            display:"flex", flexDirection:"column", alignItems:"center", gap:6, padding:"14px 16px",
            background: i <= step ? C.greenDim : C.surface,
            border:`1px solid ${i <= step ? C.green : C.border}`,
            borderRadius:10, transition:"all 0.4s", minWidth:80,
          }}>
            <span style={{ fontSize:22 }}>{s.icon}</span>
            <span style={{ fontSize:11, color: i <= step ? C.greenL : C.textDim, textAlign:"center", lineHeight:1.3 }}>{s.label}</span>
          </div>
          {i < steps.length-1 && (
            <div style={{ width:20, height:2, background: i < step ? C.green : C.border, transition:"background 0.4s", flexShrink:0 }} />
          )}
        </div>
      ))}
    </div>
  );
}

// ── Mockup CSS: revenue do clube ─────────────────────────────────────────────
function RevenueMockup() {
  return (
    <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:12, padding:"24px 28px", maxWidth:380 }}>
      <div style={{ fontSize:12, color:C.textDim, marginBottom:16, textTransform:"uppercase", letterSpacing:"0.08em" }}>Exemplo de economics</div>
      {[
        { label:"Sócios com acesso analytics", val:"20 jogadores" },
        { label:"Preço ao sócio", val:"€5/mês" },
        { label:"Receita bruta do clube", val:"€100/mês" },
        { label:"Custo do plano Club", val:"€99/mês" },
      ].map((r,i) => (
        <div key={r.label} style={{ display:"flex", justifyContent:"space-between", padding:"10px 0", borderBottom: i < 3 ? `1px solid ${C.border}` : "none", fontSize:13 }}>
          <span style={{ color:C.textDim }}>{r.label}</span>
          <span style={{ color:C.text, fontWeight:600 }}>{r.val}</span>
        </div>
      ))}
      <div style={{ marginTop:16, padding:"12px 16px", background:C.greenDim, borderRadius:8, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <span style={{ color:C.greenL, fontWeight:600, fontSize:14 }}>Margem do clube</span>
        <span style={{ color:C.greenL, fontWeight:700, fontSize:18 }}>€1/mês*</span>
      </div>
      <div style={{ fontSize:11, color:C.textDim, marginTop:8 }}>* Custos cobertos. Com mais sócios, a margem cresce.</div>
    </div>
  );
}

// ── Mockup CSS: upload + stats ────────────────────────────────────────────────
function UploadStatsMockup() {
  const [pct, setPct] = useState(0);
  const [show, setShow] = useState(false);
  useEffect(() => {
    let p = 0;
    const id = setInterval(() => {
      p += 3;
      setPct(Math.min(p, 100));
      if (p >= 100) { clearInterval(id); setTimeout(() => { setShow(true); setTimeout(() => { setPct(0); setShow(false); }, 3000); }, 500); }
    }, 60);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (!show) return;
    const id = setTimeout(() => { setPct(0); setShow(false); }, 5000);
    return () => clearTimeout(id);
  }, [show]);

  return (
    <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:12, padding:"24px", maxWidth:380, width:"100%" }}>
      {!show ? (
        <>
          <div style={{ fontSize:13, color:C.textDim, marginBottom:12 }}>
            {pct < 100 ? `A enviar vídeo… ${pct}%` : "A processar pipeline de IA…"}
          </div>
          <div style={{ height:6, background:C.border, borderRadius:3, overflow:"hidden" }}>
            <div style={{ height:"100%", width:`${pct}%`, background:C.green, borderRadius:3, transition:"width 0.1s" }} />
          </div>
          <div style={{ marginTop:12, fontSize:12, color:C.textDim }}>
            {pct < 100 ? "Carregamento multipart seguro" : "Detecção de bola · Heatmaps · Rallies"}
          </div>
        </>
      ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
          <div style={{ fontSize:13, color:C.greenL, fontWeight:600, marginBottom:4 }}>✓ Análise concluída</div>
          {[
            { label:"Detecção de bola", val:"87%", color:C.greenL },
            { label:"Rallies detectados", val:"14",  color:C.text },
            { label:"Duração média rally", val:"4.2s",color:C.text },
            { label:"Tempo de processamento", val:"3min", color:C.textDim },
          ].map(s => (
            <div key={s.label} style={{ display:"flex", justifyContent:"space-between", fontSize:13 }}>
              <span style={{ color:C.textDim }}>{s.label}</span>
              <span style={{ color:s.color, fontWeight:600 }}>{s.val}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Badge atual / em breve ────────────────────────────────────────────────────
function Badge({ type }: { type: "now" | "soon" }) {
  return type === "now"
    ? <span style={{ display:"inline-flex", alignItems:"center", gap:5, fontSize:11, fontWeight:600, color:C.greenL, background:C.greenDim, border:`1px solid ${C.green}`, padding:"2px 10px", borderRadius:100, letterSpacing:"0.04em" }}>
        <span style={{ width:6, height:6, borderRadius:"50%", background:C.green, display:"inline-block" }} />
        Disponível agora
      </span>
    : <span style={{ display:"inline-flex", alignItems:"center", gap:5, fontSize:11, fontWeight:600, color:"#94a3b8", background:"#1e293b", border:"1px solid #334155", padding:"2px 10px", borderRadius:100, letterSpacing:"0.04em" }}>
        Em breve
      </span>;
}

// ── Bloco de feature ──────────────────────────────────────────────────────────
function Feature({
  badge, title, desc, bullets, visual, reverse = false,
}: {
  badge: "now" | "soon"; title: string; desc: string;
  bullets?: string[]; visual: React.ReactNode; reverse?: boolean;
}) {
  return (
    <div style={{
      display:"flex", flexDirection: reverse ? "row-reverse" : "row",
      gap:48, alignItems:"center", marginBottom:72,
    }}
      className="bv-feature-row"
    >
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ marginBottom:12 }}><Badge type={badge} /></div>
        <h3 style={{ fontFamily:"var(--f-head)", fontSize:"clamp(20px,2.5vw,26px)", fontWeight:700, letterSpacing:"-0.02em", marginBottom:12, lineHeight:1.2 }}>{title}</h3>
        <p style={{ fontSize:15, color:"var(--text-muted)", lineHeight:1.7, marginBottom: bullets ? 16 : 0, fontWeight:300 }}>{desc}</p>
        {bullets && (
          <ul style={{ margin:0, padding:0, listStyle:"none", display:"flex", flexDirection:"column", gap:8 }}>
            {bullets.map(b => (
              <li key={b} style={{ display:"flex", alignItems:"flex-start", gap:10, fontSize:14, color:"var(--text-dim)" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth={2.5} style={{ flexShrink:0, marginTop:2 }}><polyline points="20 6 9 17 4 12"/></svg>
                {b}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div style={{ flexShrink:0, width:"min(420px, 100%)" }}>
        {visual}
      </div>
    </div>
  );
}

// ── Secções por perfil ────────────────────────────────────────────────────────
const JOGADOR_SPOTS = [
  {x:0.2,y:0.35,r:0.28,a:0.7},{x:0.2,y:0.65,r:0.22,a:0.55},
  {x:0.35,y:0.5,r:0.15,a:0.4},{x:0.18,y:0.5,r:0.12,a:0.5},
];

function JogadorSection() {
  return (
    <div>
      <div style={{ marginBottom:56, paddingTop:8 }}>
        <div style={{ fontFamily:"var(--f-head)", fontSize:13, fontWeight:600, color:"var(--green)", letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:12 }}>Para jogadores</div>
        <h2 style={{ fontSize:"clamp(28px,3.5vw,44px)", fontWeight:700, letterSpacing:"-0.03em", lineHeight:1.1, marginBottom:16, maxWidth:600 }}>Vê o que os teus adversários não conseguem.</h2>
        <p style={{ fontSize:17, color:"var(--text-muted)", fontWeight:300, maxWidth:520 }}>Análise automática de cada partida. Heatmaps, trajectórias, rallies — tudo disponível minutos após o jogo.</p>
      </div>

      <Feature badge="now" title="Upload e análise automática"
        desc="Carrega o vídeo da tua partida e recebe análise completa em minutos. Sem software especial. Funciona a partir do browser, em qualquer dispositivo."
        bullets={["Formatos MP4, MOV, AVI e MKV até 2 GB","Pipeline de IA automático após upload","Resultados disponíveis sem espera activa"]}
        visual={<UploadStatsMockup />}
      />

      <Feature badge="now" reverse title="Mapa de posicionamento em quadra"
        desc="Descobre exactamente onde passas mais tempo durante um jogo. Identifica padrões que o teu coach não consegue ver ao vivo — e que os adversários não conhecem."
        bullets={["Heatmap normalizado para a quadra","Posicionamento separado por dupla","Comparação entre partidas (em breve)"]}
        visual={<HeatmapCanvas spots={JOGADOR_SPOTS} />}
      />

      <Feature badge="now" title="Trajetória e análise da bola"
        desc="Acompanha cada trajectória detectada. Percebe padrões de jogo: de onde sais, para onde atacas, onde perdes mais pontos."
        bullets={["Detecção automática com YOLOv8 fine-tuned","Percentagem de detecção por partida","Trajetórias sobrepostas no replay interactivo"]}
        visual={<BallTrajectoryCanvas />}
      />

      <Feature badge="soon" reverse title="Evolução entre partidas"
        desc="Acompanha a tua progressão ao longo da época. Vê se a detecção de bola melhorou, se o posicionamento ficou mais consistente, e onde ainda há margem de evolução."
        bullets={["Gráficos automáticos por métrica","Comparação com sessões anteriores","Exportação em PDF para o teu coach"]}
        visual={<EvolutionChartCanvas />}
      />
    </div>
  );
}

const COACH_SPOTS_L = [
  {x:0.18,y:0.35,r:0.25,a:0.65},{x:0.2,y:0.65,r:0.2,a:0.5},{x:0.3,y:0.5,r:0.12,a:0.35},
];
const COACH_SPOTS_R = [
  {x:0.7,y:0.4,r:0.22,a:0.6},{x:0.8,y:0.6,r:0.28,a:0.7},{x:0.65,y:0.55,r:0.14,a:0.4},
];

function CoachSection() {
  return (
    <div>
      <div style={{ marginBottom:56, paddingTop:8 }}>
        <div style={{ fontFamily:"var(--f-head)", fontSize:13, fontWeight:600, color:"var(--green)", letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:12 }}>Para coaches</div>
        <h2 style={{ fontSize:"clamp(28px,3.5vw,44px)", fontWeight:700, letterSpacing:"-0.03em", lineHeight:1.1, marginBottom:16, maxWidth:600 }}>Dados que transformam treinos.</h2>
        <p style={{ fontSize:17, color:"var(--text-muted)", fontWeight:300, maxWidth:520 }}>Analisa múltiplos jogadores, identifica padrões e dá feedback baseado em evidências — não em intuição.</p>
      </div>

      <Feature badge="now" title="Analisa cada jogador individualmente"
        desc="Cada jogador tem o seu perfil com todas as partidas analisadas. Acedes a heatmaps, percentagem de detecção de bola e contagem de rallies de forma individual, sem misturar dados."
        bullets={["Perfil separado por jogador","Histórico completo de partidas","Partilha de relatório por link privado"]}
        visual={<MultiPlayerMockup />}
      />

      <Feature badge="now" reverse title="Heatmaps comparativos"
        desc="Compara o posicionamento de dois jogadores lado a lado na mesma quadra normalizada. Identifica diferenças de padrão, zonas de conforto e áreas a trabalhar em treino."
        bullets={["Quadra normalizada independente da câmera","Posicionamento dos 4 jogadores em simultâneo","Visual intuitivo para mostrar ao atleta"]}
        visual={
          <div style={{ display:"flex", gap:8, alignItems:"center" }}>
            <div style={{ flex:1 }}><HeatmapCanvas spots={COACH_SPOTS_L} /></div>
            <div style={{ flex:1 }}><HeatmapCanvas spots={COACH_SPOTS_R} /></div>
          </div>
        }
      />

      <Feature badge="soon" title="Dashboard multi-aluno"
        desc="Vista consolidada de todos os teus alunos: últimas partidas, métricas-chave e tendências numa só página. Menos tempo a procurar dados, mais tempo a treinar."
        bullets={["Todos os jogadores numa tabela","Filtros por data, plano e progressão","Alertas automáticos de regressão"]}
        visual={<MultiPlayerMockup />}
      />

      <Feature badge="soon" reverse title="Acompanhamento da evolução"
        desc="Gráficos automáticos por atleta ao longo da época. Mostra ao jogador a progressão com dados concretos — a motivação cresce quando os números sobem."
        bullets={["Gráficos por sessão e por período","Exportação PDF para partilhar","Comparação com médias do grupo"]}
        visual={<EvolutionChartCanvas />}
      />
    </div>
  );
}

function ClubeSection() {
  return (
    <div>
      <div style={{ marginBottom:56, paddingTop:8 }}>
        <div style={{ fontFamily:"var(--f-head)", fontSize:13, fontWeight:600, color:"var(--green)", letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:12 }}>Para clubes</div>
        <h2 style={{ fontSize:"clamp(28px,3.5vw,44px)", fontWeight:700, letterSpacing:"-0.03em", lineHeight:1.1, marginBottom:16, maxWidth:620 }}>O clube que analisa é o clube que retém.</h2>
        <p style={{ fontSize:17, color:"var(--text-muted)", fontWeight:300, maxWidth:540 }}>Transforma o teu clube num espaço de alta performance. Oferece analytics como serviço adicional — e abre uma nova linha de receita.</p>
      </div>

      <Feature badge="now" title="Analytics disponível para todos os sócios"
        desc="Qualquer sócio pode carregar os vídeos das suas partidas e receber análise automática. O clube oferece como serviço diferenciador — sem infraestrutura técnica adicional para gerir."
        bullets={["Acesso multi-utilizador com perfis separados","Painel de administração para o clube","Relatórios partilháveis por link"]}
        visual={<MultiPlayerMockup />}
      />

      <Feature badge="soon" reverse title="Câmeras instaladas e upload automático"
        desc="Instalamos câmeras nas tuas quadras. Cada partida é gravada e analisada automaticamente — sem que nenhum sócio precise de fazer nada. O clube oferece o serviço de forma transparente."
        bullets={["Instalação e manutenção incluídas","Gravação contínua durante horário de funcionamento","Análise pronta nas primeiras horas"]}
        visual={<PipelineMockup />}
      />

      <Feature badge="soon" title="Nova linha de receita"
        desc="Cobra aos sócios pelo acesso aos relatórios de análise. Com 20 jogadores a €5/mês, o plano Club paga-se a si próprio — e ainda sobra margem para o clube."
        bullets={["Modelo de preços flexível por clube","Facturação gerida pela plataforma","Parceiros fundadores com 50% de desconto permanente"]}
        visual={<RevenueMockup />}
      />

      <Feature badge="soon" reverse title="Dashboard agregado do clube"
        desc="Vista global da actividade do clube: membros activos, partidas analisadas por semana, horas de jogo e métricas de utilização — tudo num único painel de controlo."
        bullets={["KPIs de utilização por quadra","Exportação de dados para relatório mensal","Integração futura com sistemas de gestão de clubes"]}
        visual={<MultiPlayerMockup />}
      />
    </div>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────
const PROFILES: { id: Profile; label: string; emoji: string }[] = [
  { id:"jogador", label:"Jogador",  emoji:"🎾" },
  { id:"coach",   label:"Coach",    emoji:"📋" },
  { id:"clube",   label:"Clube",    emoji:"🏟️" },
];

export default function TourPage() {
  const [profile, setProfile] = useState<Profile>("jogador");

  return (
    <div style={{ minHeight:"100vh", display:"flex", flexDirection:"column" }}>

      {/* NAV */}
      <nav className="bv-nav">
        <div className="bv-container bv-nav-inner">
          <Link href="/landing" className="bv-nav-logo">
            <div className="bv-nav-logo-dot" />BT Vision
          </Link>
          <div className="bv-nav-actions">
            <Link href="/auth/login" className="bv-btn bv-btn-ghost bv-btn-sm">Entrar</Link>
            <Link href="/auth/register" className="bv-btn bv-btn-green bv-btn-sm">Criar conta grátis</Link>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <section style={{ padding:"72px 0 56px", textAlign:"center" }}>
        <div className="bv-container">
          <div style={{ fontFamily:"var(--f-head)", fontSize:13, fontWeight:600, color:"var(--green)", letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:16 }}>
            BT Vision · Tour
          </div>
          <h1 style={{ fontSize:"clamp(36px,5vw,64px)", fontWeight:700, letterSpacing:"-0.03em", lineHeight:1.05, marginBottom:20, maxWidth:700, marginLeft:"auto", marginRight:"auto" }}>
            Analytics de beach tennis.<br />Para cada perfil.
          </h1>
          <p style={{ fontSize:18, color:"var(--text-muted)", fontWeight:300, maxWidth:480, margin:"0 auto 40px" }}>
            Descobre como o BT Vision transforma vídeos de partidas em dados accionáveis — para jogadores, coaches e clubes.
          </p>

          {/* Selector de perfil */}
          <div style={{ display:"inline-flex", gap:8, background:"var(--surface)", border:"1px solid var(--border-2)", borderRadius:100, padding:6 }}>
            {PROFILES.map(p => (
              <button
                key={p.id}
                onClick={() => setProfile(p.id)}
                style={{
                  padding:"10px 22px", borderRadius:100, border:"none", cursor:"pointer",
                  fontFamily:"var(--f-head)", fontSize:14, fontWeight:600,
                  background: profile === p.id ? "var(--green)" : "transparent",
                  color: profile === p.id ? "#fff" : "var(--text-dim)",
                  transition:"all 0.2s",
                  display:"flex", alignItems:"center", gap:7,
                }}
              >
                <span>{p.emoji}</span>{p.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* TABS STICKY */}
      <div style={{ position:"sticky", top:0, zIndex:20, background:"var(--bg)", borderBottom:"1px solid var(--border)", backdropFilter:"blur(12px)" }}>
        <div className="bv-container" style={{ display:"flex", gap:0 }}>
          {PROFILES.map(p => (
            <button
              key={p.id}
              onClick={() => setProfile(p.id)}
              style={{
                padding:"14px 24px", border:"none", background:"transparent", cursor:"pointer",
                fontFamily:"var(--f-head)", fontSize:14, fontWeight: profile===p.id ? 600 : 400,
                color: profile===p.id ? "var(--text)" : "var(--text-dim)",
                borderBottom: profile===p.id ? "2px solid var(--green)" : "2px solid transparent",
                transition:"all 0.2s", display:"flex", alignItems:"center", gap:7,
              }}
            >
              <span>{p.emoji}</span>{p.label}
            </button>
          ))}
        </div>
      </div>

      {/* CONTEÚDO DO PERFIL */}
      <main style={{ flex:1 }}>
        <div className="bv-container" style={{ padding:"64px 0 80px" }}>
          {profile === "jogador" && <JogadorSection />}
          {profile === "coach"   && <CoachSection />}
          {profile === "clube"   && <ClubeSection />}
        </div>
      </main>

      {/* CTA FINAL */}
      <section style={{ borderTop:"1px solid var(--border)", padding:"80px 0 100px" }}>
        <div className="bv-container" style={{ textAlign:"center" }}>
          <div style={{ fontFamily:"var(--f-head)", fontSize:13, fontWeight:600, color:"var(--green)", letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:12 }}>
            Acesso beta gratuito
          </div>
          <h2 style={{ fontSize:"clamp(28px,3.5vw,44px)", fontWeight:700, letterSpacing:"-0.03em", marginBottom:16, maxWidth:560, marginLeft:"auto", marginRight:"auto" }}>
            Pronto para ver a tua partida em dados?
          </h2>
          <p style={{ fontSize:16, color:"var(--text-muted)", fontWeight:300, marginBottom:36 }}>
            Cria conta agora e acede ao plano Pro gratuitamente.<br />Sem cartão de crédito. Sem compromisso.
          </p>
          <div style={{ display:"flex", gap:12, justifyContent:"center", flexWrap:"wrap" }}>
            <Link href="/auth/register" className="bv-btn bv-btn-green" style={{ padding:"14px 32px", fontSize:16 }}>
              Criar conta grátis
            </Link>
            <Link href="/landing" className="bv-btn bv-btn-ghost" style={{ padding:"14px 32px", fontSize:16 }}>
              Saber mais
            </Link>
          </div>
          <p style={{ fontSize:13, color:"var(--text-dim)", marginTop:20 }}>
            Plano Pro · Grátis durante o beta · Sem limites
          </p>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="bv-footer">
        <div className="bv-container bv-footer-row" style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:24 }}>
          <Link href="/landing" className="bv-nav-logo" style={{ fontSize:16 }}>
            <div className="bv-nav-logo-dot" />BT Vision
          </Link>
          <div style={{ fontSize:13, color:"var(--text-dim)" }}>© 2026 BT Vision</div>
          <Link href="/auth/register" style={{ fontSize:13, color:"var(--green-l)", textDecoration:"none" }}>
            Criar conta grátis →
          </Link>
        </div>
      </footer>

      <style>{`
        @media (max-width: 680px) {
          .bv-feature-row {
            flex-direction: column !important;
          }
        }
      `}</style>
    </div>
  );
}
