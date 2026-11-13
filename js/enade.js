/*
  enade.js: a página inicial do Simulado ENADE de ADS · versão 2 · 2026-11-13 (meia prova e painel animado)
  Contagem até a prova, login (conta.js das disciplinas, só @edu.df.senac.br), as áreas e as provas
  (do banco, pela função enade_catalogo), e o painel do aluno (as tentativas dele, tabela enade_tentativas).
  O simulado abre numa janela só para ele: simulado.html. SQL em Placa-Mae/supabase/enade-ads.sql.
*/
const ENADE_PROVA_DIA = new Date("2026-11-29T13:30:00-03:00");

(function () {
  // alunos entram com @edu.df.senac.br; a professora, com @df.senac.br (quem decide de verdade é o banco: enade_pode)
  const podeTreinar = () => Boolean(window.CONTA && CONTA.usuario() && /@(edu\.)?df\.senac\.br$/i.test(CONTA.usuario().email || ""));
  // o mesmo cliente do conta.js (dois clientes com o mesmo login guardado travam um ao outro)
  const nuvem = window.CONTA && CONTA.cliente ? CONTA.cliente() : null;
  const $ = (s) => document.querySelector(s);
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const pct = (a, t) => (t ? Math.round((100 * a) / t) : 0);
  const nivel = (p) => (p >= 70 ? ["forte", "forte"] : p >= 50 ? ["atencao", "atenção"] : ["reforco", "reforço"]);
  let meusPorArea = {};
  let minhasProvas = {};   // { "2021": 62, "2021-1": 70, ... } a melhor nota de cada prova e de cada metade
  const parado = () => document.documentElement.classList.contains("pausado");
  // o nome de um simulado: área, prova inteira ou meia prova ("2021-1")
  function nomeSim(modo, chave) {
    if (modo !== "prova") return ENADE_AREAS[chave] ? ENADE_AREAS[chave].nome : chave;
    const [ano, parte] = String(chave).split("-");
    return parte ? `Prova ${ano} · ${parte}ª metade` : `Prova ${ano} inteira`;
  }
  // números que sobem do zero (param com o botão de pausa)
  function contar(el) {
    const fim = Number(el.dataset.contar), suf = el.dataset.suf || "";
    if (parado()) { el.textContent = fim + suf; return; }
    const t0 = performance.now();
    const passo = (t) => {
      const k = Math.min(1, (t - t0) / 1100);
      el.textContent = Math.round(fim * (1 - Math.pow(1 - k, 3))) + suf;
      if (k < 1) requestAnimationFrame(passo);
    };
    requestAnimationFrame(passo);
  }
  // acende o painel: barras enchem, o medidor gira, a linha se desenha
  function acender(caixa) {
    const vai = () => {
      caixa.querySelectorAll("[data-contar]").forEach(contar);
      setTimeout(() => caixa.classList.add("aceso"), 40);
    };
    if (parado() || !("IntersectionObserver" in window)) return vai();
    // só acende quando o painel aparece na tela, para o aluno ver a animação
    const olho = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { olho.disconnect(); vai(); } }, { threshold: 0.2 });
    olho.observe(caixa);
  }
  // a linha da evolução: cada simulado entregue é um ponto (% de acertos), do mais antigo ao mais novo
  function linhaEvolucao(feitas) {
    const pts = feitas.slice().reverse().slice(-12).map((t) => pct(t.acertos, t.total));
    if (!pts.length) return "";
    const L = 300, A = 120, x = (i) => (pts.length === 1 ? L / 2 : 14 + (i * (L - 28)) / (pts.length - 1)), y = (p) => 10 + ((100 - p) * (A - 20)) / 100;
    const linha = pts.map((p, i) => `${x(i).toFixed(1)},${y(p).toFixed(1)}`).join(" ");
    const bolas = pts.map((p, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(p).toFixed(1)}" r="4.5" style="--i:${i}"><title>${p}%</title></circle>`).join("");
    const ult = pts[pts.length - 1], ant = pts.length > 1 ? pts[pts.length - 2] : null;
    const recado = ant === null ? "Faça mais um simulado para a sua linha aparecer." : ult > ant ? `Subiu ${ult - ant} pontos no último. Compilou de primeira! 🚀` : ult < ant ? `Caiu ${ant - ult} pontos no último. Curto-circuito faz parte: confira os erros e tente de novo.` : "Ficou igual ao anterior. Bora destravar essa trilha!";
    return `<div class="cartao en-evolucao"><h3>Sua evolução</h3>
      <svg viewBox="0 0 ${L} ${A}" role="img" aria-label="Acertos nos últimos simulados: ${pts.join("%, ")}%">
        <line class="meta" x1="0" x2="${L}" y1="${y(70)}" y2="${y(70)}"/><text x="4" y="${y(70) - 4}">forte · 70%</text>
        <line class="meta meio" x1="0" x2="${L}" y1="${y(50)}" y2="${y(50)}"/><text x="4" y="${y(50) - 4}">50%</text>
        ${pts.length > 1 ? `<polyline pathLength="1" points="${linha}"/>` : ""}${bolas}
      </svg><p class="en-nota">${recado}</p></div>`;
  }

  // ---------- contagem até a prova ----------
  const caixaConta = $("[data-contagem]");
  function contagem() {
    const falta = ENADE_PROVA_DIA - new Date();
    if (falta <= 0) { caixaConta.innerHTML = "<div><strong>Hoje</strong><span>é dia de prova. Boa sorte!</span></div>"; return; }
    const d = Math.floor(falta / 864e5), h = Math.floor((falta % 864e5) / 36e5);
    caixaConta.innerHTML = `<div><strong>${d}</strong><span>dias</span></div><div><strong>${h}</strong><span>horas</span></div><div><strong>29/11</strong><span>13h30, horário de Brasília</span></div>`;
  }
  contagem();
  setInterval(contagem, 60000);

  // ---------- abrir o simulado na janela dele ----------
  function abrirSimulado(modo, chave) {
    if (!podeTreinar()) {
      CONTA.abrir("Entre com o e-mail da faculdade (@edu.df.senac.br) para treinar. É rapidinho.");
      return;
    }
    const janela = window.open(`simulado.html?modo=${encodeURIComponent(modo)}&chave=${encodeURIComponent(chave)}`, "enade-simulado", "width=1300,height=900");
    if (janela) janela.focus(); else location.href = `simulado.html?modo=${encodeURIComponent(modo)}&chave=${encodeURIComponent(chave)}`;
  }
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-abrir-sim]");
    if (b) { e.preventDefault(); abrirSimulado(b.dataset.modo, b.dataset.chave); }
    if (e.target.closest("[data-entrar]")) CONTA.abrir();
  });

  // ---------- áreas e provas (sem gabarito) ----------
  function desenharAreas(contagens) {
    const caixa = $("[data-areas]");
    const ordem = Object.keys(ENADE_AREAS).filter((k) => contagens[k]);
    caixa.innerHTML = ordem.map((k) => {
      const a = ENADE_AREAS[k];
      const meu = meusPorArea[k];
      const p = meu && meu.total ? pct(meu.acertos, meu.total) : null;
      const n = p === null ? null : nivel(p);
      return `<div class="cartao en-area" style="border-top:3px solid ${a.cor}">
        <span class="en-ico" aria-hidden="true">${a.ico}</span><h3>${esc(a.nome)}</h3>
        <span class="en-qtd">${contagens[k]} questões · uns ${Math.max(10, contagens[k] * 6)} minutos</span>
        ${p === null ? "" : `<span class="en-meu ${n[0]}">seu aproveitamento: ${p}% (${n[1]})</span>`}
        <button type="button" class="botao" data-abrir-sim data-modo="area" data-chave="${k}">Treinar</button></div>`;
    }).join("");
  }
  // a melhor nota do aluno naquela prova ou metade, num selinho no botão
  const selo = (k) => (minhasProvas[k] === undefined ? "" : ` <span class="en-selo ${nivel(minhasProvas[k])[0]}">${minhasProvas[k]}%</span>`);
  function desenharProvas(provas) {
    $("[data-provas]").innerHTML = provas.map((p) => `<div class="repo">
        <span class="repo-nome">${esc(p.banca)} · ENADE ${p.ano}</span>
        <h4>Prova de ${p.ano}</h4>
        <p>${p.questoes} questões objetivas · 4 horas · Tecnologia em Análise e Desenvolvimento de Sistemas.</p>
        <div class="en-botoes"><button type="button" class="botao" data-abrir-sim data-modo="prova" data-chave="${p.ano}">Prova inteira · 4 h${selo(p.ano)}</button></div>
        <p class="en-meia">Ou em duas metades, uma de cada vez, sem pressa (o cronômetro de 2 h é opcional):</p>
        <div class="en-botoes"><button type="button" class="botao contorno" data-abrir-sim data-modo="prova" data-chave="${p.ano}-1">1ª metade · questões 1 a 17${selo(p.ano + "-1")}</button>
        <button type="button" class="botao contorno" data-abrir-sim data-modo="prova" data-chave="${p.ano}-2">2ª metade · questões 18 a 35${selo(p.ano + "-2")}</button></div>
        <a class="en-pdf" href="${esc(p.prova_url)}" target="_blank" rel="noopener">Ver o PDF do INEP ↗</a></div>`).join("");
  }
  let catalogo = null;
  async function carregarCatalogo() {
    if (!nuvem) return;
    const { data, error } = await nuvem.rpc("enade_catalogo", { p_curso: "ads" });
    if (error || !data) {
      $("[data-areas]").innerHTML = $("[data-provas]").innerHTML = '<p class="en-nota">Não deu para carregar agora. Recarregue a página daqui a pouco.</p>';
      return;
    }
    catalogo = data;
    desenharAreas(data.areas || {});
    desenharProvas(data.provas || []);
  }

  // ---------- o painel do aluno ----------
  async function carregarPainel() {
    const caixa = $("[data-painel]");
    if (!podeTreinar() || !nuvem) {
      caixa.innerHTML = '<p class="en-nota">Entre com o e-mail da faculdade para ver o seu painel.</p>';
      meusPorArea = {};
      minhasProvas = {};
      if (catalogo) { desenharAreas(catalogo.areas || {}); desenharProvas(catalogo.provas || []); }
      return;
    }
    const { data, error } = await nuvem.from("enade_tentativas")
      .select("id, modo, chave, iniciado_em, entregue_em, acertos, total, por_area")
      .eq("aluno_id", CONTA.usuario().id).order("iniciado_em", { ascending: false });
    if (error) { caixa.innerHTML = '<p class="en-nota">Não deu para carregar o painel agora.</p>'; return; }
    const feitas = data.filter((t) => t.entregue_em);
    const abertas = data.filter((t) => !t.entregue_em);
    meusPorArea = {};
    minhasProvas = {};
    let ac = 0, tot = 0;
    feitas.forEach((t) => {
      ac += t.acertos || 0; tot += t.total || 0;
      if (t.modo === "prova") minhasProvas[t.chave] = Math.max(minhasProvas[t.chave] || 0, pct(t.acertos, t.total));
      Object.entries(t.por_area || {}).forEach(([k, v]) => {
        const m = meusPorArea[k] || (meusPorArea[k] = { acertos: 0, total: 0 });
        m.acertos += v.acertos; m.total += v.total;
      });
    });
    if (catalogo) { desenharAreas(catalogo.areas || {}); desenharProvas(catalogo.provas || []); }
    if (!feitas.length && !abertas.length) {
      caixa.innerHTML = '<p class="en-nota">Você ainda não fez nenhum simulado. Comece por uma área ali em cima!</p>';
      return;
    }
    const linhas = Object.keys(ENADE_AREAS).map((k) => {
      const m = meusPorArea[k];
      if (!m || !m.total) return `<li class="vazio"><span>${ENADE_AREAS[k].ico} ${esc(ENADE_AREAS[k].nome)}</span><span class="trilho"><i style="--p:0"></i></span><span class="pct">—</span></li>`;
      const p = pct(m.acertos, m.total);
      const cor = p >= 70 ? "var(--en-forte)" : p >= 50 ? "var(--en-atencao)" : "var(--en-reforco)";
      return `<li><span>${ENADE_AREAS[k].ico} ${esc(ENADE_AREAS[k].nome)}</span><span class="trilho" title="${m.acertos} de ${m.total}"><i style="--p:${p};--cor:${cor}"></i></span><span class="pct" data-contar="${p}" data-suf="%">0%</span></li>`;
    }).join("");
    const reforco = Object.keys(meusPorArea).filter((k) => ENADE_AREAS[k] && meusPorArea[k].total && pct(meusPorArea[k].acertos, meusPorArea[k].total) < 50);
    const nunca = Object.keys(ENADE_AREAS).filter((k) => !meusPorArea[k]);
    const rostoRecado = reforco.length ? "ideia" : nunca.length ? "notebook" : "olhos-de-estrela";
    const recado = reforco.length
      ? `<strong>Reforce primeiro:</strong> ${reforco.map((k) => esc(ENADE_AREAS[k].nome)).join(", ")}. Refaça o treino dessas áreas e confira cada erro no PDF do INEP.`
      : nunca.length ? `<strong>Falta treinar:</strong> ${nunca.map((k) => esc(ENADE_AREAS[k].nome)).join(", ")}.`
      : "<strong>Tudo treinado!</strong> Hora de fazer uma prova completa, com tempo de prova.";
    const hist = data.map((t) => {
      const nome = nomeSim(t.modo, t.chave);
      const quando = new Date(t.iniciado_em).toLocaleDateString("pt-BR");
      return t.entregue_em
        ? `<tr><td>${quando}</td><td>${esc(nome)}</td><td>${t.acertos}/${t.total} (${pct(t.acertos, t.total)}%)</td><td><a href="simulado.html?resultado=${t.id}" target="enade-simulado">ver a correção</a></td></tr>`
        : `<tr><td>${quando}</td><td>${esc(nome)}</td><td>em andamento</td><td><a href="#" data-abrir-sim data-modo="${t.modo}" data-chave="${esc(t.chave)}">continuar</a></td></tr>`;
    }).join("");
    const geral = pct(ac, tot), ng = nivel(geral);
    caixa.classList.remove("aceso");
    caixa.innerHTML = `<div class="en-painel">
      <div><div class="en-resumo">
          <div class="en-medidor ${ng[0]}"><svg viewBox="0 0 120 120" aria-hidden="true"><circle class="fundo" cx="60" cy="60" r="50"/><circle class="arco" cx="60" cy="60" r="50" pathLength="100" style="--p:${geral}"/></svg>
            <strong data-contar="${geral}" data-suf="%">0%</strong><span>de acertos (${ng[1]})</span></div>
          <div><strong data-contar="${feitas.length}">0</strong><span>simulados entregues</span></div>
          <div><strong data-contar="${tot}">0</strong><span>questões respondidas</span></div></div>
        <ul class="en-barras">${linhas}</ul><div class="en-recado com-stela"><img src="assets/memoji/${rostoRecado}.webp" alt="" width="64" height="69"><p>${recado}</p></div></div>
      <div class="en-coluna">${linhaEvolucao(feitas)}
        <div class="cartao"><h3>Seus simulados</h3><div class="en-tabela"><table class="en-historico"><thead><tr><th>Dia</th><th>Simulado</th><th>Acertos</th><th></th></tr></thead><tbody>${hist}</tbody></table></div></div></div>
    </div>`;
    acender(caixa);
  }

  // ---------- login ----------
  function aoEntrar() {
    const st = $("[data-status-login]");
    const ok = podeTreinar();
    const u = window.CONTA && CONTA.usuario();
    st.classList.toggle("ok", Boolean(ok));
    st.textContent = ok ? `Você entrou como ${u.email}. Bons treinos!` : u ? "Você entrou com um e-mail que não é @edu.df.senac.br. Saia e entre com o da faculdade." : "Você ainda não entrou.";
    $("[data-entrar]").textContent = ok ? "Minha conta" : "Entrar ou criar conta";
    carregarPainel();
  }
  if (window.CONTA && CONTA.aoMudar) CONTA.aoMudar(aoEntrar);
  aoEntrar();
  carregarCatalogo();
  // quando o aluno volta da janela do simulado, o painel se atualiza
  window.addEventListener("focus", () => { if (podeTreinar()) carregarPainel(); });
})();
