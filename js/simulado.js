/*
  simulado.js: a janela do Simulado ENADE de ADS · versão 2 · 2026-11-13 (meia prova, recados da Stela com memoji, som na correção)
  De um lado, a página da questão no PDF oficial do INEP (desenhada pelo pdf.js direto do site do INEP:
  nada do texto das provas fica neste site); do outro, o cartão-resposta. As respostas vão sendo salvas
  no banco (enade_salvar); a correção é feita pelo banco na entrega (enade_entregar).
  Endereços: simulado.html?modo=area&chave=bd · simulado.html?modo=prova&chave=2021 · simulado.html?resultado=<id>
*/
(function () {
  // alunos entram com @edu.df.senac.br; a professora, com @df.senac.br (quem decide de verdade é o banco: enade_pode)
  const podeTreinar = () => Boolean(window.CONTA && CONTA.usuario() && /@(edu\.)?df\.senac\.br$/i.test(CONTA.usuario().email || ""));
  const params = new URLSearchParams(location.search);
  // o mesmo cliente do conta.js (dois clientes com o mesmo login guardado travam um ao outro)
  const nuvem = window.CONTA && CONTA.cliente ? CONTA.cliente() : null;
  const main = document.getElementById("sim");
  const esc = (t) => String(t == null ? "" : t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const pct = (a, t) => (t ? Math.round((100 * a) / t) : 0);
  const nomeArea = (k) => (ENADE_AREAS[k] ? ENADE_AREAS[k].nome : k);
  const LETRAS = ["A", "B", "C", "D", "E"];

  let t = null;            // a tentativa
  let respostas = {};
  let marcadas = new Set();
  let atual = 0;
  let desvio = 0;          // relógio do servidor menos o do computador
  let relogio = null;
  let espera = null;
  let entregando = false;

  function aviso(titulo, texto, botoes) {
    main.innerHTML = `<div class="sim-aviso-meio cartao"><h2>${titulo}</h2><p>${texto}</p>${botoes || ""}</div>`;
  }
  function tituloDe(modo, chave) {
    if (modo !== "prova") return `Treino · ${esc(nomeArea(chave))}`;
    const [ano, parte] = String(chave).split("-");   // "2021-1" = meia prova
    return parte ? `Prova ENADE ${esc(ano)} · ${esc(parte)}ª metade · ADS` : `Prova ENADE ${esc(ano)} · ADS`;
  }
  function voltar() {
    if (window.opener && !window.opener.closed) { window.opener.focus(); window.close(); }
    else location.href = "./#desempenho";
  }

  // ---------- o PDF oficial, uma página por vez ----------
  const pdfs = {};
  let escala = 1.3;
  let paginaVista = 1;
  function abrirPdf(url) {
    if (!pdfs[url]) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
      pdfs[url] = pdfjsLib.getDocument({ url: url }).promise;
    }
    return pdfs[url];
  }
  async function mostrarPagina(item, pagina) {
    const area = main.querySelector("[data-pdf]");
    const info = main.querySelector("[data-pdf-info]");
    if (!area) return;
    paginaVista = pagina;
    if (item.origem !== "oficial" || !item.prova_url) {
      area.innerHTML = `<div class="aviso">${esc(item.enunciado || "")}</div>`;
      return;
    }
    const link = `${item.prova_url}#page=${pagina}`;
    info.innerHTML = `${esc(item.banca)} · ENADE ${item.ano} · página ${pagina} · <a href="${esc(link)}" target="_blank" rel="noopener">abrir o PDF numa aba</a>`;
    try {
      if (!window.pdfjsLib) throw new Error("sem pdf.js");
      area.innerHTML = '<div class="aviso">Carregando a página do PDF do INEP…</div>';
      const pdf = await abrirPdf(item.prova_url);
      const pg = await pdf.getPage(Math.min(pagina, pdf.numPages));
      const vp = pg.getViewport({ scale: escala * (window.devicePixelRatio || 1) });
      const c = document.createElement("canvas");
      c.width = vp.width; c.height = vp.height;
      c.style.width = (vp.width / (window.devicePixelRatio || 1)) + "px";
      c.setAttribute("aria-label", `Página ${pagina} da prova oficial do ENADE ${item.ano}`);
      await pg.render({ canvasContext: c.getContext("2d"), viewport: vp }).promise;
      if (paginaVista !== pagina) return;   // o aluno já foi para outra
      area.innerHTML = "";
      area.appendChild(c);
    } catch (e) {
      area.innerHTML = `<div class="aviso">Não deu para mostrar o PDF aqui.<br><a href="${esc(link)}" target="_blank" rel="noopener">Abra a prova oficial do INEP na página ${pagina}</a> e responda no cartão ao lado.</div>`;
    }
  }

  // ---------- a prova ----------
  function desenharProva() {
    document.title = `${tituloDe(t.modo, t.chave)} · Simulado ENADE`;
    document.querySelector("[data-titulo]").innerHTML = `${tituloDe(t.modo, t.chave)}<small>${t.itens.length} questões · banca INEP · respostas salvas automaticamente</small>`;
    document.querySelector("[data-revisar]").hidden = false;
    main.innerHTML = `<div class="sim-corpo">
      <section class="sim-pdf" aria-label="Página da questão na prova oficial">
        <div class="sim-pdf-barra"><span data-pdf-info></span><span class="esp"></span>
          <button type="button" data-pag="-1" aria-label="Página anterior do PDF">◀ pág.</button>
          <button type="button" data-pag="1" aria-label="Próxima página do PDF">pág. ▶</button>
          <button type="button" data-zoom="-1" aria-label="Diminuir o PDF">−</button>
          <button type="button" data-zoom="1" aria-label="Aumentar o PDF">+</button></div>
        <div class="sim-pdf-area" data-pdf></div>
      </section>
      <div class="sim-lado">
        <section class="sim-questao" aria-live="polite" data-questao></section>
        <section class="sim-grade-caixa"><h3>Questões</h3><div class="sim-grade" data-grade></div>
          <ul class="sim-legenda"><li><i style="--c:color-mix(in srgb,var(--neon) 40%,transparent)"></i>respondida</li><li><i style="--c:var(--en-atencao)"></i>para revisar</li><li><i style="--c:var(--borda-forte)"></i>em branco</li></ul></section>
      </div></div>`;
    desenharGrade();
    irPara(atual);
  }
  function desenharGrade() {
    const g = main.querySelector("[data-grade]");
    if (!g) return;
    g.innerHTML = t.itens.map((it, i) => `<button type="button" data-ir="${i}" class="${respostas[it.id] ? "respondida" : ""} ${marcadas.has(it.id) ? "marcada" : ""}" aria-current="${i === atual}" aria-label="Questão ${i + 1}${respostas[it.id] ? ", respondida " + respostas[it.id] : ", em branco"}${marcadas.has(it.id) ? ", para revisar" : ""}">${i + 1}</button>`).join("");
  }
  function irPara(i) {
    atual = Math.max(0, Math.min(t.itens.length - 1, i));
    const it = t.itens[atual];
    const r = respostas[it.id];
    main.querySelector("[data-questao]").innerHTML = `
      <p class="ref">${esc(it.banca || "INEP")} · ENADE ${it.ano} · questão ${it.numero} · ${it.componente === "fg" ? "Formação Geral" : "Componente Específico"} · ${esc(nomeArea(it.area))}</p>
      <h2>Questão ${atual + 1} de ${t.itens.length}</h2>
      <p class="en-nota">Leia a questão ${it.numero} no PDF (página ${it.pagina}) e marque a sua resposta:</p>
      <div class="sim-letras" role="group" aria-label="Alternativas da questão ${it.numero}">${LETRAS.map((l) => `<button type="button" data-letra="${l}" aria-pressed="${r === l}">${l}</button>`).join("")}</div>
      <div class="sim-navega">
        <button type="button" class="botao contorno" data-mover="-1"${atual === 0 ? " disabled" : ""}>← Anterior</button>
        <button type="button" class="botao contorno sim-marcar" data-marcar aria-pressed="${marcadas.has(it.id)}">${marcadas.has(it.id) ? "★ Marcada para revisar" : "☆ Marcar para revisar"}</button>
        ${r ? '<button type="button" class="botao contorno" data-limpar>Limpar</button>' : ""}
        <button type="button" class="botao" data-mover="1">${atual === t.itens.length - 1 ? "Revisar e entregar" : "Próxima →"}</button>
      </div>`;
    desenharGrade();
    mostrarPagina(it, it.pagina);
  }
  function salvarDepois() {
    const s = document.querySelector("[data-salvo]");
    s.textContent = "salvando…";
    clearTimeout(espera);
    espera = setTimeout(async () => {
      const { data, error } = await nuvem.rpc("enade_salvar", { p_tentativa: t.id, p_respostas: respostas, p_marcadas: [...marcadas] });
      s.textContent = error || data === false ? "⚠ não salvou: confira a internet" : "✔ salvo";
    }, 900);
  }
  function responder(l) {
    const it = t.itens[atual];
    respostas[it.id] = l;
    salvarDepois();
    irPara(atual);
  }

  // ---------- revisão e entrega ----------
  function revisar() {
    const branco = t.itens.map((it, i) => (respostas[it.id] ? null : i + 1)).filter(Boolean);
    const rev = t.itens.map((it, i) => (marcadas.has(it.id) ? i + 1 : null)).filter(Boolean);
    main.innerHTML = `<div class="sim-revisao"><div class="cartao">
      <span class="olho">Antes de entregar</span>
      <h2>Revise o seu cartão-resposta</h2>
      <p>${t.itens.length - branco.length} de ${t.itens.length} questões respondidas.</p>
      ${branco.length ? `<p><strong>Em branco:</strong> ${branco.map((n) => `<button type="button" class="botao contorno" data-ir="${n - 1}" style="padding:.15rem .55rem">${n}</button>`).join(" ")} · questão em branco conta como errada, e chutar não tira ponto.</p>` : "<p>✔ Nenhuma em branco.</p>"}
      ${rev.length ? `<p><strong>Marcadas para revisar:</strong> ${rev.map((n) => `<button type="button" class="botao contorno" data-ir="${n - 1}" style="padding:.15rem .55rem">${n}</button>`).join(" ")}</p>` : ""}
      <p class="en-acoes"><button type="button" class="botao contorno" data-voltar-prova>← Voltar para a prova</button> <button type="button" class="botao" data-entregar>Entregar agora</button></p>
    </div></div>`;
  }
  async function entregar(auto) {
    if (entregando) return;
    entregando = true;
    clearInterval(relogio);
    aviso(auto ? "O tempo acabou!" : "Entregando…", "Corrigindo com o gabarito oficial do INEP.");
    const { data, error } = await nuvem.rpc("enade_entregar", { p_tentativa: t.id, p_respostas: respostas, p_marcadas: [...marcadas] });
    entregando = false;
    if (error || !data) { aviso("Curto-circuito.", "Não deu para entregar agora. Confira a internet e tente de novo: as respostas estão salvas.", '<button type="button" class="botao" data-entregar>Tentar de novo</button>'); return; }
    desenharResultado(data);
  }

  // ---------- resultado ----------
  // a explicação da Stela (campo explicacao do banco): uma linha por parte, **negrito** vale
  const textoExplica = (t) => String(t).split(/\n+/).filter(Boolean).map((l) => `<p>${esc(l).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")}</p>`).join("");
  function balaoDaStela(it) {
    const rosto = it.anulada ? "neutra" : it.certa ? "sorrindo" : "ideia";
    const abre = it.explicacao ? "💬 A Stela explica" : "💬 Recado da Stela";
    const corpo = it.explicacao ? textoExplica(it.explicacao)
      : it.anulada ? "<p>O INEP anulou esta questão, então ela não conta. Mas vale ler: o assunto pode cair de novo.</p>"
      : it.certa ? "<p>Compilou de primeira! A explicação desta questão ainda está sendo soldada. 🔧</p>"
      : `<p>A explicação desta questão ainda está sendo soldada. 🔧 Por enquanto, abra a página ${it.pagina} do PDF e compare a sua (${esc(it.resposta || "em branco")}) com a ${esc(it.gabarito)}: o que a ${esc(it.gabarito)} tem que a sua não tem?</p>`;
    return `<details class="sim-balao"${!it.certa && !it.anulada ? " open" : ""}><summary>${abre}</summary>
      <div class="sim-fala"><img src="assets/memoji/${rosto}.webp" alt="" width="56" height="60"><div>${corpo}</div></div></details>`;
  }
  // som da correção (Web Audio, sem arquivo): só no resultado, nunca durante a prova; cala com a pausa e com o botão 🔇
  const somLigado = () => { try { return localStorage.getItem("enade:som") !== "0"; } catch (e) { return true; } };
  function tocar(notas) {
    if (!somLigado() || document.documentElement.classList.contains("pausado")) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      notas.forEach((f, i) => {
        const o = ctx.createOscillator(), g = ctx.createGain(), t0 = ctx.currentTime + i * 0.13;
        o.type = "triangle"; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.12, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.35);
        o.connect(g).connect(ctx.destination); o.start(t0); o.stop(t0 + 0.4);
      });
    } catch (e) { /* sem som, sem problema */ }
  }
  const botaoSom = () => `<button type="button" class="botao contorno sim-som" data-som aria-pressed="${somLigado()}">${somLigado() ? "🔊 Som ligado" : "🔇 Som desligado"}</button>`;
  function desenharResultado(r) {
    document.querySelector("[data-revisar]").hidden = true;
    document.querySelector("[data-relogio]").textContent = "entregue";
    document.querySelector("[data-relogio]").hidden = false;
    document.querySelector("[data-cron]").hidden = true;
    document.querySelector("[data-salvo]").textContent = "";
    document.querySelector("[data-titulo]").innerHTML = `${tituloDe(r.modo, r.chave)}<small>correção com o gabarito oficial do INEP</small>`;
    const p = pct(r.acertos, r.total);
    const areas = Object.entries(r.por_area || {}).sort((a, b) => pct(a[1].acertos, a[1].total) - pct(b[1].acertos, b[1].total));
    const barras = areas.map(([k, v]) => {
      const q = pct(v.acertos, v.total);
      const cor = q >= 70 ? "var(--en-forte)" : q >= 50 ? "var(--en-atencao)" : "var(--en-reforco)";
      return `<li><span>${ENADE_AREAS[k] ? ENADE_AREAS[k].ico : ""} ${esc(nomeArea(k))}</span><span class="trilho"><i style="--p:${q};--cor:${cor}"></i></span><span class="pct">${v.acertos}/${v.total}</span></li>`;
    }).join("");
    const comp = r.por_componente || {};
    const linhas = r.itens.map((it, i) => {
      const cls = it.anulada ? "anulada" : it.certa ? "certa" : "errada";
      const marca = it.anulada ? "anulada pelo INEP (não conta)" : `sua: ${it.resposta || "em branco"} · gabarito: ${it.gabarito}`;
      return `<li class="${cls}"><strong>${it.anulada ? "—" : it.certa ? "✔" : "✘"} ${i + 1}</strong>
        <span>${esc(it.banca || "INEP")} · ENADE ${it.ano} · questão ${it.numero} · ${esc(nomeArea(it.area))}<br><a href="${esc(it.prova_url)}#page=${it.pagina}" target="_blank" rel="noopener">rever a questão no PDF (pág. ${it.pagina})</a></span>
        <span class="r">${marca}</span>${balaoDaStela(it)}</li>`;
    }).join("");
    const frase = p >= 70 ? "Compilou de primeira! Continue assim, filhote." : p >= 50 ? "Quase lá! Leia as minhas explicações nos erros e refaça as áreas mais fracas." : "Curto-circuito. Calma, é treino: leia as minhas explicações, confere a trilha e tenta de novo.";
    const rosto = p >= 70 ? ["festa", "Stela comemorando"] : p >= 50 ? ["joinha", "Stela fazendo joinha"] : ["punho", "Stela dando força"];
    main.innerHTML = `<div class="sim-resultado">
      <div class="cartao"><span class="olho">Resultado</span>
        <div class="sim-nota-linha"><p class="sim-nota-grande">${p}%</p><img class="sim-memoji-res" src="assets/memoji/${rosto[0]}.webp" alt="${rosto[1]}" width="110" height="118"></div>
        <p><strong>${r.acertos} de ${r.total}</strong> questões certas${r.itens.some((x) => x.anulada) ? " (a anulada não conta)" : ""}. ${frase}</p>
        ${comp.fg || comp.ce ? `<p class="en-nota">${comp.fg ? `Formação Geral: ${comp.fg.acertos}/${comp.fg.total}. ` : ""}${comp.ce ? `Componente Específico: ${comp.ce.acertos}/${comp.ce.total}.` : ""}</p>` : ""}
        <p class="en-acoes"><button type="button" class="botao" data-fechar>Ver o meu painel</button>${botaoSom()}</p></div>
      ${barras ? `<div class="cartao"><h3>Por área</h3><ul class="en-barras">${barras}</ul></div>` : ""}
      <div class="cartao"><h3>Questão por questão</h3><p class="en-nota">Em cada questão tem um recado meu. Nos erros ele já vem aberto: leia, entenda o porquê e não decore a letra. É assim que se aprende.</p><ul class="sim-lista-res">${linhas}</ul></div>
    </div>`;
    main.focus();
    // dó-mi-sol-dó para festa; mi-sol para quase lá; uma subidinha de força para o recomeço
    tocar(p >= 70 ? [523, 659, 784, 1047] : p >= 50 ? [659, 784] : [392, 523]);
  }

  // ---------- relógio ----------
  // prova inteira: 4 h de verdade (o banco entrega no fim); o aluno só pode esconder o relógio.
  // treino e meia prova: sem pressa; o aluno liga o cronômetro se quiser (6 min por questão ou 2 h) e, no fim, só vem um aviso.
  const cheia = () => t.modo === "prova" && !String(t.chave).includes("-");
  const chaveCron = () => `enade:cron:${t.id}`;
  const lerCron = () => { try { return localStorage.getItem(chaveCron()); } catch (e) { return null; } };
  const gravarCron = (v) => { try { v === null ? localStorage.removeItem(chaveCron()) : localStorage.setItem(chaveCron(), v); } catch (e) {} };
  const sugerido = () => (t.modo === "prova" ? 120 : Math.max(10, 6 * t.itens.length)) * 6e4;
  let avisouTempo = false;
  const fmt = (ms) => { const h = Math.floor(ms / 36e5), m = Math.floor((ms % 36e5) / 6e4), s = Math.floor((ms % 6e4) / 1e3); return (h ? h + ":" : "") + String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0"); };
  function botaoCron() {
    const b = document.querySelector("[data-cron]"), v = lerCron();
    if (!b || !t) return;
    b.hidden = false;
    if (cheia()) { b.textContent = v === "escondido" ? "⏱ Mostrar o relógio" : "⏱ Esconder o relógio"; b.setAttribute("aria-pressed", String(v !== "escondido")); }
    else { b.textContent = v ? "⏱ Desligar o cronômetro" : "⏱ Ligar o cronômetro"; b.setAttribute("aria-pressed", String(Boolean(v))); }
  }
  function trocarCron() {
    const v = lerCron();
    if (cheia()) gravarCron(v === "escondido" ? null : "escondido");
    else { gravarCron(v ? null : String(Date.now() + sugerido())); avisouTempo = false; }
    botaoCron(); tictac();
  }
  function tictac() {
    const agora = Date.now() + desvio;
    const prazo = new Date(t.prazo) - agora;
    const el = document.querySelector("[data-relogio]");
    if (prazo <= 0) { el.textContent = "00:00"; entregar(true); return; }   // o prazo do banco vale sempre
    const v = lerCron();
    if (cheia()) {
      el.hidden = v === "escondido";
      el.textContent = fmt(prazo);
      el.classList.toggle("pouco", prazo < 10 * 6e4);
      return;
    }
    el.hidden = !v;
    if (!v) return;
    const resta = Number(v) - Date.now();
    if (resta > 0) { el.textContent = fmt(resta); el.classList.toggle("pouco", resta < 5 * 6e4); return; }
    el.textContent = "⏰ 00:00"; el.classList.add("pouco");
    if (!avisouTempo) { avisouTempo = true; document.querySelector("[data-salvo]").textContent = "O tempo de prova acabou! No dia seria hora de entregar, mas aqui é treino: pode continuar."; tocar([784, 523]); }
  }

  // ---------- eventos ----------
  document.addEventListener("click", (e) => {
    const b = e.target.closest("button, a");
    if (!b) return;
    if (b.dataset.letra) return responder(b.dataset.letra);
    if (b.dataset.ir !== undefined) { if (!main.querySelector("[data-questao]")) desenharProva(); return irPara(Number(b.dataset.ir)); }
    if (b.dataset.mover) { const n = atual + Number(b.dataset.mover); return n >= t.itens.length ? revisar() : irPara(n); }
    if (b.hasAttribute("data-marcar")) { const id = t.itens[atual].id; marcadas.has(id) ? marcadas.delete(id) : marcadas.add(id); salvarDepois(); return irPara(atual); }
    if (b.hasAttribute("data-limpar")) { delete respostas[t.itens[atual].id]; salvarDepois(); return irPara(atual); }
    if (b.hasAttribute("data-revisar")) return revisar();
    if (b.hasAttribute("data-voltar-prova")) { desenharProva(); return; }
    if (b.hasAttribute("data-entregar")) return entregar(false);
    if (b.hasAttribute("data-fechar")) return voltar();
    if (b.hasAttribute("data-cron")) return trocarCron();
    if (b.hasAttribute("data-som")) { try { localStorage.setItem("enade:som", somLigado() ? "0" : "1"); } catch (e) {} b.outerHTML = botaoSom(); if (somLigado()) tocar([659, 784]); return; }
    if (b.hasAttribute("data-entrar-sim")) return CONTA.abrir();
    if (b.dataset.pag) { const it = t.itens[atual]; return mostrarPagina(it, Math.max(1, paginaVista + Number(b.dataset.pag))); }
    if (b.dataset.zoom) { escala = Math.max(.7, Math.min(2.6, escala + .2 * Number(b.dataset.zoom))); return mostrarPagina(t.itens[atual], paginaVista); }
  });
  // atalhos: A a E respondem; setas mudam de questão
  document.addEventListener("keydown", (e) => {
    if (!t || !main.querySelector("[data-questao]") || e.target.closest("input, textarea, dialog")) return;
    const k = e.key.toUpperCase();
    if (LETRAS.includes(k) && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); responder(k); }
    if (e.key === "ArrowRight") irPara(atual + 1);
    if (e.key === "ArrowLeft") irPara(atual - 1);
  });
  window.addEventListener("beforeunload", (e) => {
    if (t && !entregando && main.querySelector("[data-questao]")) { e.preventDefault(); e.returnValue = ""; }
  });

  // ---------- começo ----------
  let comecou = false;
  async function comecar() {
    if (comecou) return;
    if (!podeTreinar()) {
      aviso("Entre com o e-mail da faculdade", "O simulado é para os alunos do Senac DF: entre com o seu @edu.df.senac.br.", '<button type="button" class="botao" data-entrar-sim>Entrar</button>');
      return;
    }
    comecou = true;
    if (params.get("resultado")) {
      const { data, error } = await nuvem.rpc("enade_resultado", { p_tentativa: params.get("resultado") });
      if (error || !data) return aviso("Trilha rompida.", "Não achei esse simulado.", '<button type="button" class="botao" data-fechar>Voltar</button>');
      return desenharResultado(data);
    }
    const modo = params.get("modo"), chave = params.get("chave");
    if (!modo || !chave) return aviso("Trilha rompida.", "Escolha uma área ou uma prova na página inicial.", '<button type="button" class="botao" data-fechar>Voltar</button>');
    const { data, error } = await nuvem.rpc("enade_iniciar", { p_modo: modo, p_chave: chave, p_curso: "ads" });
    if (error || !data) { comecou = false; return aviso("Curto-circuito.", esc(error ? error.message : "Não deu para começar agora."), '<button type="button" class="botao" data-fechar>Voltar</button>'); }
    t = data;
    respostas = data.respostas || {};
    marcadas = new Set(data.marcadas || []);
    desvio = new Date(data.agora) - Date.now();
    const primeiraEmBranco = t.itens.findIndex((it) => !respostas[it.id]);
    atual = primeiraEmBranco === -1 ? 0 : primeiraEmBranco;
    desenharProva();
    botaoCron();
    tictac();
    relogio = setInterval(tictac, 1000);
  }
  if (window.CONTA && CONTA.aoMudar) CONTA.aoMudar(() => comecar());
  setTimeout(comecar, 1500);
})();
