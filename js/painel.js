/*
  painel.js: o painel da professora do Simulado ENADE de ADS · versão 3 · 2026-11-13 (o banco diz quem é professora; mapa da turma por área e painel de cada aluno)
  Só para a conta da professora (prep_eh_professora no banco). Lê enade_tentativas e disc_alunos, que o RLS
  já libera para a professora (para o aluno, só as dele). Nada é gravado daqui.
  Mostra: a chamada do dia, cada aluno (todos os dias), a turma por área e a lista de simulados, com CSV.
*/
(function () {
  const nuvem = window.CONTA && CONTA.cliente ? CONTA.cliente() : null;
  const $ = (s) => document.querySelector(s);
  const esc = (t) => String(t == null ? "" : t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const pct = (a, t) => (t ? Math.round((100 * a) / t) : 0);
  const cor = (p) => (p >= 70 ? "var(--en-forte)" : p >= 50 ? "var(--en-atencao)" : "var(--en-reforco)");
  const caixa = $("[data-painel-prof]");
  const hojeBR = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });   // AAAA-MM-DD
  const diaBR = (iso) => new Date(iso).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  const horaBR = (iso) => new Date(iso).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
  const dataBR = (iso) => new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  let dados = null;     // { tentativas, alunos }
  let alunoAberto = null;   // id do aluno cujo painel está aberto
  let painelJaAberto = null; // depois da 1ª animação, as atualizações não animam de novo
  let relogio = null;

  // o nome de um simulado (o mesmo jeito da página inicial)
  function nomeSim(modo, chave) {
    if (modo !== "prova") return "Treino · " + (ENADE_AREAS[chave] ? ENADE_AREAS[chave].nome : chave);
    const [ano, parte] = String(chave).split("-");
    if (parte === "15") return "Prova rápida (15)";
    const nome = ano === "mista" ? "Prova sorteada" : `Prova ${ano}`;
    return parte ? `${nome} · ${parte}ª metade` : nome;
  }

  // ---------- quem pode ver: quem decide é o banco (tabela prep_professoras, a mesma do painel dos preparatórios) ----------
  let professora = false;
  const ehProfessora = () => professora;

  async function carregar() {
    if (!nuvem) { caixa.innerHTML = '<p class="en-nota">Não deu para falar com o banco agora.</p>'; return; }
    const u = window.CONTA && CONTA.usuario();
    if (!u) {
      $("[data-filtros]").hidden = true;
      caixa.innerHTML = '<div class="cartao"><h3>Entre com a conta da professora</h3><p>Use o botão <strong>Entrar</strong> lá em cima, com a sua conta que tem o status de professora.</p><button type="button" class="botao" data-entrar>Entrar</button></div>';
      return;
    }
    const { data: eh, error: erroEh } = await nuvem.rpc("prep_eh_professora");
    professora = Boolean(eh) && !erroEh;
    if (!professora) {
      $("[data-filtros]").hidden = true;
      caixa.innerHTML = `<div class="cartao"><h3>Esta página é só da professora</h3>
        <p>Você entrou como <strong>${esc(u.email)}</strong>, e essa conta não está cadastrada como professora no banco.</p>
        <p class="en-nota">Professora: cadastre esta conta em prep_professoras (SQL com a Claudinha) ou entre com a conta já cadastrada. Aluno: o seu desempenho está na <a href="./#desempenho">página do simulado</a>. 😉</p></div>`;
      return;
    }
    const [t, a] = await Promise.all([
      nuvem.from("enade_tentativas").select("id, aluno_id, modo, chave, iniciado_em, entregue_em, acertos, total, por_area").order("iniciado_em", { ascending: false }).limit(5000),
      nuvem.from("disc_alunos").select("id, nome, email").limit(5000),
    ]);
    if (t.error) { caixa.innerHTML = `<p class="en-nota">Curto-circuito ao ler os simulados: ${esc(t.error.message)}</p>`; return; }
    const alunos = {};
    (a.data || []).forEach((x) => { alunos[x.id] = x; });
    dados = { tentativas: t.data || [], alunos };
    $("[data-filtros]").hidden = false;
    const st = $("[data-atualizado]");
    st.textContent = "✔ atualizado às " + new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    st.classList.remove("pf-piscou"); void st.offsetWidth; st.classList.add("pf-piscou");   // pisca para mostrar que atualizou
    desenhar();
  }

  // ---------- os filtros ----------
  function filtradas() {
    const dia = $("[data-dia]").value || hojeBR();
    const todos = $("[data-todos-dias]").checked;
    const esconder = $("[data-esconder]").value.trim().toLowerCase();
    return dados.tentativas.filter((x) => {
      if (!todos && diaBR(x.iniciado_em) !== dia) return false;
      if (esconder) {
        const al = dados.alunos[x.aluno_id];
        const nome = ((al && al.nome) || "") + " " + ((al && al.email) || "");
        if (nome.toLowerCase().includes(esconder)) return false;
      }
      return true;
    });
  }
  const nomeDe = (id) => (dados.alunos[id] ? dados.alunos[id].nome : "(sem cadastro: conta da professora?)");
  const emailDe = (id) => (dados.alunos[id] ? dados.alunos[id].email : "");

  // junta as tentativas por aluno
  function porAluno(lista) {
    const m = {};
    lista.forEach((x) => {
      const r = m[x.aluno_id] || (m[x.aluno_id] = { id: x.aluno_id, comecou: x.iniciado_em, entregues: 0, abertas: 0, acertos: 0, total: 0, melhor: null, areas: {} });
      if (x.iniciado_em < r.comecou) r.comecou = x.iniciado_em;
      if (x.entregue_em) {
        r.entregues++; r.acertos += x.acertos || 0; r.total += x.total || 0;
        const p = pct(x.acertos, x.total);
        if (!r.melhor || p > r.melhor.p) r.melhor = { p, txt: `${x.acertos}/${x.total}` };
        Object.entries(x.por_area || {}).forEach(([k, v]) => {
          const ar = r.areas[k] || (r.areas[k] = { acertos: 0, total: 0 });
          ar.acertos += v.acertos; ar.total += v.total;
        });
      } else r.abertas++;
    });
    return Object.values(m).sort((p, q) => nomeDe(p.id).localeCompare(nomeDe(q.id), "pt-BR"));
  }

  // ---------- o painel de um aluno: o mesmo que ele vê em "Meu desempenho" (todos os dias) ----------
  const nivel = (p) => (p >= 70 ? ["forte", "forte"] : p >= 50 ? ["atencao", "atenção"] : ["reforco", "reforço"]);
  function linhaEvolucao(feitas) {
    const pts = feitas.slice().reverse().slice(-12).map((t) => pct(t.acertos, t.total));
    if (!pts.length) return "";
    const L = 300, A = 120, x = (i) => (pts.length === 1 ? L / 2 : 14 + (i * (L - 28)) / (pts.length - 1)), y = (p) => 10 + ((100 - p) * (A - 20)) / 100;
    const linha = pts.map((p, i) => `${x(i).toFixed(1)},${y(p).toFixed(1)}`).join(" ");
    const bolas = pts.map((p, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(p).toFixed(1)}" r="4.5" style="--i:${i}"><title>${p}%</title></circle>`).join("");
    return `<div class="cartao en-evolucao"><h3>Evolução</h3>
      <svg viewBox="0 0 ${L} ${A}" role="img" aria-label="Acertos nos últimos simulados: ${pts.join("%, ")}%">
        <line class="meta" x1="0" x2="${L}" y1="${y(70)}" y2="${y(70)}"/><text x="4" y="${y(70) - 4}">forte · 70%</text>
        <line class="meta meio" x1="0" x2="${L}" y1="${y(50)}" y2="${y(50)}"/><text x="4" y="${y(50) - 4}">50%</text>
        ${pts.length > 1 ? `<polyline pathLength="1" points="${linha}"/>` : ""}${bolas}
      </svg><p class="en-nota">${pts.length > 1 ? `Do primeiro ao último: ${pts[0]}% → ${pts[pts.length - 1]}%.` : "Um simulado entregue até agora."}</p></div>`;
  }
  function painelDoAluno(id) {
    const todas = dados.tentativas.filter((x) => x.aluno_id === id);
    const feitas = todas.filter((x) => x.entregue_em);
    const r = porAluno(todas)[0] || { acertos: 0, total: 0, areas: {} };
    const geral = pct(r.acertos, r.total), ng = nivel(geral);
    const barras = Object.keys(ENADE_AREAS).map((k) => {
      const m = r.areas[k];
      if (!m || !m.total) return `<li class="vazio"><span>${ENADE_AREAS[k].ico} ${esc(ENADE_AREAS[k].nome)}</span><span class="trilho"><i style="--p:0;width:0"></i></span><span class="pct">—</span></li>`;
      const p = pct(m.acertos, m.total);
      return `<li><span>${ENADE_AREAS[k].ico} ${esc(ENADE_AREAS[k].nome)}</span><span class="trilho" title="${m.acertos} de ${m.total}"><i style="--p:${p};--cor:${cor(p)};width:${p}%"></i></span><span class="pct">${p}% <small>(${m.acertos}/${m.total})</small></span></li>`;
    }).join("");
    const hist = todas.map((x) => `<tr><td>${dataBR(x.iniciado_em)} ${horaBR(x.iniciado_em)}</td><td>${esc(nomeSim(x.modo, x.chave))}</td>
      <td>${x.entregue_em ? `${x.acertos}/${x.total} (${pct(x.acertos, x.total)}%)` : "em andamento"}</td>
      <td>${x.entregue_em ? `<a href="simulado.html?resultado=${x.id}" target="enade-simulado">ver a correção</a>` : ""}</td></tr>`).join("");
    return `<div class="cartao pf-bloco pf-dash${painelJaAberto === id ? " aceso" : ""}" id="painel-aluno">
      <div class="pf-dash-topo"><h3>📊 Painel de ${esc(nomeDe(id))} <small>${esc(emailDe(id))} · todos os dias</small></h3>
        <button type="button" class="botao contorno" data-fechar-aluno>Fechar ✕</button></div>
      <div class="en-painel">
        <div><div class="en-resumo">
            <div class="en-medidor ${ng[0]}"><svg viewBox="0 0 120 120" aria-hidden="true"><circle class="fundo" cx="60" cy="60" r="50"/><circle class="arco" cx="60" cy="60" r="50" pathLength="100" style="--p:${geral}"/></svg>
              <strong>${r.total ? geral + "%" : "—"}</strong><span>de acertos (${ng[1]})</span></div>
            <div><strong>${feitas.length}</strong><span>simulados entregues</span></div>
            <div><strong>${r.total}</strong><span>questões respondidas</span></div></div>
          <ul class="en-barras">${barras}</ul></div>
        <div class="en-coluna">${linhaEvolucao(feitas)}
          <div class="cartao"><h3>Simulados</h3><div class="en-tabela"><table class="en-historico"><thead><tr><th>Quando</th><th>Simulado</th><th>Acertos</th><th></th></tr></thead><tbody>${hist}</tbody></table></div></div></div>
      </div></div>`;
  }

  // ---------- o mapa da turma: uma linha por aluno, uma coluna por área ----------
  function mapaDaTurma(al) {
    const usadas = Object.keys(ENADE_AREAS).filter((k) => al.some((r) => r.areas[k] && r.areas[k].total));
    if (!usadas.length) return '<p class="en-nota">Ainda sem simulados entregues neste filtro.</p>';
    const cab = usadas.map((k) => `<th title="${esc(ENADE_AREAS[k].nome)}">${ENADE_AREAS[k].ico}<br><small>${esc(ENADE_AREAS[k].nome.split(/[ ,]/)[0])}</small></th>`).join("");
    const linhas = al.map((r) => `<tr><td><button type="button" class="pf-aluno" data-aluno="${esc(r.id)}">${esc(nomeDe(r.id))}</button></td>` + usadas.map((k) => {
      const m = r.areas[k];
      if (!m || !m.total) return '<td class="pf-cel vazio">·</td>';
      const p = pct(m.acertos, m.total);
      return `<td class="pf-cel" style="--cor:${cor(p)}" title="${esc(ENADE_AREAS[k].nome)}: ${m.acertos} de ${m.total}">${p}%</td>`;
    }).join("") + "</tr>").join("");
    return `<div class="en-tabela"><table class="en-historico pf-mapa"><thead><tr><th>Aluno</th>${cab}</tr></thead><tbody>${linhas}</tbody></table></div>
      <p class="en-nota">Clique no nome para abrir o painel do aluno. Verde: 70% ou mais · amarelo: 50% a 69% · vermelho: abaixo de 50% · ponto: área ainda não treinada.</p>`;
  }

  // ---------- o desenho ----------
  function desenhar() {
    const lista = filtradas();
    const todos = $("[data-todos-dias]").checked;
    const dia = $("[data-dia]").value || hojeBR();
    const rotuloDia = todos ? "todos os dias" : dia === hojeBR() ? "hoje" : dataBR(dia + "T12:00:00-03:00");
    const al = porAluno(lista);
    const entregues = lista.filter((x) => x.entregue_em);
    const ac = entregues.reduce((s, x) => s + (x.acertos || 0), 0), tot = entregues.reduce((s, x) => s + (x.total || 0), 0);

    // turma por área
    const areas = {};
    entregues.forEach((x) => Object.entries(x.por_area || {}).forEach(([k, v]) => {
      const ar = areas[k] || (areas[k] = { acertos: 0, total: 0 });
      ar.acertos += v.acertos; ar.total += v.total;
    }));
    const barras = Object.keys(ENADE_AREAS).filter((k) => areas[k] && areas[k].total).map((k) => {
      const p = pct(areas[k].acertos, areas[k].total);
      return `<li><span>${ENADE_AREAS[k].ico} ${esc(ENADE_AREAS[k].nome)}</span><span class="trilho" title="${areas[k].acertos} de ${areas[k].total}"><i style="--p:${p};--cor:${cor(p)};width:${p}%"></i></span><span class="pct">${p}%</span></li>`;
    }).join("");

    const linhasChamada = al.map((r, i) => {
      const geral = r.total ? pct(r.acertos, r.total) : null;
      const fracas = Object.entries(r.areas).filter(([, v]) => v.total && pct(v.acertos, v.total) < 50).map(([k]) => (ENADE_AREAS[k] ? ENADE_AREAS[k].nome : k));
      return `<tr><td>${i + 1}</td><td><button type="button" class="pf-aluno" data-aluno="${esc(r.id)}">${esc(nomeDe(r.id))}</button><br><small>${esc(emailDe(r.id))}</small></td>
        <td>${horaBR(r.comecou)}${todos ? `<br><small>${dataBR(r.comecou)}</small>` : ""}</td>
        <td>${r.entregues}${r.abertas ? ` <small>(+${r.abertas} em andamento)</small>` : ""}</td>
        <td>${r.melhor ? `${r.melhor.txt} <small>(${r.melhor.p}%)</small>` : "—"}</td>
        <td>${geral === null ? "—" : `<span style="color:${cor(geral)};font-weight:700">${geral}%</span>`}</td>
        <td><small>${fracas.length ? esc(fracas.join(", ")) : "—"}</small></td></tr>`;
    }).join("");

    const linhasSim = lista.map((x) => `<tr><td>${dataBR(x.iniciado_em)} ${horaBR(x.iniciado_em)}</td><td>${esc(nomeDe(x.aluno_id))}</td><td>${esc(nomeSim(x.modo, x.chave))}</td>
      <td>${x.entregue_em ? `${x.acertos}/${x.total} (${pct(x.acertos, x.total)}%)` : "em andamento"}</td>
      <td>${x.entregue_em ? `<a href="simulado.html?resultado=${x.id}" target="enade-simulado">ver a correção</a>` : ""}</td></tr>`).join("");

    caixa.innerHTML = `
      <div class="en-resumo pf-resumo">
        <div><strong>${al.length}</strong><span>alunos (${esc(rotuloDia)})</span></div>
        <div><strong>${entregues.length}</strong><span>simulados entregues</span></div>
        <div><strong>${tot ? pct(ac, tot) + "%" : "—"}</strong><span>de acertos da turma</span></div>
      </div>
      <div class="cartao pf-bloco" id="chamada"><h3>Chamada e alunos · ${esc(rotuloDia)}</h3>
        ${al.length ? `<div class="en-tabela"><table class="en-historico"><thead><tr><th>#</th><th>Aluno</th><th>Começou</th><th>Entregues</th><th>Melhor</th><th>Geral</th><th>Reforçar (abaixo de 50%)</th></tr></thead><tbody>${linhasChamada}</tbody></table></div>`
          : '<p class="en-nota">Ninguém fez simulado neste dia ainda.</p>'}</div>
      ${alunoAberto && dados.tentativas.some((x) => x.aluno_id === alunoAberto) ? painelDoAluno(alunoAberto) : ""}
      <div class="cartao pf-bloco" id="mapa"><h3>Mapa da turma por área · ${esc(rotuloDia)}</h3>${mapaDaTurma(al)}</div>
      <div class="cartao pf-bloco" id="turma"><h3>A turma por área</h3>
        ${barras ? `<ul class="en-barras pf-barras">${barras}</ul><p class="en-nota">Forte é 70% ou mais; atenção, de 50% a 69%; reforço, abaixo de 50%. Use para escolher o que revisar com a turma.</p>` : '<p class="en-nota">Ainda sem simulados entregues neste filtro.</p>'}</div>
      <div class="cartao pf-bloco" id="simulados"><h3>Todos os simulados · ${esc(rotuloDia)}</h3>
        ${lista.length ? `<div class="en-tabela"><table class="en-historico"><thead><tr><th>Quando</th><th>Aluno</th><th>Simulado</th><th>Acertos</th><th></th></tr></thead><tbody>${linhasSim}</tbody></table></div>` : '<p class="en-nota">Nada por aqui.</p>'}</div>
`;
  }

  // ---------- planilha ----------
  function baixarCsv() {
    if (!dados) return;
    const al = porAluno(filtradas());
    const linhas = [["aluno", "email", "comecou", "entregues", "em andamento", "melhor", "melhor %", "acertos", "questoes", "geral %"]];
    al.forEach((r) => linhas.push([nomeDe(r.id), emailDe(r.id), `${dataBR(r.comecou)} ${horaBR(r.comecou)}`, r.entregues, r.abertas,
      r.melhor ? r.melhor.txt : "", r.melhor ? r.melhor.p : "", r.acertos, r.total, r.total ? pct(r.acertos, r.total) : ""]));
    const csv = "﻿" + linhas.map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = `enade-turma-${$("[data-todos-dias]").checked ? "todos" : $("[data-dia]").value || hojeBR()}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
  }

  // ---------- eventos ----------
  $("[data-dia]").value = hojeBR();
  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-entrar]")) CONTA.abrir();
    const bt = e.target.closest("[data-atualizar]");
    if (bt) {
      bt.disabled = true; bt.textContent = "Soldando…";
      carregar().finally(() => { bt.disabled = false; bt.textContent = "Atualizar agora"; });
    }
    if (e.target.closest("[data-csv]")) baixarCsv();
    const ab = e.target.closest("[data-aluno]");
    if (ab && dados) {
      alunoAberto = ab.dataset.aluno; painelJaAberto = null; desenhar(); painelJaAberto = alunoAberto;
      const el = $("#painel-aluno");
      if (el) { setTimeout(() => el.classList.add("aceso"), 40); el.scrollIntoView({ behavior: "smooth", block: "start" }); }
    }
    if (e.target.closest("[data-fechar-aluno]")) { alunoAberto = null; desenhar(); }
  });
  ["[data-dia]", "[data-todos-dias]", "[data-esconder]"].forEach((s) => $(s).addEventListener("input", () => dados && desenhar()));
  if (window.CONTA && CONTA.aoMudar) CONTA.aoMudar(carregar);
  carregar();
  // durante a aula, atualiza sozinho a cada minuto (só com a página visível)
  relogio = setInterval(() => { if (!document.hidden && ehProfessora()) carregar(); }, 60000);
})();
