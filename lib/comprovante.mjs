// Leitura de comprovantes: extrai texto de PDF e interpreta notas fiscais brasileiras por regras.
import { extractText, getDocumentProxy } from "unpdf";
import { normaliza } from "./texto.mjs";
export { chaveFornecedor } from "./texto.mjs";

export const CNPJ_RX = /\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/g;
const DATA_RX = /\b(\d{2})\/(\d{2})\/(\d{4})\b/;

// Reconstrói as linhas do PDF pela posição dos trechos: \t separa colunas, para que rótulo e valor fiquem distinguíveis.
export async function textoDoPdf(buf) {
  const doc = await getDocumentProxy(new Uint8Array(buf));
  const linhas = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const pagina = await doc.getPage(p);
    const itens = (await pagina.getTextContent()).items
      .filter((i) => i.str && i.str.trim() && i.transform)
      .map((i) => ({ x: i.transform[4], y: i.transform[5], w: i.width || 0, s: i.str }))
      .sort((a, b) => b.y - a.y || a.x - b.x);
    let grupo = [], yAtual = null;
    const fecha = () => {
      if (!grupo.length) return;
      grupo.sort((a, b) => a.x - b.x);
      let linha = "", fim = null;
      for (const it of grupo) {
        if (fim !== null) { const vao = it.x - fim; linha += vao > 6 ? "\t" : vao > 0.6 ? " " : ""; }
        linha += it.s; fim = it.x + it.w;
      }
      linhas.push(linha.replace(/[ \t]+$/, ""));
      grupo = [];
    };
    for (const it of itens) {
      if (yAtual === null || Math.abs(it.y - yAtual) <= 2.5) { grupo.push(it); yAtual = yAtual === null ? it.y : yAtual; }
      else { fecha(); grupo = [it]; yAtual = it.y; }
    }
    fecha();
  }
  return linhas.join("\n");
}

const celulas = (linha) => String(linha || "").split("\t").map((t) => t.replace(/\s+/g, " ").trim()).filter(Boolean);

const paraCentavos = (t) => {
  const n = String(t).replace(/[R$\s.]/g, "").replace(",", ".");
  const v = Math.round(parseFloat(n) * 100);
  return Number.isInteger(v) && v > 0 ? v : null;
};
const todosValores = (linha) => (linha.match(/\d{1,3}(?:\.\d{3})*,\d{2}/g) || []).map(paraCentavos).filter(Boolean);
const iso = (d) => { const m = DATA_RX.exec(d || ""); return m ? m[3] + "-" + m[2] + "-" + m[1] : null; };

function depoisDe(linhas, rx, salto) {
  for (let i = 0; i < linhas.length; i++) {
    if (rx.test(linhas[i])) {
      for (let k = i + (salto || 1); k < Math.min(i + 6, linhas.length); k++) {
        const t = linhas[k].trim();
        if (t && !/^[-–—\s]+$/.test(t)) return t;
      }
    }
  }
  return "";
}

const ultimaData = (linha) => {
  const ds = String(linha || "").match(/\b\d{2}\/\d{2}\/\d{4}\b/g);
  return ds ? ds[ds.length - 1] : null;
};

