/*
  enade.js: a página inicial do Simulado ENADE de ADS · versão 1 · 2026-11-13
  Contagem até a prova, login (conta.js das disciplinas, só @edu.df.senac.br), as áreas e as provas
  (do banco, pela função enade_catalogo), e o painel do aluno (as tentativas dele, tabela enade_tentativas).
  O simulado abre numa janela só para ele: simulado.html. SQL em Placa-Mae/supabase/enade-ads.sql.
*/
const ENADE_PROVA_DIA = new Date("2026-11-29T13:30:00-03:00");

(function () {
  const nuvem = window.supabase ? window.supabase.createClient(CONTA_URL, CONTA_CHAVE) : null;
  const $ = (s) => document.querySelector(s);
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const pct = (a, t) => (t ? Math.round((100 * a) / t) : 0);
  const nivel = (p) => (p >= 70 ? ["forte", "forte"] : p >= 50 ? ["atencao", "atenção"] : ["reforco", "reforço"]);
  let meusPorArea = {};

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
    if (!window.CONTA || !CONTA.daFaculdade()) {
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
  function desenharProvas(provas) {
    $("[data-provas]").innerHTML = provas.map((p) => `<div class="repo">
        <span class="repo-nome">${esc(p.banca)} · ENADE ${p.ano}</span>
        <h4>Prova de ${p.ano}</h4>
        <p>${p.questoes} questões objetivas · 4 horas · Tecnologia em Análise e Desenvolvimento de Sistemas.</p>
        <div class="en-botoes"><button type="button" class="botao" data-abrir-sim data-modo="prova" data-chave="${p.ano}">Fazer a prova</button>
        <a class="botao contorno" href="${esc(p.prova_url)}" target="_blank" rel="noopener">Ver o PDF do INEP</a></div></div>`).join("");
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
    if (!window.CONTA || !CONTA.daFaculdade() || !nuvem) {
      caixa.innerHTML = '<p class="en-nota">Entre com o e-mail da faculdade para ver o seu painel.</p>';
      meusPorArea = {};
      if (catalogo) desenharAreas(catalogo.areas || {});
      return;
    }
    const { data, error } = await nuvem.from("enade_tentativas")
      .select("id, modo, chave, iniciado_em, entregue_em, acertos, total, por_area")
      .eq("aluno_id", CONTA.usuario().id).order("iniciado_em", { ascending: false });
    if (error) { caixa.innerHTML = '<p class="en-nota">Não deu para carregar o painel agora.</p>'; return; }
    const feitas = data.filter((t) => t.entregue_em);
    const abertas = data.filter((t) => !t.entregue_em);
    meusPorArea = {};
    let ac = 0, tot = 0;
    feitas.forEach((t) => {
      ac += t.acertos || 0; tot += t.total || 0;
      Object.entries(t.por_area || {}).forEach(([k, v]) => {
        const m = meusPorArea[k] || (meusPorArea[k] = { acertos: 0, total: 0 });
        m.acertos += v.acertos; m.total += v.total;
      });
    });
    if (catalogo) desenharAreas(catalogo.areas || {});
    if (!feitas.length && !abertas.length) {
      caixa.innerHTML = '<p class="en-nota">Você ainda não fez nenhum simulado. Comece por uma área ali em cima!</p>';
      return;
    }
    const linhas = Object.keys(ENADE_AREAS).map((k) => {
      const m = meusPorArea[k];
      if (!m || !m.total) return `<li class="vazio"><span>${ENADE_AREAS[k].ico} ${esc(ENADE_AREAS[k].nome)}</span><span class="trilho"><i style="--p:0"></i></span><span class="pct">—</span></li>`;
      const p = pct(m.acertos, m.total);
      const cor = p >= 70 ? "var(--en-forte)" : p >= 50 ? "var(--en-atencao)" : "var(--en-reforco)";
      return `<li><span>${ENADE_AREAS[k].ico} ${esc(ENADE_AREAS[k].nome)}</span><span class="trilho" title="${m.acertos} de ${m.total}"><i style="--p:${p};--cor:${cor}"></i></span><span class="pct">${p}%</span></li>`;
    }).join("");
    const reforco = Object.keys(meusPorArea).filter((k) => meusPorArea[k].total && pct(meusPorArea[k].acertos, meusPorArea[k].total) < 50);
    const nunca = Object.keys(ENADE_AREAS).filter((k) => !meusPorArea[k]);
    const recado = reforco.length
      ? `<strong>Reforce primeiro:</strong> ${reforco.map((k) => esc(ENADE_AREAS[k].nome)).join(", ")}. Refaça o treino dessas áreas e confira cada erro no PDF do INEP.`
      : nunca.length ? `<strong>Falta treinar:</strong> ${nunca.map((k) => esc(ENADE_AREAS[k].nome)).join(", ")}.`
      : "<strong>Tudo treinado!</strong> Hora de fazer uma prova completa, com tempo de prova.";
    const hist = data.map((t) => {
      const nome = t.modo === "prova" ? `Prova ${t.chave}` : (ENADE_AREAS[t.chave] ? ENADE_AREAS[t.chave].nome : t.chave);
      const quando = new Date(t.iniciado_em).toLocaleDateString("pt-BR");
      return t.entregue_em
        ? `<tr><td>${quando}</td><td>${esc(nome)}</td><td>${t.acertos}/${t.total} (${pct(t.acertos, t.total)}%)</td><td><a href="simulado.html?resultado=${t.id}" target="enade-simulado">ver a correção</a></td></tr>`
        : `<tr><td>${quando}</td><td>${esc(nome)}</td><td>em andamento</td><td><a href="#" data-abrir-sim data-modo="${t.modo}" data-chave="${esc(t.chave)}">continuar</a></td></tr>`;
    }).join("");
    caixa.innerHTML = `<div class="en-painel">
      <div><div class="en-resumo"><div><strong>${feitas.length}</strong><span>simulados entregues</span></div><div><strong>${tot}</strong><span>questões respondidas</span></div><div><strong>${pct(ac, tot)}%</strong><span>de acertos no geral</span></div></div>
        <ul class="en-barras">${linhas}</ul><p class="en-recado">${recado}</p></div>
      <div class="cartao"><h3>Seus simulados</h3><div class="en-tabela"><table class="en-historico"><thead><tr><th>Dia</th><th>Simulado</th><th>Acertos</th><th></th></tr></thead><tbody>${hist}</tbody></table></div></div>
    </div>`;
  }

  // ---------- login ----------
  function aoEntrar() {
    const st = $("[data-status-login]");
    const ok = window.CONTA && CONTA.daFaculdade();
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
  window.addEventListener("focus", () => { if (window.CONTA && CONTA.daFaculdade()) carregarPainel(); });
})();
