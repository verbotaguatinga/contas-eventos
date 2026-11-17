// Leitura de comprovante por modelo de visão, através do AI Gateway do Netlify.
// Só é acionada quando as regras não dão conta: foto de cupom ou documento fora de padrão.
import Anthropic from "@anthropic-ai/sdk";

const MODELO = process.env.IA_MODELO || "claude-haiku-5-5";

const instrucao = (CATEGORIAS) => `Você lê comprovantes de despesa brasileiros (nota fiscal, cupom fiscal, recibo e fatura) de uma igreja.
Responda SOMENTE com um objeto JSON, sem texto em volta, com estas chaves:
{"data":"AAAA-MM-DD ou null","valor_centavos":inteiro ou null,"fornecedor":"razão social de quem vendeu ou null","cnpj":"00.000.000/0000-00 ou null","item":"o que foi comprado, em até 15 palavras, ou null","doc":"nf, cf ou recibo","categoria":indice ou null,"observacao":"ressalva curta ou null"}
Regras:
- O valor é o total final do documento, o que foi efetivamente pago. Ignore tributos aproximados, deduções, valores unitários e descontos informativos.
- O fornecedor é quem emitiu o documento. NUNCA é a igreja (IGREJA EVANGELICA VERBO DA VIDA, CNPJ 08.676.111/0001-24), que é a tomadora.
- A data é a de emissão do documento. Se não houver data completa com ano, devolva null.
- doc: "nf" para nota fiscal (NF-e ou NFS-e), "cf" para cupom fiscal de consumidor, "recibo" para recibo ou fatura.
- Em caso de dúvida em qualquer campo, devolva null nele. Nunca invente número, nome ou data.
- categoria é o índice na lista: ${CATEGORIAS.map((c, i) => i + "=" + c).join("; ")}. Só preencha quando o documento deixar claro; caso contrário, null.`;

function extrairJson(txt, diagnostico) {
  const m = /\{[\s\S]*\}/.exec(String(txt || ""));
  if (!m) throw new Error("A leitura não devolveu dados utilizáveis. " + diagnostico + " resposta=" + JSON.stringify(String(txt || "").slice(0, 400)));
  return JSON.parse(m[0]);
}

export function gatewayDisponivel() {
  return Boolean(process.env.ANTHROPIC_BASE_URL || process.env.ANTHROPIC_API_KEY);
}

// entrada: {texto} para documento com texto, ou {imagem:{tipo, base64}} para foto.
export async function lerComIA(entrada, CATEGORIAS) {
  const cliente = new Anthropic();
  const conteudo = [];
  if (entrada.pdf) {
    conteudo.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: entrada.pdf } });
    conteudo.push({ type: "text", text: "Leia este comprovante e devolva o JSON." });
  } else if (entrada.imagem) {
    conteudo.push({ type: "image", source: { type: "base64", media_type: entrada.imagem.tipo, data: entrada.imagem.base64 } });
    conteudo.push({ type: "text", text: "Leia este comprovante fotografado e devolva o JSON." });
  } else {
    conteudo.push({ type: "text", text: "Texto extraído do comprovante:\n\n" + String(entrada.texto).slice(0, 12000) + "\n\nDevolva o JSON." });
  }
  const r = await cliente.messages.create({
    model: MODELO, max_tokens: 1500,
    system: instrucao(CATEGORIAS),
    messages: [{ role: "user", content: conteudo }],
  });
  const texto = (r.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
  const d = extrairJson(texto, "modelo=" + r.model + " parada=" + r.stop_reason + " blocos=" + (r.content || []).map((b) => b.type).join(",") + " uso=" + JSON.stringify(r.usage));
  const valor = Number.isInteger(d.valor_centavos) && d.valor_centavos > 0 ? d.valor_centavos : null;
  const cat = Number.isInteger(d.categoria) && d.categoria >= 0 && d.categoria < CATEGORIAS.length ? d.categoria : null;
  return {
    leitura: {
      data: /^\d{4}-\d{2}-\d{2}$/.test(d.data || "") ? d.data : null,
      valor, fornecedor: d.fornecedor ? String(d.fornecedor).slice(0, 160) : "",
      cnpj: d.cnpj || null, item: d.item ? String(d.item).slice(0, 240) : "",
      doc: ["nf", "cf", "recibo"].includes(d.doc) ? d.doc : "nf",
      categoria: cat, observacao: d.observacao ? String(d.observacao).slice(0, 200) : "",
    },
    uso: { modelo: r.model, entrada: r.usage && r.usage.input_tokens, saida: r.usage && r.usage.output_tokens },
  };
}
