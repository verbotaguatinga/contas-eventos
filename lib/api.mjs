// API da Prestação de Contas de Eventos. Função pura: recebe Request e um pg.Pool, devolve Response.
import crypto from "node:crypto";
import { chaveFornecedor } from "./texto.mjs";

export const CATEGORIAS = [
  "Alimentação de ministros e convidados",
  "Lanche da equipe",
  "Departamento infantil",
  "Estrutura, móveis e decoração",
  "Material de limpeza, higiene e descartáveis",
  "Equipe de limpeza",
  "Hospedagem",
  "Transporte",
  "Cestas para ministros e cortesias",
  "Diversos",
  "Sala de Ministros",
];
// Ordem de exibição; o índice no vetor acima continua sendo o identificador gravado no banco.
export const ORDEM = [0, 10, 1, 2, 3, 4, 5, 6, 7, 8, 9];
export const DOCS = { nf: "Nota fiscal", cf: "Cupom fiscal", recibo: "Recibo de serviço" };
const TIPOS_ARQUIVO = ["image/jpeg", "image/png", "application/pdf"];
const MAX_ARQUIVO = 3.5 * 1024 * 1024;
const DIAS_SESSAO = 30;
const DIAS_CONVITE = 7;

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers } });
const erro = (status, msg) => json({ erro: msg }, status);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b64 = (b) => Buffer.from(b).toString("base64url");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const sha = (s) => crypto.createHash("sha256").update(String(s)).digest();
const igual = (a, b) => crypto.timingSafeEqual(sha(a), sha(b));

function hashSenha(senha, salt = crypto.randomBytes(16)) {
  const h = crypto.scryptSync(senha, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${b64(salt)}$${b64(h)}`;
}
function confereSenha(senha, guardado) {
  const [, s, h] = String(guardado || "").split("$");
  if (!s || !h) return false;
  const calc = crypto.scryptSync(senha, Buffer.from(s, "base64url"), 64, { N: 16384, r: 8, p: 1 });
  return crypto.timingSafeEqual(calc, Buffer.from(h, "base64url"));
}
function novoCodigo() {
  const alfa = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = crypto.randomBytes(10);
  let s = "";
  for (let i = 0; i < 10; i++) s += alfa[bytes[i] % alfa.length];
  return s.slice(0, 5) + "-" + s.slice(5);
}
const normCodigo = (c) => String(c || "").trim().toUpperCase().replace(/\s+/g, "");

let segredoCache;
async function segredo(q) {
  if (segredoCache) return segredoCache;
  await q("INSERT INTO config(chave, valor) VALUES('session_secret', $1) ON CONFLICT (chave) DO NOTHING", [crypto.randomBytes(48).toString("base64url")]);
  const { rows } = await q("SELECT valor FROM config WHERE chave='session_secret'");
  return (segredoCache = rows[0].valor);
}
function criaSessao(id, secret) {
  const p = b64(JSON.stringify({ u: id, x: Date.now() + DIAS_SESSAO * 864e5 }));
  return `${p}.${crypto.createHmac("sha256", secret).update(p).digest("base64url")}`;
}
async function leSessao(req, q) {
  const m = /(?:^|;\s*)sid=([^;]+)/.exec(req.headers.get("cookie") || "");
  if (!m) return null;
  const [p, sig] = m[1].split(".");
  if (!p || !sig) return null;
  const secret = await segredo(q);
  if (!igual(sig, crypto.createHmac("sha256", secret).update(p).digest("base64url"))) return null;
  try {
    const d = JSON.parse(Buffer.from(p, "base64url").toString());
    if (!(d.x > Date.now()) || !UUID.test(d.u)) return null;
    const { rows } = await q("SELECT id, email, nome, papel FROM usuarios WHERE id=$1 AND ativo AND pass_hash IS NOT NULL", [d.u]);
    return rows[0] || null;
  } catch { return null; }
}
const cookie = (v, maxAge) => `sid=${v}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;

// ---------- validação ----------
const texto = (v, max) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
function dataOk(d) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d || "")) return false;
  const t = new Date(d + "T00:00:00Z");
  return !isNaN(t) && t.toISOString().slice(0, 10) === d;
}
const centavosOk = (v) => Number.isInteger(v) && v > 0 && v < 1e11;
function leArquivo(a) {
  if (!a || typeof a !== "object" || !TIPOS_ARQUIVO.includes(a.tipo) || typeof a.dados !== "string") return { erro: "Arquivo inválido. Envie imagem (JPG ou PNG) ou PDF." };
  const buf = Buffer.from(a.dados, "base64");
  if (!buf.length || buf.length > MAX_ARQUIVO) return { erro: "Arquivo muito grande. O limite é 3,5 MB." };
  const cab = buf.subarray(0, 4).toString("hex");
  const ok = (a.tipo === "image/jpeg" && cab.startsWith("ffd8")) || (a.tipo === "image/png" && cab === "89504e47") || (a.tipo === "application/pdf" && buf.subarray(0, 4).toString() === "%PDF");
  if (!ok) return { erro: "O arquivo não corresponde ao tipo informado." };
  return { tipo: a.tipo, nome: texto(a.nome, 120), buf };
}
function leDespesa(b) {
  const d = { data: b.data, fornecedor: texto(b.fornecedor, 160), item: texto(b.item, 240), categoria: b.categoria, valor: b.valor, doc: b.doc, obs: texto(b.obs, 500) };
  if (!dataOk(d.data)) return { erro: "Informe a data do pagamento." };
  if (!d.fornecedor) return { erro: "Informe o fornecedor." };
  if (!d.item) return { erro: "Informe o que foi comprado." };
  if (!Number.isInteger(d.categoria) || d.categoria < 0 || d.categoria >= CATEGORIAS.length) return { erro: "Selecione a categoria." };
  if (!centavosOk(d.valor)) return { erro: "Informe um valor maior que zero." };
  if (!DOCS[d.doc]) return { erro: "Selecione o tipo de documento." };
  return { d };
}
function leOrcamento(o) {
  const out = {};
  if (!o || typeof o !== "object") return out;
  for (let i = 0; i < CATEGORIAS.length; i++) {
    const v = o[i];
    if (v === undefined || v === null || v === 0 || v === "") continue;
    if (!centavosOk(v)) return null;
    out[i] = v;
  }
  return out;
}

