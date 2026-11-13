/*
  painel.js: o painel da professora do Simulado ENADE de ADS · versão 2 · 2026-11-13 (o banco diz quem é professora)
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
      caixa.innerHTML = '<div class="cartao"><h3>Entre com a conta da professora</h3><p>Use o botão <strong>Entrar</strong> lá em cima, com o e-mail @df.senac.br.</p><button type="button" class="botao" data-entrar>Entrar</button></div>';
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
      return `<tr><td>${i + 1}</td><td><strong>${esc(nomeDe(r.id))}</strong><br><small>${esc(emailDe(r.id))}</small></td>
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
  });
  ["[data-dia]", "[data-todos-dias]", "[data-esconder]"].forEach((s) => $(s).addEventListener("input", () => dados && desenhar()));
  if (window.CONTA && CONTA.aoMudar) CONTA.aoMudar(carregar);
  carregar();
  // durante a aula, atualiza sozinho a cada minuto (só com a página visível)
  relogio = setInterval(() => { if (!document.hidden && ehProfessora()) carregar(); }, 60000);
})();