export function lerTexto(texto, cnpjIgreja) {
  const linhas = String(texto || "").split("\n");
  const plano = linhas.join(" ");
  const N = normaliza(linhas.join("\n"));
  const faltando = [];

  const indiceDe = (rx, de, ate) => {
    for (let i = de || 0; i < Math.min(ate === undefined ? linhas.length : ate, linhas.length); i++) if (rx.test(linhas[i])) return i;
    return -1;
  };
  const linhaApos = (rx, de) => { const i = indiceDe(rx, de); return i >= 0 && i + 1 < linhas.length ? linhas[i + 1] : ""; };

  // --- tipo de documento ---
  const ehNfse = /DANFSE|NFS-E/.test(N);
  const ehDanfe = /DANFE|NOTA FISCAL ELETRONICA/.test(N);
  const ehCupom = /CUPOM FISCAL|NFC-E|DOCUMENTO AUXILIAR DA NOTA FISCAL DE CONSUMIDOR/.test(N);
  const doc = ehCupom ? "cf" : (ehNfse || ehDanfe) ? "nf" : "recibo";

  // --- CNPJ do fornecedor: o que não é o da igreja ---
  const soDigitos = (x) => String(x).replace(/\D/g, "");
  const igreja = soDigitos(cnpjIgreja || "");
  const cnpj = [...new Set(plano.match(CNPJ_RX) || [])].filter((c) => soDigitos(c) !== igreja)[0] || null;

  // --- fornecedor ---
  let fornecedor = "";
  const m = /RECEB(?:EMOS|I\(EMOS\)|I)\s+DE\s+(.+?)(?:,?\s+OS\s+PRODUTOS|\s+OS\s+SERVI|,\s+OS\s)/i.exec(plano);
  if (m) fornecedor = m[1];
  if (!fornecedor && ehNfse) {
    const base = indiceDe(/PRESTADOR\s*\/\s*FORNECEDOR/i);
    if (base >= 0) fornecedor = celulas(linhaApos(/Nome \/ Nome Empresarial/i, base))[0] || "";
  }
  if (!fornecedor && cnpj) {
    const i = indiceDe(new RegExp(cnpj.replace(/[.\/]/g, "\\$&")));
    for (let k = Math.max(0, i - 6); k < Math.min(i + 6, linhas.length); k++) {
      const c = celulas(linhas[k]).find((t) => t.length > 6 && /[A-Za-zÀ-ú]{4}/.test(t) &&
        !/^(DANFE|DANFSE|RECEB|DOCUMENTO|CHAVE|NUMERO|N[ÚU]MERO|EMITENTE|PRESTADOR|TOMADOR|CNPJ|NOME|INSCRI|ENDERE|MUNIC|IDENTIFICA|CONSULTA|AMBIENTE|DATA|SITUA|FINALIDADE|SIMPLES|REGIME|SERVI|TRIBUTA|VALOR|TOTAL)/i.test(normaliza(t)));
      if (c) { fornecedor = c; break; }
    }
  }
  fornecedor = String(fornecedor).replace(/\s+/g, " ").trim().slice(0, 160);
  if (!fornecedor) faltando.push("fornecedor");

  // --- valor ---
  let valor = null;
  const valoresDe = (l) => (String(l).match(/\d{1,3}(?:\.\d{3})*,\d{2}/g) || []).map(paraCentavos).filter(Boolean);
  const alvos = ehNfse ? [/VALOR L[ÍI]QUIDO DA NFS-?E \+ IBS/i, /VALOR L[ÍI]QUIDO DA NFS-?E/i, /VALOR TOTAL DA NFS-?E/i]
    : [/V(?:ALOR)?\.? TOTAL DA NOTA/i, /VALOR TOTAL DOS PRODUTOS/i];
  for (const alvo of alvos) {
    const vs = valoresDe(linhaApos(alvo));
    if (vs.length) { valor = vs[vs.length - 1]; break; }
  }
  if (!valor) { const t = /VALOR TOTAL:?\s*R\$\s*([\d.,]+)/i.exec(plano); if (t) valor = paraCentavos(t[1]); }
  if (!valor) {
    const todos = valoresDe(plano);
    valor = todos.length ? Math.max.apply(null, todos) : null;
    faltando.push("valor");
  }

  // --- data de emissão ---
  let data = null;
  for (const alvo of [/DATA E HORA DA EMISS[ÃA]O DA NFS-?E/i, /DATA DA EMISS[ÃA]O/i, /DATA E HORA DA EMISS[ÃA]O/i]) {
    const d = ultimaData(linhaApos(alvo));
    if (d) { data = iso(d); break; }
  }
  if (!data) { const t = /EMISS[ÃA]O:?\s*(\d{2}\/\d{2}\/\d{4})/i.exec(plano); if (t) data = iso(t[1]); }
  if (!data) { data = iso(plano); if (!data) faltando.push("data"); }

  // --- descrição ---
  let item = "";
  if (ehNfse) item = celulas(linhaApos(/Descri[çc][ãa]o do Servi[çc]o/i))[0] || "";
  if (!item && ehDanfe) {
    let i = indiceDe(/DESCRI[ÇC][ÃA]O DO PRODUTO/i);
    if (i < 0) i = indiceDe(/C[ÓO]DIGO[\s\t].*DESCRI[ÇC][ÃA]O/i);
    for (let k = i + 1; i >= 0 && k < Math.min(i + 5, linhas.length); k++) {
      const c = celulas(linhas[k]).filter((t) => (t.match(/[A-Za-zÀ-ú]/g) || []).length >= 6)
        .sort((a, b) => (b.match(/[A-Za-zÀ-ú]/g) || []).length - (a.match(/[A-Za-zÀ-ú]/g) || []).length)[0];
      if (c) { item = c; break; }
    }
  }
  item = String(item).replace(/\s+/g, " ").trim().slice(0, 240);
  if (!item) faltando.push("descrição");

  const confianca = faltando.length === 0 ? "alta" : faltando.includes("fornecedor") ? "baixa" : "media";
  return { data, valor, fornecedor, cnpj, item, doc, confianca, faltando };
}
