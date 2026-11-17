// Normalização de nomes de fornecedor, usada pela memória de categorias.
export const normaliza = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();

export function chaveFornecedor(nome) {
  const k = normaliza(nome).replace(/[^A-Z0-9 ]+/g, " ")
    .replace(/\b(LTDA|ME|EPP|EIRELI|SA|MEI|COMERCIO|COMERCIAL|SERVICOS|SOLUCOES)\b/g, " ")
    .replace(/\s+/g, " ").trim();
  return k || normaliza(nome).trim();
}
