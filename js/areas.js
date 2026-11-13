/*
  areas.js: as áreas do Simulado ENADE de ADS (classificação da professora) · versão 1 · 2026-11-13
  As chaves são as mesmas da coluna area da tabela enade_itens. Usado pela página inicial e pela janela do simulado.
*/
const ENADE_AREAS = {
  fg: { nome: "Formação Geral", ico: "🌎", cor: "#7c9cff" },
  prog: { nome: "Algoritmos e programação", ico: "💻", cor: "#ffb347" },
  poo: { nome: "Orientação a objetos e padrões", ico: "🧩", cor: "#ff9f43" },
  bd: { nome: "Banco de dados", ico: "🗄️", cor: "#3fd6c4" },
  req: { nome: "Requisitos, UML e arquitetura", ico: "📐", cor: "#b48cff" },
  proc: { nome: "Processos e gestão de projetos", ico: "🗓️", cor: "#ecc874" },
  qual: { nome: "Qualidade, testes e manutenção", ico: "🧪", cor: "#7be07b" },
  infra: { nome: "Redes, sistemas operacionais e hardware", ico: "🌐", cor: "#4fd8ff" },
  ihc: { nome: "Interface, usabilidade e acessibilidade", ico: "🖱️", cor: "#ff7ab8" },
  logica: { nome: "Lógica, matemática e IA", ico: "🧠", cor: "#9fd0b7" },
  neg: { nome: "Negócios, empreendedorismo e ética", ico: "🚀", cor: "#f2a65a" },
};
