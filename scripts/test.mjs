// Teste de integração da API sobre um Postgres local descartável.
// Uso: DATABASE_URL=postgres://dev:dev@localhost/postgres npm test
import assert from "node:assert";
import { readFileSync, readdirSync } from "node:fs";
import pg from "pg";
import { handle } from "../lib/api.mjs";

const base = process.env.DATABASE_URL || "postgres://dev:dev@localhost/postgres";
const nomeDb = "pc_teste_" + Date.now();
const adm = new pg.Client({ connectionString: base }); await adm.connect();
await adm.query(`CREATE DATABASE ${nomeDb}`);
const u = new URL(base); u.pathname = "/" + nomeDb;
const pool = new pg.Pool({ connectionString: u.toString() });
const dir = new URL("../netlify/database/migrations/", import.meta.url);
for (const f of readdirSync(dir).sort()) await pool.query(readFileSync(new URL(f, dir), "utf8"));
process.env.SETUP_CODE = "INSTALACAO-TESTE-123";

function cliente() {
  let ck = "";
  return async (metodo, caminho, corpo, bruto) => {
    const r = await handle(new Request("http://x.test/api/" + caminho, { method: metodo,
      headers: { ...(metodo !== "GET" ? { "content-type": "application/json", origin: "http://x.test" } : {}), host: "x.test", cookie: ck },
      body: metodo !== "GET" ? JSON.stringify(corpo ?? {}) : undefined }), pool);
    const sc = r.headers.get("set-cookie"); if (sc) ck = sc.split(";")[0];
    if (bruto) return { s: r.status, tipo: r.headers.get("content-type"), buf: Buffer.from(await r.arrayBuffer()) };
    return { s: r.status, d: await r.json() };
  };
}
const A = cliente(), L = cliente(), X = cliente();
const jpg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 7)]).toString("base64");
const desp = (o = {}) => ({ data: "2027-05-10", fornecedor: "Super Adega", item: "Bebidas", categoria: 0, valor: 76074, doc: "cf", obs: "", ...o });
let r;

// acesso
assert.equal((await X("GET", "estado")).s, 401);
assert.equal((await X("GET", "auth/situacao")).d.configurado, false);
assert.equal((await A("POST", "auth/primeiro-acesso", { email: "ap@x.com", nome: "Kaleb", codigo: "errado", senha: "senha-bem-longa" })).s, 401);
assert.equal((await A("POST", "auth/primeiro-acesso", { email: "ap@x.com", nome: "Kaleb", codigo: "instalacao-teste-123", senha: "curta" })).s, 400);
r = await A("POST", "auth/primeiro-acesso", { email: "ap@x.com", nome: "Kaleb", codigo: "instalacao-teste-123", senha: "senha-bem-longa" });
assert.equal(r.s, 200); assert.equal(r.d.papel, "aprovador");
assert.equal((await X("GET", "auth/situacao")).d.configurado, true);
r = await A("GET", "estado"); assert.equal(r.d.eventos.length, 5); assert.equal(r.d.categorias.length, 10);
const [cm, avm] = r.d.eventos;
assert.deepEqual(cm.orcamento, {}); assert.equal(avm.logo, "avm");

// usuário que lança
r = await A("POST", "usuarios", { nome: "Maria", email: "la@x.com" }); assert.equal(r.s, 201);
const codigo = r.d.codigo; assert.match(codigo, /^[A-Z0-9]{5}-[A-Z0-9]{5}$/);
assert.equal((await A("POST", "usuarios", { nome: "Maria", email: "la@x.com" })).s, 409);
assert.equal((await L("POST", "auth/login", { email: "la@x.com", senha: "qualquer-coisa" })).s, 401);
assert.equal((await L("POST", "auth/primeiro-acesso", { email: "la@x.com", codigo: "AAAAA-BBBBB", senha: "senha-da-maria" })).s, 401);
r = await L("POST", "auth/primeiro-acesso", { email: "la@x.com", codigo: codigo.toLowerCase(), senha: "senha-da-maria" });
assert.equal(r.s, 200); assert.equal(r.d.papel, "lancador");
assert.equal((await X("POST", "auth/primeiro-acesso", { email: "la@x.com", codigo, senha: "outra-senha-longa" })).s, 401, "convite é de uso único");
assert.equal((await X("POST", "auth/login", { email: "la@x.com", senha: "senha-da-maria" })).s, 200);
assert.equal((await X("POST", "auth/logout")).s, 200); assert.equal((await X("GET", "estado")).s, 401);
// o código de instalação não promove quem lança
assert.equal((await X("POST", "auth/primeiro-acesso", { email: "la@x.com", codigo: "INSTALACAO-TESTE-123", senha: "senha-bem-longa" })).s, 401);