const EV_COLS = `e.id, e.nome, e.inicio::text AS inicio, e.fim::text AS fim, e.logo, (e.arte IS NOT NULL) AS tem_arte, e.status, e.orcamento, e.custeio,
  e.aprovado_em, e.aprovado_por, e.updated_at`;
const DESP_COLS = `d.id, d.evento_id, d.data::text AS data, d.fornecedor, d.item, d.categoria, d.valor::float8 AS valor, d.doc, d.obs,
  d.criado_por, d.criado_em, d.hist`;

// Memória de fornecedor: guarda a categoria escolhida para sugeri-la no próximo lançamento.
async function lembrarFornecedor(q, nome, cnpj, categoria) {
  const chave = chaveFornecedor(nome);
  if (!chave || chave.length < 3) return;
  const doc = /^\d{14}$/.test(String(cnpj || "").replace(/\D/g, "")) ? cnpj : null;
  await q(`INSERT INTO fornecedores(chave, nome, cnpj, categoria) VALUES($1,$2,$3,$4)
    ON CONFLICT (chave) DO UPDATE SET nome=EXCLUDED.nome, cnpj=COALESCE(EXCLUDED.cnpj, fornecedores.cnpj),
      categoria=EXCLUDED.categoria, usos=fornecedores.usos+1, atualizado_em=now()`, [chave, nome, doc, categoria]).catch(() => {});
}

async function tx(pool, fn) {
  const cli = await pool.connect();
  try {
    await cli.query("BEGIN");
    const r = await fn((t, p) => cli.query(t, p));
    await cli.query("COMMIT");
    return r;
  } catch (e) {
    await cli.query("ROLLBACK").catch(() => {});
    throw e;
  } finally { cli.release(); }
}