// permissões de quem lança
assert.equal((await L("GET", "usuarios")).s, 403);
assert.equal((await L("POST", "eventos/" + cm.id + "/abrir")).s, 403);
assert.equal((await L("POST", "entradas", { data: "2027-05-01", origem: "x", valor: 100 })).s, 403);
assert.equal((await L("GET", "exportar")).s, 403);
assert.equal((await L("PUT", "eventos/" + cm.id, { nome: "x", inicio: "2027-05-13" })).s, 403);

// sem evento aberto
assert.equal((await L("POST", "despesas", desp())).s, 409);
assert.equal((await A("POST", "entradas", { data: "2027-05-01", origem: "Organização", valor: 100 })).s, 409);

// ciclo do evento
assert.equal((await A("POST", "eventos/" + cm.id + "/abrir")).s, 200);
assert.equal((await A("POST", "eventos/" + avm.id + "/abrir")).s, 409, "só um aberto");
assert.equal((await A("POST", "eventos/" + cm.id + "/abrir")).s, 409);

// despesas
assert.equal((await L("POST", "despesas", desp({ fornecedor: " " }))).s, 400);
assert.equal((await L("POST", "despesas", desp({ valor: 0 }))).s, 400);
assert.equal((await L("POST", "despesas", desp({ valor: 10.5 }))).s, 400);
assert.equal((await L("POST", "despesas", desp({ categoria: 10 }))).s, 400);
assert.equal((await L("POST", "despesas", desp({ data: "2027-02-30" }))).s, 400);
assert.equal((await L("POST", "despesas", desp({ comprovante: { tipo: "image/jpeg", nome: "a.jpg", dados: Buffer.from("nao e jpg").toString("base64") } }))).s, 400);
r = await L("POST", "despesas", desp({ comprovante: { tipo: "image/jpeg", nome: "nota.jpg", dados: jpg } })); assert.equal(r.s, 201); const d1 = r.d.id;
r = await L("POST", "despesas", desp({ item: "Pães", categoria: 1, valor: 53284 })); assert.equal(r.s, 201); const d2 = r.d.id;
r = await L("GET", "eventos/" + cm.id);
assert.equal(r.d.despesas.length, 2);
assert.equal(r.d.despesas.find((x) => x.id === d1).comp_tipo, "image/jpeg");
assert.equal(r.d.despesas.find((x) => x.id === d2).comp_tipo, null);
r = await L("GET", "despesas/" + d1 + "/comprovante", null, true); assert.equal(r.s, 200); assert.equal(r.tipo, "image/jpeg"); assert.equal(r.buf.length, 204);
assert.equal((await X("GET", "despesas/" + d1 + "/comprovante", null, true)).s, 401);
assert.equal((await L("GET", "despesas/" + d2 + "/comprovante", null, true)).s, 404);
// edição com histórico
assert.equal((await A("PUT", "despesas/" + d2, desp({ item: "Pães", categoria: 1, valor: 60000, comprovante: { tipo: "image/jpeg", nome: "n.jpg", dados: jpg } }))).s, 200);
r = await L("GET", "eventos/" + cm.id); const e2 = r.d.despesas.find((x) => x.id === d2);
assert.equal(e2.valor, 60000); assert.equal(e2.hist.length, 1); assert.equal(e2.hist[0].por, "Kaleb"); assert.equal(e2.hist[0].antes.valor, 53284); assert.equal(e2.comp_tipo, "image/jpeg");
assert.equal(e2.criado_por, "Maria");
// entradas
r = await A("POST", "entradas", { data: "2027-04-20", tipo: "Adiantamento", origem: "Organização", finalidade: "Verba geral", valor: 1000000 }); assert.equal(r.s, 201); const en1 = r.d.id;
r = await A("POST", "entradas", { data: "2027-05-13", tipo: "Inscrição", origem: "Inscrições", valor: 40000 }); const en2 = r.d.id;
assert.equal((await A("DELETE", "entradas/" + en2)).s, 200);
r = await A("GET", "estado"); const cmA = r.d.eventos.find((e) => e.id === cm.id);
assert.equal(cmA.gasto, 136074); assert.equal(cmA.entradas, 1000000); assert.equal(cmA.n_despesas, 2);
// orçamento e dados do evento
assert.equal((await A("PUT", "eventos/" + cm.id, { nome: cm.nome, inicio: cm.inicio, fim: cm.fim, logo: "vv", orcamento: { 0: 500000, 6: 150000, 7: -5 } })).s, 400);
assert.equal((await A("PUT", "eventos/" + cm.id, { nome: cm.nome, inicio: cm.inicio, fim: cm.fim, logo: "propria", orcamento: cm.orcamento })).s, 400);
assert.equal((await A("PUT", "eventos/" + cm.id, { nome: cm.nome, inicio: cm.inicio, fim: cm.fim, logo: "vv", orcamento: { 0: 500000, 6: 150000 } })).s, 200);
r = await A("GET", "eventos/" + cm.id); assert.deepEqual(r.d.evento.orcamento, { 0: 500000, 6: 150000 });
// exclusão com rastro
assert.equal((await L("DELETE", "despesas/" + d1)).s, 200);
assert.equal((await L("DELETE", "despesas/" + d1)).s, 409);
assert.equal((await L("GET", "despesas/" + d1 + "/comprovante", null, true)).s, 404);
r = await A("GET", "exportar"); assert.equal(r.d.despesas.length, 2); assert.equal(r.d.despesas.find((x) => x.id === d1).excluida_por, "Maria");
// fechamento bloqueia tudo
assert.equal((await L("POST", "eventos/" + cm.id + "/fechar")).s, 403);
assert.equal((await A("POST", "eventos/" + cm.id + "/fechar")).s, 200);
r = await A("GET", "eventos/" + cm.id); assert.equal(r.d.evento.status, "fechado"); assert.equal(r.d.evento.aprovado_por, "Kaleb"); assert.ok(r.d.evento.aprovado_em);
assert.equal((await L("POST", "despesas", desp())).s, 409);
assert.equal((await L("PUT", "despesas/" + d2, desp())).s, 409);
assert.equal((await L("DELETE", "despesas/" + d2)).s, 409);
assert.equal((await A("DELETE", "entradas/" + en1)).s, 409);
assert.equal((await A("PUT", "eventos/" + cm.id, { nome: "x", inicio: cm.inicio, orcamento: {} })).s, 409);
// outro evento abre; reabertura do primeiro fica impedida
assert.equal((await A("POST", "eventos/" + avm.id + "/abrir")).s, 200);
assert.equal((await A("POST", "eventos/" + cm.id + "/reabrir")).s, 409);
assert.equal((await A("POST", "eventos/" + avm.id + "/fechar")).s, 200);
assert.equal((await A("POST", "eventos/" + cm.id + "/reabrir")).s, 200);
r = await A("GET", "eventos/" + cm.id); assert.equal(r.d.evento.status, "aberto"); assert.equal(r.d.evento.aprovado_em, null);
// novo evento e desativação de acesso
r = await A("POST", "eventos", { nome: "Evento extra", inicio: "2027-12-01" }); assert.equal(r.s, 201);
r = await A("GET", "usuarios"); const maria = r.d.usuarios.find((x) => x.email === "la@x.com");
assert.equal((await A("PUT", "usuarios/" + maria.id, { ativo: false })).s, 200);
assert.equal((await L("GET", "estado")).s, 401, "acesso desativado encerra a sessão");
r = await A("GET", "usuarios"); const eu = r.d.usuarios.find((x) => x.email === "ap@x.com");
assert.equal((await A("PUT", "usuarios/" + eu.id, { ativo: false })).s, 400);
// origem cruzada e formato
r = await handle(new Request("http://x.test/api/auth/login", { method: "POST", headers: { "content-type": "application/json", origin: "http://mal.test", host: "x.test" }, body: "{}" }), pool);
assert.equal(r.status, 403);
// bloqueio por tentativas
for (let i = 0; i < 8; i++) await X("POST", "auth/login", { email: "ap@x.com", senha: "errada-errada" });
assert.equal((await X("POST", "auth/login", { email: "ap@x.com", senha: "senha-bem-longa" })).s, 429);

await pool.end(); await adm.query(`DROP DATABASE ${nomeDb}`); await adm.end();
console.log("ok");