export async function handle(req, pool) {
  const url = new URL(req.url);
  const partes = url.pathname.replace(/^\/api\/?/, "").split("/").filter(Boolean);
  const m = req.method;
  const q = (text, params) => pool.query(text, params);

  if (m !== "GET") {
    const origem = req.headers.get("origin");
    if (origem && new URL(origem).host !== (req.headers.get("x-forwarded-host") || req.headers.get("host") || url.host)) return erro(403, "Origem não permitida.");
    if (!(req.headers.get("content-type") || "").includes("application/json")) return erro(415, "Formato não aceito.");
  }
  let body = {};
  if (m !== "GET") { try { body = await req.json(); } catch { return erro(400, "JSON inválido."); } }
  if (!body || typeof body !== "object") body = {};

  // ---------- autenticação ----------
  if (partes[0] === "auth") {
    if (partes[1] === "situacao" && m === "GET") {
      const { rows } = await q("SELECT count(*)::int AS n FROM usuarios WHERE pass_hash IS NOT NULL");
      return json({ configurado: rows[0].n > 0 });
    }
    if (partes[1] === "logout" && m === "POST") return json({ ok: true }, 200, { "set-cookie": cookie("", 0) });
    const email = String(body.email || "").trim().toLowerCase(), senha = String(body.senha || "");
    if (m !== "POST" || !EMAIL.test(email) || email.length > 200) return erro(400, "Informe um e-mail válido.");
    const { rows: f } = await q("SELECT count(*)::int AS n FROM auth_fail WHERE chave=$1 AND at > now() - interval '15 minutes'", [email]);
    if (f[0].n >= 8) return erro(429, "Muitas tentativas. Aguarde 15 minutos.");
    const falha = async (msg) => { await q("INSERT INTO auth_fail(chave) VALUES($1)", [email]); await sleep(500); return erro(401, msg); };
    const entra = async (u) => {
      await q("DELETE FROM auth_fail WHERE chave=$1", [email]);
      return json({ id: u.id, email: u.email, nome: u.nome, papel: u.papel }, 200, { "set-cookie": cookie(criaSessao(u.id, await segredo(q)), DIAS_SESSAO * 86400) });
    };

    if (partes[1] === "primeiro-acesso") {
      const codigo = normCodigo(body.codigo);
      if (!codigo) return erro(400, "Informe o código de acesso.");
      if (senha.length < 10 || senha.length > 200) return erro(400, "A senha precisa ter ao menos 10 caracteres.");
      const instalacao = normCodigo(process.env.SETUP_CODE);
      // Código de instalação: cria (ou recupera) o acesso do aprovador.
      if (instalacao.length >= 12 && igual(codigo, instalacao)) {
        const { rows: ex } = await q("SELECT id, papel, nome FROM usuarios WHERE email=$1", [email]);
        if (ex.length && ex[0].papel !== "aprovador") return falha("E-mail ou código de acesso inválido.");
        const nome = texto(body.nome, 80) || (ex[0] && ex[0].nome);
        if (!nome) return erro(400, "Informe o seu nome.");
        const { rows } = await q(`INSERT INTO usuarios(email, nome, papel, pass_hash) VALUES($1,$2,'aprovador',$3)
          ON CONFLICT (email) DO UPDATE SET pass_hash=EXCLUDED.pass_hash, nome=EXCLUDED.nome, ativo=TRUE, convite_hash=NULL, convite_expira=NULL
          RETURNING id, email, nome, papel`, [email, nome, hashSenha(senha)]);
        return entra(rows[0]);
      }
      // Código de convite: gerado pelo aprovador para um usuário já cadastrado.
      const { rows } = await q("SELECT id, email, nome, papel, convite_hash FROM usuarios WHERE email=$1 AND ativo AND convite_hash IS NOT NULL AND convite_expira > now()", [email]);
      if (!rows.length || !igual(sha(codigo).toString("hex"), rows[0].convite_hash)) return falha("E-mail ou código de acesso inválido.");
      await q("UPDATE usuarios SET pass_hash=$2, convite_hash=NULL, convite_expira=NULL WHERE id=$1", [rows[0].id, hashSenha(senha)]);
      return entra(rows[0]);
    }
    if (partes[1] === "login") {
      const { rows } = await q("SELECT id, email, nome, papel, pass_hash FROM usuarios WHERE email=$1 AND ativo", [email]);
      if (!rows.length || !rows[0].pass_hash || !confereSenha(senha, rows[0].pass_hash)) return falha("E-mail ou senha inválidos.");
      return entra(rows[0]);
    }
    return erro(404, "Não encontrado.");
  }

  const user = await leSessao(req, q);
  if (!user) return erro(401, "Sessão expirada.");
  const aprovador = user.papel === "aprovador";
  const soAprovador = () => erro(403, "Ação restrita ao aprovador.");

  const listaEventos = async () => {
    const { rows } = await q(`SELECT ${EV_COLS},
      COALESCE((SELECT sum(valor) FROM despesas d WHERE d.evento_id=e.id AND d.excluida_em IS NULL), 0)::float8 AS gasto,
      COALESCE((SELECT sum(valor) FROM entradas x WHERE x.evento_id=e.id), 0)::float8 AS entradas,
      (SELECT count(*)::int FROM despesas d WHERE d.evento_id=e.id AND d.excluida_em IS NULL) AS n_despesas
      FROM eventos e ORDER BY e.inicio, e.nome`);
    return rows;
  };

  // ---------- estado geral ----------
  if (partes[0] === "estado" && m === "GET") {
    const { rows: forn } = await q("SELECT chave, nome, cnpj, categoria FROM fornecedores ORDER BY usos DESC, atualizado_em DESC LIMIT 400");
    return json({ user, categorias: CATEGORIAS, ordem: ORDEM, docs: DOCS, eventos: await listaEventos(), fornecedores: forn });
  }

  // ---------- eventos ----------
  if (partes[0] === "eventos") {
    const id = partes[1], acao = partes[2];
    if (!id) {
      if (m !== "POST") return erro(405, "Método não aceito.");
      if (!aprovador) return soAprovador();
      const nome = texto(body.nome, 160), fim = body.fim || null, logo = body.logo === "avm" ? "avm" : "vv";
      const custeio = body.custeio === "adiantado" ? "adiantado" : "caixa";
      if (!nome) return erro(400, "Informe o nome do evento.");
      if (!dataOk(body.inicio) || (fim && (!dataOk(fim) || fim < body.inicio))) return erro(400, "Confira as datas do evento.");
      const { rows } = await q("INSERT INTO eventos(nome, inicio, fim, logo, custeio) VALUES($1,$2,$3,$4,$5) RETURNING id", [nome, body.inicio, fim, logo, custeio]);
      return json({ id: rows[0].id }, 201);
    }
    if (!UUID.test(id)) return erro(404, "Evento não encontrado.");

    if (!acao && m === "GET") {
      const { rows: ev } = await q(`SELECT ${EV_COLS} FROM eventos e WHERE e.id=$1`, [id]);
      if (!ev.length) return erro(404, "Evento não encontrado.");
      const { rows: despesas } = await q(`SELECT ${DESP_COLS}, c.tipo AS comp_tipo FROM despesas d LEFT JOIN comprovantes c ON c.despesa_id=d.id
        WHERE d.evento_id=$1 AND d.excluida_em IS NULL ORDER BY d.data DESC, d.criado_em DESC`, [id]);
      const { rows: entradas } = await q(`SELECT id, data::text AS data, tipo, origem, finalidade, valor::float8 AS valor, criado_por, criado_em
        FROM entradas WHERE evento_id=$1 ORDER BY data DESC, criado_em DESC`, [id]);
      return json({ evento: ev[0], despesas, entradas });
    }
    if (acao === "arte" && m === "GET") {
      const { rows } = await q("SELECT arte, arte_tipo FROM eventos WHERE id=$1 AND arte IS NOT NULL", [id]);
      if (!rows.length) return erro(404, "Sem arte.");
      return new Response(rows[0].arte, { headers: { "content-type": rows[0].arte_tipo, "cache-control": "private, no-cache", "x-content-type-options": "nosniff" } });
    }
    if (!aprovador) return soAprovador();

    if (!acao && m === "PUT") {
      const nome = texto(body.nome, 160), fim = body.fim || null;
      if (!nome) return erro(400, "Informe o nome do evento.");
      if (!dataOk(body.inicio) || (fim && (!dataOk(fim) || fim < body.inicio))) return erro(400, "Confira as datas do evento.");
      const orc = leOrcamento(body.orcamento);
      if (!orc) return erro(400, "Confira os valores do orçamento.");
      let arte;
      if (body.arte) { arte = leArquivo(body.arte); if (arte.erro || arte.tipo === "application/pdf") return erro(400, arte.erro || "A arte precisa ser uma imagem."); }
      const { rows: atual } = await q("SELECT status, custeio, (arte IS NOT NULL) AS tem_arte FROM eventos WHERE id=$1", [id]);
      if (!atual.length) return erro(404, "Evento não encontrado.");
      if (atual[0].status === "fechado") return erro(409, "Evento fechado. Reabra para alterar.");
      let logo = ["vv", "avm", "propria"].includes(body.logo) ? body.logo : "vv";
      if (logo === "propria" && !arte && !atual[0].tem_arte) return erro(400, "Envie a arte do evento ou escolha uma das logos.");
      // sem o campo no corpo, mantém o custeio atual
      const custeio = body.custeio === "adiantado" || body.custeio === "caixa" ? body.custeio : atual[0].custeio;
      if (custeio === "caixa" && atual[0].custeio !== "caixa") {
        const { rows: ent } = await q("SELECT count(*)::int AS n FROM entradas WHERE evento_id=$1", [id]);
        if (ent[0].n) return erro(409, "Este evento tem entradas registradas. Exclua-as antes de marcá-lo como pago pelo caixa da igreja.");
      }
      await q(`UPDATE eventos SET nome=$2, inicio=$3, fim=$4, logo=$5, orcamento=$6, custeio=$7, updated_at=now()${arte ? ", arte=$8, arte_tipo=$9" : ""} WHERE id=$1`,
        arte ? [id, nome, body.inicio, fim, logo, JSON.stringify(orc), custeio, arte.buf, arte.tipo] : [id, nome, body.inicio, fim, logo, JSON.stringify(orc), custeio]);
      return json({ ok: true });
    }
    if (m === "POST" && acao === "abrir") {
      try {
        const { rowCount } = await q("UPDATE eventos SET status='aberto', updated_at=now() WHERE id=$1 AND status='planejado'", [id]);
        if (!rowCount) return erro(409, "Somente eventos planejados podem ser abertos.");
      } catch (e) { if (e.code === "23505") return erro(409, "Já existe um evento aberto. Feche-o antes de abrir outro."); throw e; }
      return json({ ok: true });
    }
    if (m === "POST" && acao === "fechar") {
      const { rowCount } = await q("UPDATE eventos SET status='fechado', aprovado_em=now(), aprovado_por=$2, updated_at=now() WHERE id=$1 AND status='aberto'", [id, user.nome]);
      if (!rowCount) return erro(409, "Somente o evento aberto pode ser fechado.");
      return json({ ok: true });
    }
    if (m === "POST" && acao === "reabrir") {
      try {
        const { rowCount } = await q("UPDATE eventos SET status='aberto', aprovado_em=NULL, aprovado_por=NULL, updated_at=now() WHERE id=$1 AND status='fechado'", [id]);
        if (!rowCount) return erro(409, "Somente eventos fechados podem ser reabertos.");
      } catch (e) { if (e.code === "23505") return erro(409, "Já existe um evento aberto. Feche-o antes de reabrir este."); throw e; }
      return json({ ok: true });
    }
    return erro(404, "Não encontrado.");
  }

  // ---------- despesas ----------
  if (partes[0] === "despesas") {
    const id = partes[1];
    if (!id) {
      if (m !== "POST") return erro(405, "Método não aceito.");
      const { d, erro: e1 } = leDespesa(body);
      if (e1) return erro(400, e1);
      let arq = null;
      if (body.comprovante) { arq = leArquivo(body.comprovante); if (arq.erro) return erro(400, arq.erro); }
      const novo = await tx(pool, async (t) => {
        const { rows } = await t(`INSERT INTO despesas(evento_id, data, fornecedor, item, categoria, valor, doc, obs, criado_por)
          SELECT id, $1, $2, $3, $4, $5, $6, $7, $8 FROM eventos WHERE status='aberto' RETURNING id`,
          [d.data, d.fornecedor, d.item, d.categoria, d.valor, d.doc, d.obs, user.nome]);
        if (!rows.length) return null;
        if (arq) await t("INSERT INTO comprovantes(despesa_id, tipo, nome, dados, enviado_por) VALUES($1,$2,$3,$4,$5)", [rows[0].id, arq.tipo, arq.nome, arq.buf, user.nome]);
        return rows[0].id;
      });
      if (!novo) return erro(409, "Não há evento aberto para receber lançamentos.");
      await lembrarFornecedor(q, d.fornecedor, body.cnpj, d.categoria);
      return json({ id: novo }, 201);
    }
    if (!UUID.test(id)) return erro(404, "Despesa não encontrada.");

    if (partes[2] === "comprovante" && m === "GET") {
      const { rows } = await q("SELECT c.tipo, c.dados FROM comprovantes c JOIN despesas d ON d.id=c.despesa_id WHERE c.despesa_id=$1 AND d.excluida_em IS NULL", [id]);
      if (!rows.length) return erro(404, "Comprovante não encontrado.");
      return new Response(rows[0].dados, { headers: { "content-type": rows[0].tipo, "content-disposition": "inline", "cache-control": "private, no-cache",
        "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; sandbox" } });
    }
    const aberta = `SELECT ${DESP_COLS}, (c.despesa_id IS NOT NULL) AS tem_comp FROM despesas d JOIN eventos e ON e.id=d.evento_id LEFT JOIN comprovantes c ON c.despesa_id=d.id
      WHERE d.id=$1 AND d.excluida_em IS NULL AND e.status='aberto' FOR UPDATE OF d`;

    if (m === "PUT" && !partes[2]) {
      const { d, erro: e1 } = leDespesa(body);
      if (e1) return erro(400, e1);
      let arq = null;
      if (body.comprovante) { arq = leArquivo(body.comprovante); if (arq.erro) return erro(400, arq.erro); }
      const ok = await tx(pool, async (t) => {
        const { rows } = await t(aberta, [id]);
        if (!rows.length) return false;
        const a = rows[0], antes = {};
        for (const k of ["data", "fornecedor", "item", "categoria", "valor", "doc", "obs"]) if (a[k] !== d[k]) antes[k] = a[k];
        if (arq) antes.comprovante = a.tem_comp ? "substituído" : "anexado";
        if (!Object.keys(antes).length) return true;
        const reg = { por: user.nome, em: new Date().toISOString(), acao: "alteração", antes };
        await t(`UPDATE despesas SET data=$2, fornecedor=$3, item=$4, categoria=$5, valor=$6, doc=$7, obs=$8, hist = hist || $9::jsonb WHERE id=$1`,
          [id, d.data, d.fornecedor, d.item, d.categoria, d.valor, d.doc, d.obs, JSON.stringify([reg])]);
        if (arq) await t(`INSERT INTO comprovantes(despesa_id, tipo, nome, dados, enviado_por) VALUES($1,$2,$3,$4,$5)
          ON CONFLICT (despesa_id) DO UPDATE SET tipo=EXCLUDED.tipo, nome=EXCLUDED.nome, dados=EXCLUDED.dados, enviado_por=EXCLUDED.enviado_por, enviado_em=now()`,
          [id, arq.tipo, arq.nome, arq.buf, user.nome]);
        return true;
      });
      if (!ok) return erro(409, "A despesa não pode ser alterada: o evento não está aberto ou ela foi excluída.");
      await lembrarFornecedor(q, d.fornecedor, body.cnpj, d.categoria);
      return json({ ok: true });
    }
    if (m === "DELETE" && !partes[2]) {
      const { rowCount } = await q(`UPDATE despesas d SET excluida_em=now(), excluida_por=$2 FROM eventos e
        WHERE d.id=$1 AND e.id=d.evento_id AND e.status='aberto' AND d.excluida_em IS NULL`, [id, user.nome]);
      if (!rowCount) return erro(409, "A despesa não pode ser excluída: o evento não está aberto.");
      return json({ ok: true });
    }
    return erro(404, "Não encontrado.");
  }

  // ---------- entradas ----------
  if (partes[0] === "entradas") {
    if (!aprovador) return soAprovador();
    const id = partes[1];
    if (!id && m === "POST") {
      const tipo = body.tipo === "Inscrição" ? "Inscrição" : "Adiantamento", origem = texto(body.origem, 160), finalidade = texto(body.finalidade, 240);
      if (!dataOk(body.data)) return erro(400, "Informe a data da entrada.");
      if (!origem) return erro(400, "Informe a origem da entrada.");
      if (!centavosOk(body.valor)) return erro(400, "Informe um valor maior que zero.");
      const { rows } = await q(`INSERT INTO entradas(evento_id, data, tipo, origem, finalidade, valor, criado_por)
        SELECT id, $1, $2, $3, $4, $5, $6 FROM eventos WHERE status='aberto' AND custeio='adiantado' RETURNING id`, [body.data, tipo, origem, finalidade, body.valor, user.nome]);
      if (!rows.length) {
        const { rows: ab } = await q("SELECT custeio FROM eventos WHERE status='aberto'");
        return erro(409, ab.length ? "O evento aberto é pago pelo caixa da igreja e não recebe entradas." : "Não há evento aberto para receber entradas.");
      }
      return json({ id: rows[0].id }, 201);
    }
    if (id && UUID.test(id) && m === "DELETE") {
      const { rowCount } = await q("DELETE FROM entradas x USING eventos e WHERE x.id=$1 AND e.id=x.evento_id AND e.status='aberto'", [id]);
      if (!rowCount) return erro(409, "A entrada não pode ser excluída: o evento não está aberto.");
      return json({ ok: true });
    }
    return erro(404, "Não encontrado.");
  }

  // ---------- usuários ----------
  if (partes[0] === "usuarios") {
    if (!aprovador) return soAprovador();
    const id = partes[1];
    const convite = async (uid) => {
      const codigo = novoCodigo();
      await q(`UPDATE usuarios SET convite_hash=$2, convite_expira=now() + interval '${DIAS_CONVITE} days' WHERE id=$1`, [uid, sha(normCodigo(codigo)).toString("hex")]);
      return codigo;
    };
    if (!id && m === "GET") {
      const { rows } = await q(`SELECT id, email, nome, papel, ativo, (pass_hash IS NOT NULL) AS tem_senha,
        (convite_hash IS NOT NULL AND convite_expira > now()) AS convite_pendente, convite_expira FROM usuarios ORDER BY papel, nome`);
      return json({ usuarios: rows });
    }
    if (!id && m === "POST") {
      const email = String(body.email || "").trim().toLowerCase(), nome = texto(body.nome, 80), papel = body.papel === "aprovador" ? "aprovador" : "lancador";
      if (!nome) return erro(400, "Informe o nome.");
      if (!EMAIL.test(email) || email.length > 200) return erro(400, "Informe um e-mail válido.");
      let novo;
      try { novo = (await q("INSERT INTO usuarios(email, nome, papel) VALUES($1,$2,$3) RETURNING id", [email, nome, papel])).rows[0].id; }
      catch (e) { if (e.code === "23505") return erro(409, "Já existe um acesso com esse e-mail."); throw e; }
      return json({ id: novo, codigo: await convite(novo), validade_dias: DIAS_CONVITE }, 201);
    }
    if (!id || !UUID.test(id)) return erro(404, "Não encontrado.");
    if (m === "POST" && partes[2] === "codigo") {
      const { rows } = await q("SELECT id FROM usuarios WHERE id=$1 AND ativo", [id]);
      if (!rows.length) return erro(404, "Acesso não encontrado ou desativado.");
      return json({ codigo: await convite(id), validade_dias: DIAS_CONVITE });
    }
    if (m === "PUT" && !partes[2]) {
      if (id === user.id) return erro(400, "Você não pode desativar o próprio acesso.");
      const { rowCount } = await q("UPDATE usuarios SET ativo=$2, convite_hash=NULL, convite_expira=NULL WHERE id=$1", [id, body.ativo === true]);
      if (!rowCount) return erro(404, "Acesso não encontrado.");
      return json({ ok: true });
    }
    return erro(404, "Não encontrado.");
  }

  // ---------- cópia dos dados ----------
  if (partes[0] === "exportar" && m === "GET") {
    if (!aprovador) return soAprovador();
    const { rows: eventos } = await q(`SELECT ${EV_COLS} FROM eventos e ORDER BY e.inicio`);
    const { rows: despesas } = await q(`SELECT ${DESP_COLS}, d.excluida_em, d.excluida_por, (c.despesa_id IS NOT NULL) AS tem_comprovante
      FROM despesas d LEFT JOIN comprovantes c ON c.despesa_id=d.id ORDER BY d.criado_em`);
    const { rows: entradas } = await q(`SELECT id, evento_id, data::text AS data, tipo, origem, finalidade, valor::float8 AS valor, criado_por, criado_em FROM entradas ORDER BY criado_em`);
    return json({ gerado_em: new Date().toISOString(), observacao: "Valores em centavos.", categorias: CATEGORIAS, eventos, despesas, entradas });
  }

  // ---------- memória de fornecedor: carga a partir das despesas já lançadas ----------
  if (partes[0] === "fornecedores" && partes[1] === "sincronizar" && m === "POST") {
    if (!aprovador) return soAprovador();
    const { rows } = await q(`SELECT DISTINCT ON (fornecedor) fornecedor, categoria FROM despesas
      WHERE excluida_em IS NULL ORDER BY fornecedor, criado_em DESC`);
    let n = 0;
    for (const d of rows) { await lembrarFornecedor(q, d.fornecedor, null, d.categoria); n++; }
    return json({ fornecedores: n });
  }

  // ---------- leitura do comprovante ----------
  if (partes[0] === "ler-comprovante" && m === "POST") {
    const arq = leArquivo(body.comprovante);
    if (arq.erro) return erro(400, arq.erro);
    const { rows: cfg } = await q("SELECT valor FROM config WHERE chave='cnpj_igreja'");
    const cnpjIgreja = cfg.length ? cfg[0].valor : "";
    const vazio = { data: null, valor: null, fornecedor: "", cnpj: null, item: "", doc: "nf", categoria: null };
    let leitura = { ...vazio }, fonte = "regras", aviso = "", uso = null, faltando = [];

    try {
      if (arq.tipo === "application/pdf") {
        const { textoDoPdf, lerTexto } = await import("./comprovante.mjs");
        let txt = "";
        try { txt = await textoDoPdf(arq.buf); } catch { txt = ""; }
        const temTexto = txt.replace(/\s/g, "").length > 40;
        if (temTexto) {
          const r = lerTexto(txt, cnpjIgreja);
          leitura = { ...vazio, ...r, categoria: null };
          faltando = r.faltando || [];
        }
        if (!temTexto || faltando.length) {
          const { lerComIA, gatewayDisponivel } = await import("./ia.mjs");
          if (gatewayDisponivel()) {
            const r = await lerComIA(temTexto ? { texto: txt } : { pdf: arq.buf.toString("base64") }, CATEGORIAS);
            uso = r.uso; fonte = temTexto ? "regras+ia" : "ia";
            for (const k of ["data", "valor", "fornecedor", "item", "cnpj", "categoria"]) if (!leitura[k] && r.leitura[k]) leitura[k] = r.leitura[k];
            if (!temTexto) leitura.doc = r.leitura.doc;
            if (r.leitura.observacao) aviso = r.leitura.observacao;
          } else if (!temTexto) {
            aviso = "Este PDF não tem texto e a leitura automática não está disponível. Preencha os campos manualmente.";
          }
        }
      } else {
        const { lerComIA, gatewayDisponivel } = await import("./ia.mjs");
        if (!gatewayDisponivel()) return json({ leitura: vazio, fonte: "indisponivel", aviso: "A leitura automática de fotos não está disponível. Preencha os campos manualmente." });
        const r = await lerComIA({ imagem: { tipo: arq.tipo, base64: arq.buf.toString("base64") } }, CATEGORIAS);
        leitura = r.leitura; uso = r.uso; fonte = "ia"; aviso = r.leitura.observacao || "";
      }
    } catch (e) {
      console.error("leitura", e);
      return json({ leitura: vazio, fonte: "falhou", aviso: "Não foi possível ler o comprovante automaticamente. Preencha os campos manualmente." });
    }

    // categoria pela memória de fornecedor, que tem precedência sobre a sugestão do modelo
    const chave = chaveFornecedor(leitura.fornecedor);
    if (chave || leitura.cnpj) {
      const { rows } = await q("SELECT categoria FROM fornecedores WHERE chave=$1 OR (cnpj IS NOT NULL AND cnpj=$2) ORDER BY (chave=$1) DESC LIMIT 1",
        [chave || "-", leitura.cnpj || "-"]);
      if (rows.length) { leitura.categoria = rows[0].categoria; leitura.categoria_fonte = "historico"; }
    }
    if (leitura.categoria !== null && !leitura.categoria_fonte) leitura.categoria_fonte = "leitura";
    return json({ leitura, fonte, aviso, uso });
  }

  if (partes[0] === "ia" && partes[1] === "diagnostico" && m === "GET") {
    if (!aprovador) return soAprovador();
    return json({ gateway: Boolean(process.env.ANTHROPIC_BASE_URL), chave: Boolean(process.env.ANTHROPIC_API_KEY), modelo: process.env.IA_MODELO || "claude-haiku-5-5" });
  }

  return erro(404, "Não encontrado.");
}
