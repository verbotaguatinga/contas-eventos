/* Prestação de Contas de Eventos — interface. Valores monetários sempre em centavos (inteiros). */
(function () {
  "use strict";

  var S = {
    tela: "carregando",      // carregando | login | app
    modoLogin: "login",      // login | primeiro
    configurado: true,
    user: null, cats: [], docs: {}, eventos: [], fornecedores: [],
    arquivo: null, leitura: null, lendo: false, cnpjLido: null,
    tab: "relatorio", focoId: null, det: null,
    editId: null, evEditId: null, novoEvento: false, confirmar: null,
    usuarios: null, codigo: null, filtro: "", ocupado: false
  };
  var ST = { dentro: "Dentro do orçamento", proximo: "Próximo do limite", ultrapassado: "Ultrapassado", sem: "Sem orçamento" };

  /* ---------- utilitários ---------- */
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function brl(c) {
    var v = Math.round(Math.abs(c)), ip = Math.floor(v / 100), fp = String(v % 100);
    if (fp.length < 2) fp = "0" + fp;
    return (c < 0 ? "-" : "") + "R$ " + String(ip).replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "," + fp;
  }
  function campoValor(c) { return c ? (c / 100).toFixed(2).replace(".", ",") : ""; }
  function parseValor(t) {
    t = String(t || "").replace(/[R$\s]/g, "");
    if (!t) return NaN;
    if (t.indexOf(",") >= 0) t = t.replace(/\./g, "").replace(",", ".");
    if (!/^\d+(\.\d{1,2})?$/.test(t)) return NaN;
    return Math.round(parseFloat(t) * 100);
  }
  function dataBR(d) { var p = String(d || "").split("-"); return p.length === 3 ? p[2] + "/" + p[1] + "/" + p[0] : ""; }
  function periodo(ev) { return ev.fim && ev.fim !== ev.inicio ? dataBR(ev.inicio) + " a " + dataBR(ev.fim) : dataBR(ev.inicio); }
  function quando(iso) {
    try { return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }); }
    catch (e) { return String(iso || ""); }
  }
  function hoje() { var d = new Date(), m = String(d.getMonth() + 1), a = String(d.getDate()); return d.getFullYear() + "-" + (m.length < 2 ? "0" + m : m) + "-" + (a.length < 2 ? "0" + a : a); }
  function toast(t, erro) {
    var el = $("toast"); el.textContent = t; el.className = "toast" + (erro ? " erro" : ""); el.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(function () { el.hidden = true; }, erro ? 5000 : 2600);
  }
  function aprovador() { return S.user && S.user.papel === "aprovador"; }
  function ativo() { for (var i = 0; i < S.eventos.length; i++) if (S.eventos[i].status === "aberto") return S.eventos[i]; return null; }
  function evPorId(id) { for (var i = 0; i < S.eventos.length; i++) if (S.eventos[i].id === id) return S.eventos[i]; return null; }
  function soma(arr) { var t = 0; for (var i = 0; i < arr.length; i++) t += arr[i].valor; return t; }
  function logoSrc(ev) { return ev.logo === "propria" && ev.tem_arte ? "/api/eventos/" + ev.id + "/arte?v=" + encodeURIComponent(ev.updated_at) : "/logos/" + (ev.logo === "avm" ? "avm" : "vv") + ".png"; }

  function api(metodo, caminho, corpo) {
    var opt = { method: metodo, credentials: "same-origin", headers: {} };
    if (metodo !== "GET") { opt.headers["content-type"] = "application/json"; opt.body = JSON.stringify(corpo || {}); }
    return fetch("/api/" + caminho, opt).then(function (r) {
      return r.json().catch(function () { return { erro: "Resposta inesperada do servidor." }; }).then(function (d) {
        if (r.ok) return d;
        if (r.status === 401 && caminho.indexOf("auth/") !== 0) { S.tela = "login"; S.user = null; render(); }
        if (r.status === 413) d.erro = "Arquivo grande demais para envio.";
        var e = new Error(d.erro || "Não foi possível concluir a operação."); e.status = r.status; throw e;
      });
    }, function () { throw new Error("Sem conexão com o servidor. Verifique a internet e tente de novo."); });
  }

  function resumo(det) {
    var ev = det.evento, ds = det.despesas, es = det.entradas;
    var cats = S.cats.map(function (nome, i) {
      var gasto = soma(ds.filter(function (d) { return d.categoria === i; }));
      var orc = Number(ev.orcamento[i]) || 0, st = "sem", pct = 0;
      if (orc > 0) { pct = gasto / orc; st = gasto > orc ? "ultrapassado" : (pct >= 0.8 ? "proximo" : "dentro"); }
      return { i: i, nome: nome, gasto: gasto, orc: orc, pct: pct, st: st };
    });
    var orcTotal = 0; cats.forEach(function (c) { orcTotal += c.orc; });
    return { cats: cats, gasto: soma(ds), entradas: soma(es), orcTotal: orcTotal, pend: ds.filter(function (d) { return !d.comp_tipo; }) };
  }
  window.PCResumo = resumo;

  /* ---------- arquivos ---------- */
  var MAX_BYTES = 3.4 * 1024 * 1024;
  function lerDataURL(file) {
    return new Promise(function (ok, falha) {
      var fr = new FileReader();
      fr.onload = function () { ok(String(fr.result)); };
      fr.onerror = function () { falha(new Error("Não foi possível ler o arquivo.")); };
      fr.readAsDataURL(file);
    });
  }
  // Reduz a imagem no aparelho antes do envio. png=true mantém transparência (arte do evento).
  function prepararArquivo(file, lado, png) {
    var nome = file.name || "arquivo";
    if (file.type === "application/pdf" || /\.pdf$/i.test(nome)) {
      if (png) return Promise.reject(new Error("A arte do evento precisa ser uma imagem."));
      if (file.size > MAX_BYTES) return Promise.reject(new Error("O PDF tem mais de 3,4 MB. Envie uma foto do comprovante ou um PDF menor."));
      return lerDataURL(file).then(function (u) { return { tipo: "application/pdf", nome: nome, dados: u.slice(u.indexOf(",") + 1) }; });
    }
    return new Promise(function (ok, falha) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        var k = Math.min(1, lado / Math.max(img.naturalWidth, img.naturalHeight));
        var w = Math.max(1, Math.round(img.naturalWidth * k)), h = Math.max(1, Math.round(img.naturalHeight * k));
        var cv = document.createElement("canvas"); cv.width = w; cv.height = h;
        var cx = cv.getContext("2d");
        var comoPng = png && (file.type === "image/png" || /\.png$/i.test(nome));
        if (!comoPng) { cx.fillStyle = "#fff"; cx.fillRect(0, 0, w, h); }
        cx.drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        var u = comoPng ? cv.toDataURL("image/png") : cv.toDataURL("image/jpeg", png ? 0.88 : 0.72);
        var dados = u.slice(u.indexOf(",") + 1);
        if (dados.length * 0.75 > MAX_BYTES) return falha(new Error("A imagem ficou grande demais. Tente outra foto."));
        ok({ tipo: comoPng ? "image/png" : "image/jpeg", nome: nome.replace(/\.[^.]+$/, "") + (comoPng ? ".png" : ".jpg"), dados: dados });
      };
      img.onerror = function () { URL.revokeObjectURL(url); falha(new Error("Este aparelho não conseguiu abrir a imagem. Envie em JPG, PNG ou PDF.")); };
      img.src = url;
    });
  }

  /* ---------- carga ---------- */
  function carregar(manterTela) {
    return api("GET", "estado").then(function (d) {
      S.user = d.user; S.cats = d.categorias; S.docs = d.docs; S.eventos = d.eventos; S.fornecedores = d.fornecedores || []; S.tela = "app";
      var a = ativo();
      if (!evPorId(S.focoId)) S.focoId = a ? a.id : null;
      if (!aprovador() && S.tab === "acessos") S.tab = "relatorio";
      if (!S.focoId) { S.det = null; return; }
      return api("GET", "eventos/" + S.focoId).then(function (det) { S.det = det; });
    }).then(function () { render(); }, function (e) {
      if (e.status === 401) return;
      if (!manterTela) { $("app").innerHTML = '<div class="carregando">' + esc(e.message) + '<br><br><button class="btn" data-act="recarregar">Tentar de novo</button></div>'; }
      else toast(e.message, true);
    });
  }
  function iniciar() {
    api("GET", "auth/situacao").then(function (d) { S.configurado = d.configurado; if (!d.configurado) S.modoLogin = "primeiro"; }, function () {})
      .then(function () { return carregar(); });
  }

  /* ---------- telas ---------- */
  function vLogin() {
    var p = S.modoLogin === "primeiro";
    return '<div class="login"><div class="brand"><img src="/logos/vv.png" alt="Verbo da Vida"><h1>Prestação de Contas</h1><p>Eventos Verbo da Vida de Taguatinga</p></div>' +
      '<div class="card"><h2>' + (p ? "Primeiro acesso" : "Entrar") + '</h2>' +
      (p ? '<p class="hint">' + (S.configurado ? "Use o código de acesso que você recebeu e defina a sua senha." : "Instalação do sistema: informe o código de instalação e defina a senha do aprovador.") + '</p>' : '') +
      '<form id="fLogin" novalidate>' +
      (p && !S.configurado ? '<label>Seu nome<input id="lNome" autocomplete="name" maxlength="80"></label>' : '') +
      '<label>E-mail<input id="lEmail" type="email" autocomplete="username" inputmode="email" autocapitalize="none"></label>' +
      (p ? '<label>Código de acesso<input id="lCodigo" autocomplete="off" autocapitalize="characters" spellcheck="false"></label>' : '') +
      '<label>' + (p ? "Crie uma senha (mínimo de 10 caracteres)" : "Senha") + '<input id="lSenha" type="password" autocomplete="' + (p ? "new-password" : "current-password") + '"></label>' +
      (p ? '<label>Repita a senha<input id="lSenha2" type="password" autocomplete="new-password"></label>' : '') +
      '<div class="err" id="lErr" hidden></div>' +
      '<button class="btn primary" type="submit">' + (p ? "Definir senha e entrar" : "Entrar") + '</button></form>' +
      '<p class="hint">' + (p ? '<button class="linkbtn" data-act="modoLogin" data-v="login">Já tenho senha</button>' : '<button class="linkbtn" data-act="modoLogin" data-v="primeiro">Primeiro acesso ou nova senha com código</button>') + '</p></div></div>';
  }

  function vEvento() {
    var ev = S.det && S.det.evento;
    if (!ev) return '<div class="event"><div class="txt"><span class="lbl">Nenhum evento aberto</span><h1>' + (aprovador() ? "Abra um evento na aba Eventos para começar os lançamentos" : "Aguarde o aprovador abrir um evento") + '</h1></div></div>';
    return '<div class="event"><img class="arte' + (ev.logo === "avm" ? " escura" : "") + '" src="' + esc(logoSrc(ev)) + '" alt=""><div class="txt"><span class="lbl">' + (ev.status === "aberto" ? "Evento ativo" : "Evento em consulta") + '</span><h1>' + esc(ev.nome) + '</h1>' +
      '<div class="meta">' + periodo(ev) + ' &nbsp; <span class="pill ' + ev.status + '">' + ev.status + '</span></div>' +
      (ev.status !== "aberto" && ativo() ? '<div><button class="btn small" data-act="foco" data-v="' + ativo().id + '">Voltar ao evento ativo</button></div>' : '') + '</div></div>';
  }
  function vTabs() {
    var adiantado = S.det && S.det.evento.custeio === "adiantado";
    var tabs = [["relatorio", "Relatório"], ["lancar", "Lançar despesa"], ["despesas", "Despesas"]];
    if (adiantado) tabs.push(["entradas", "Entradas"]);
    tabs.push(["eventos", "Eventos"]);
    if (aprovador()) tabs.push(["acessos", "Acessos"]);
    return '<div class="tabs-scroll"><div class="tabs" role="tablist">' + tabs.map(function (t) {
      return '<button class="tab" role="tab" data-act="tab" data-v="' + t[0] + '" aria-selected="' + (S.tab === t[0]) + '">' + t[1] + '</button>';
    }).join("") + '</div></div>';
  }
  function semEvento() { return '<div class="card"><h2>Sem evento em foco</h2><p class="hint">Não há evento aberto. Na aba Eventos é possível consultar eventos anteriores' + (aprovador() ? " ou abrir o próximo." : ".") + '</p></div>'; }

  function vRelatorio() {
    if (!S.det) return semEvento();
    var ev = S.det.evento, r = resumo(S.det), saldo = r.entradas - r.gasto, adiantado = ev.custeio === "adiantado";
    var h = '<div class="kpis">' +
      '<div class="kpi main"><div class="k">' + (adiantado ? "Total gasto" : "Custo do evento") + '</div><div class="v num">' + brl(r.gasto) + '</div></div>' +
      '<div class="kpi"><div class="k">Orçamento total</div><div class="v num">' + (r.orcTotal ? brl(r.orcTotal) : "Sem orçamento") + '</div></div>' +
      (adiantado ? '<div class="kpi"><div class="k">Entradas</div><div class="v num">' + brl(r.entradas) + '</div></div>' +
        '<div class="kpi" style="grid-column:1 / -1"><div class="k">Saldo do evento (entradas menos gastos)</div><div class="v num ' + (saldo < 0 ? "neg" : "pos") + '">' + brl(saldo) + '</div>' +
        '<div class="hint">' + (saldo < 0 ? "Saldo a receber." : "Saldo disponível.") + '</div></div>'
        : '<div class="kpi" style="grid-column:1 / -1"><div class="hint">Evento pago pelo caixa da igreja. O valor acima é o custo total, não há saldo a apurar.</div></div>') + '</div>';
    if (ev.status === "fechado") h += '<div class="card"><p class="hint">Evento fechado. Prestação de contas aprovada por <strong>' + esc(ev.aprovado_por) + '</strong> em ' + quando(ev.aprovado_em) + '.</p></div>';
    var comMov = r.cats.filter(function (c) { return c.gasto > 0 || c.orc > 0; });
    h += '<div class="card"><h2>Gasto por categoria</h2>' + (comMov.length ? comMov.map(function (c) {
      var w = c.orc > 0 ? Math.min(c.pct, 1) * 100 : (c.gasto > 0 ? 100 : 0);
      return '<div class="cat"><div class="row"><span class="name">' + esc(c.nome) + '</span><span class="chip ' + c.st + '">' + ST[c.st] + '</span></div>' +
        '<div class="bar"><i class="' + c.st + '" style="width:' + w.toFixed(1) + '%"></i></div>' +
        '<div class="vals num">' + brl(c.gasto) + (c.orc > 0 ? ' de ' + brl(c.orc) + ' (' + Math.floor(c.pct * 100) + '%)' : '') + '</div></div>';
    }).join("") : '<p class="hint">Nenhuma despesa lançada e nenhum orçamento definido.</p>') + '</div>';
    h += '<div class="card"><h2>Comprovantes pendentes (' + r.pend.length + ')</h2>' + (r.pend.length ? r.pend.map(function (d) {
      return '<div class="item"><div class="row"><span class="what">' + esc(d.item) + '</span><span class="val num">' + brl(d.valor) + '</span></div><div class="sub">' + esc(d.fornecedor) + ' · ' + dataBR(d.data) + '</div>' +
        (ev.status === "aberto" ? '<div class="acts"><button class="btn small" data-act="edit" data-v="' + d.id + '">Anexar comprovante</button></div>' : '') + '</div>';
    }).join("") : '<p class="hint">Nenhuma pendência. Todas as despesas têm comprovante anexado.</p>') + '</div>';
    h += '<div class="card"><h2>Exportar relatório</h2><p class="hint">' + (ev.status === "fechado" ? "Versão final, com o registro da aprovação." : "Enquanto o evento está aberto, o relatório sai como parcial.") +
      ' O PDF com comprovantes inclui cada nota como anexo e serve como arquivo de fechamento. O Word traz o relatório sem anexos, para você completar com o seu texto antes de enviar.</p>' +
      '<div class="acoes"><button class="btn primary" data-act="pdf" data-v="1">PDF com comprovantes</button><button class="btn" data-act="pdf" data-v="0">PDF sem anexos</button>' +
      '<button class="btn" data-act="word">Word editável</button>' +
      (aprovador() ? '<button class="btn" data-act="exportar">Baixar cópia dos dados</button>' : '') + '</div><div class="hint" id="pdfProg" hidden></div></div>';
    return h;
  }

  function vLancar() {
    if (!S.det) return semEvento();
    var ev = S.det.evento;
    if (ev.status !== "aberto") return '<div class="card"><h2>Lançamentos bloqueados</h2><p class="hint">Este evento não está aberto. Só o evento aberto recebe despesas.' + (ativo() ? ' Use “Voltar ao evento ativo” para lançar.' : '') + '</p></div>';
    var d = S.editId ? S.det.despesas.filter(function (x) { return x.id === S.editId; })[0] : null;
    var v = d || { data: hoje(), fornecedor: "", item: "", categoria: "", valor: 0, doc: "nf", obs: "" };
    return '<div class="card"><h2>' + (d ? "Editar despesa" : "Nova despesa") + '</h2>' +
      '<p class="hint">A despesa entra no evento ativo. Lance somente após o pagamento, com nota, cupom ou recibo.</p>' +
      '<form id="fDesp" novalidate>' +
      '<label>' + (d && d.comp_tipo ? "Substituir o comprovante (opcional)" : "Comprovante") + '<input id="dFoto" type="file" accept="image/*,application/pdf"></label>' +
      '<p class="hint">' + (d && d.comp_tipo ? 'Já existe um comprovante anexado. <a href="/api/despesas/' + d.id + '/comprovante" target="_blank" rel="noopener">Ver comprovante</a>. ' : '') +
      'Tire a foto na hora ou escolha um arquivo que já está no celular, inclusive PDF. O sistema lê o comprovante e preenche os campos para você conferir. Sem comprovante, a despesa fica marcada como pendente no relatório.</p>' +
      '<div id="dLeitura">' + caixaLeitura() + '</div>' +
      '<div class="grid2"><label>Data do pagamento<input id="dData" type="date" value="' + esc(v.data) + '"></label>' +
      '<label>Valor (R$)<input id="dValor" inputmode="decimal" placeholder="0,00" autocomplete="off" value="' + campoValor(v.valor) + '"></label></div>' +
      '<label>Fornecedor<input id="dForn" autocomplete="off" maxlength="160" value="' + esc(v.fornecedor) + '"></label>' +
      '<label>O que foi comprado<input id="dItem" autocomplete="off" maxlength="240" value="' + esc(v.item) + '"></label>' +
      '<div class="grid2"><label>Categoria<select id="dCat"><option value="">Selecione</option>' + S.cats.map(function (c, i) { return '<option value="' + i + '"' + (v.categoria === i ? " selected" : "") + '>' + esc(c) + '</option>'; }).join("") + '</select></label>' +
      '<label>Tipo de documento<select id="dDoc">' + Object.keys(S.docs).map(function (k) { return '<option value="' + k + '"' + (v.doc === k ? " selected" : "") + '>' + esc(S.docs[k]) + '</option>'; }).join("") + '</select></label></div>' +
      '<label>Observação (opcional)<textarea id="dObs" maxlength="500">' + esc(v.obs) + '</textarea></label>' +
      '<div class="err" id="dErr" hidden></div>' +
      '<div class="acoes"><button class="btn primary" type="submit" id="dEnviar">' + (d ? "Salvar alteração" : "Lançar despesa") + '</button>' +
      (d ? '<button class="btn" type="button" data-act="cancelEdit">Cancelar</button>' : '') + '</div></form></div>';
  }

  function caixaLeitura() {
    if (S.lendo) return '<div class="aviso">Lendo o comprovante…</div>';
    var L = S.leitura;
    if (!L) return "";
    return '<div class="card" style="background:var(--surface2);margin:0 0 4px">' +
      '<span class="lbl">Leitura do comprovante</span>' +
      (L.valor ? '<div class="row"><span class="what">Valor na nota</span><span class="val num">' + brl(L.valor) + '</span></div>' +
        '<p class="hint">Confira esse valor na nota e digite-o no campo abaixo. O sistema não preenche o valor sozinho.</p>'
        : '<p class="hint">Não foi possível identificar o valor. Digite-o conferindo a nota.</p>') +
      (L.aviso ? '<p class="hint">' + esc(L.aviso) + '</p>' : '') +
      (L.rodape ? '<p class="hint">' + esc(L.rodape) + '</p>' : '') + '</div>';
  }
  function pintaLeitura() { var el = $("dLeitura"); if (el) el.innerHTML = caixaLeitura(); }

  // Procura o fornecedor na memória e devolve a categoria já usada antes.
  function categoriaLembrada(nome, cnpj) {
    var k = chaveForn(nome), i;
    if (cnpj) for (i = 0; i < S.fornecedores.length; i++) if (S.fornecedores[i].cnpj === cnpj) return S.fornecedores[i].categoria;
    if (!k || k.length < 3) return null;
    for (i = 0; i < S.fornecedores.length; i++) if (S.fornecedores[i].chave === k) return S.fornecedores[i].categoria;
    return null;
  }
  function chaveForn(nome) {
    var k = String(nome || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase()
      .replace(/[^A-Z0-9 ]+/g, " ").replace(/\b(LTDA|ME|EPP|EIRELI|SA|MEI|COMERCIO|COMERCIAL|SERVICOS|SOLUCOES)\b/g, " ")
      .replace(/\s+/g, " ").trim();
    return k;
  }

  function lerComprovante(file) {
    S.leitura = null; S.arquivo = null;
    if (!file) { pintaLeitura(); return; }
    S.lendo = true; pintaLeitura();
    prepararArquivo(file, 1600, false).then(function (arq) {
      S.arquivo = arq;
      return api("POST", "ler-comprovante", { comprovante: arq });
    }).then(function (r) {
      S.lendo = false;
      var L = r.leitura || {};
      S.cnpjLido = L.cnpj || null;
      var preenchidos = [];
      function por(id, valor) {
        var el = $(id);
        if (!el || !valor || (el.value && el.value !== hoje())) return;
        el.value = valor; preenchidos.push(id);
      }
      por("dData", L.data); por("dForn", L.fornecedor); por("dItem", L.item);
      if ($("dDoc") && L.doc) $("dDoc").value = L.doc;
      var cat = L.categoria;
      if (cat === null || cat === undefined) cat = categoriaLembrada(L.fornecedor, L.cnpj);
      if ($("dCat") && $("dCat").value === "" && cat !== null && cat !== undefined) { $("dCat").value = String(cat); preenchidos.push("dCat"); }
      var origem = r.fonte === "ia" ? "leitura automática" : r.fonte === "regras+ia" ? "dados da nota e leitura automática" : "dados da nota";
      S.leitura = { valor: L.valor, aviso: r.aviso || "",
        rodape: preenchidos.length ? "Campos preenchidos pela " + origem + ": confira cada um antes de lançar."
          : (r.fonte === "falhou" || r.fonte === "indisponivel" ? "" : "Nada foi preenchido automaticamente.") +
            (L.categoria_fonte === "historico" ? " Categoria sugerida pelo histórico deste fornecedor." : "") };
      if (L.categoria_fonte === "historico" && preenchidos.indexOf("dCat") >= 0) S.leitura.rodape += " A categoria veio do histórico deste fornecedor.";
      pintaLeitura();
    }, function (e) {
      S.lendo = false; S.leitura = { valor: null, aviso: e.message, rodape: "Preencha os campos manualmente; o comprovante será anexado normalmente." };
      pintaLeitura();
    });
  }

  function vDespesas() {
    if (!S.det) return semEvento();
    var ev = S.det.evento, aberto = ev.status === "aberto", todas = S.det.despesas;
    var ds = todas.filter(function (d) { return S.filtro === "" ? true : S.filtro === "pend" ? !d.comp_tipo : d.categoria === Number(S.filtro); });
    var usadas = {}; todas.forEach(function (d) { usadas[d.categoria] = 1; });
    var h = '<div class="card"><h2>Despesas lançadas (' + ds.length + (ds.length !== todas.length ? " de " + todas.length : "") + ')</h2>';
    if (todas.length) h += '<div class="filtros"><select id="fFiltro" aria-label="Filtrar despesas"><option value="">Todas as categorias</option><option value="pend"' + (S.filtro === "pend" ? " selected" : "") + '>Comprovante pendente</option>' +
      S.cats.map(function (c, i) { return usadas[i] ? '<option value="' + i + '"' + (S.filtro === String(i) ? " selected" : "") + '>' + esc(c) + '</option>' : ''; }).join("") + '</select></div>' +
      '<p class="hint">Total exibido: <strong class="num">' + brl(soma(ds)) + '</strong></p>';
    h += ds.length ? ds.map(function (d) {
      var c = S.confirmar === "del:" + d.id, u = d.hist.length ? d.hist[d.hist.length - 1] : null;
      return '<div class="item"><div class="row"><span class="what">' + esc(d.item) + '</span><span class="val num">' + brl(d.valor) + '</span></div>' +
        '<div class="sub">' + esc(d.fornecedor) + ' · ' + dataBR(d.data) + ' · ' + esc(S.cats[d.categoria]) + '</div>' +
        '<div class="tags"><span class="chip sem">' + esc(S.docs[d.doc]) + '</span>' + (d.comp_tipo ? '<a class="chip dentro" href="/api/despesas/' + d.id + '/comprovante" target="_blank" rel="noopener">Ver comprovante</a>' : '<span class="chip proximo">Foto pendente</span>') + '</div>' +
        (d.obs ? '<div class="sub">Obs.: ' + esc(d.obs) + '</div>' : '') +
        '<div class="sub">Lançado por ' + esc(d.criado_por) + ' em ' + quando(d.criado_em) + (u ? ' · alterado por ' + esc(u.por) + ' em ' + quando(u.em) : '') + '</div>' +
        (aberto ? '<div class="acts"><button class="btn small" data-act="edit" data-v="' + d.id + '">Editar</button>' +
          '<button class="btn small danger" data-act="del" data-v="' + d.id + '">' + (c ? "Confirmar exclusão" : "Excluir") + '</button></div>' : '') + '</div>';
    }).join("") : '<p class="hint">' + (todas.length ? "Nenhuma despesa neste filtro." : "Nenhuma despesa lançada neste evento.") + '</p>';
    return h + '</div>';
  }

  function vEntradas() {
    if (!S.det) return semEvento();
    var ev = S.det.evento, es = S.det.entradas;
    var h = '<div class="card"><h2>Entradas do evento</h2><p class="hint">Adiantamentos dos organizadores e inscrições recebidas. Total: <strong class="num">' + brl(soma(es)) + '</strong></p>' +
      (es.length ? es.map(function (e) {
        var c = S.confirmar === "delE:" + e.id;
        return '<div class="item"><div class="row"><span class="what">' + esc(e.tipo) + ' · ' + esc(e.origem) + '</span><span class="val num">' + brl(e.valor) + '</span></div>' +
          '<div class="sub">' + dataBR(e.data) + (e.finalidade ? ' · Finalidade: ' + esc(e.finalidade) : '') + '</div>' +
          (aprovador() && ev.status === "aberto" ? '<div class="acts"><button class="btn small danger" data-act="delE" data-v="' + e.id + '">' + (c ? "Confirmar exclusão" : "Excluir") + '</button></div>' : '') + '</div>';
      }).join("") : '<p class="hint">Nenhuma entrada registrada.</p>') + '</div>';
    if (!aprovador()) return h + '<div class="card"><p class="hint">Somente o aprovador registra entradas.</p></div>';
    if (ev.status !== "aberto") return h;
    return h + '<div class="card"><h2>Registrar entrada</h2><form id="fEnt" novalidate>' +
      '<div class="grid2"><label>Tipo<select id="eTipo"><option>Adiantamento</option><option>Inscrição</option></select></label>' +
      '<label>Data<input id="eData" type="date" value="' + hoje() + '"></label></div>' +
      '<div class="grid2"><label>Origem<input id="eOrigem" autocomplete="off" maxlength="160" placeholder="Quem adiantou ou de onde veio"></label>' +
      '<label>Valor (R$)<input id="eValor" inputmode="decimal" autocomplete="off" placeholder="0,00"></label></div>' +
      '<label>Finalidade (opcional)<input id="eFin" autocomplete="off" maxlength="240"></label>' +
      '<div class="err" id="eErr" hidden></div><div><button class="btn primary" type="submit">Registrar entrada</button></div></form></div>';
  }

  function formEvento(ev) {
    var novo = !ev; ev = ev || { nome: "", inicio: "", fim: "", logo: "vv", orcamento: {} };
    return '<div class="card" id="cardEv"><h2>' + (novo ? "Novo evento" : "Dados e orçamento do evento") + '</h2><form id="fEv" novalidate>' +
      '<label>Nome do evento<input id="vNome" maxlength="160" autocomplete="off" value="' + esc(ev.nome) + '"></label>' +
      '<div class="grid2"><label>Data de início<input id="vInicio" type="date" value="' + esc(ev.inicio) + '"></label><label>Data de término (opcional)<input id="vFim" type="date" value="' + esc(ev.fim || "") + '"></label></div>' +
      '<label>Como o evento é custeado<select id="vCusteio"><option value="caixa"' + (ev.custeio !== "adiantado" ? " selected" : "") + '>Caixa da igreja (sem entradas e sem saldo)</option>' +
      '<option value="adiantado"' + (ev.custeio === "adiantado" ? " selected" : "") + '>Verba adiantada pelos organizadores e inscrições</option></select></label>' +
      '<label>Logo no relatório<select id="vLogo"><option value="vv"' + (ev.logo === "vv" ? " selected" : "") + '>Verbo da Vida</option><option value="avm"' + (ev.logo === "avm" ? " selected" : "") + '>Avivamento e Milagres</option>' +
      (novo ? '' : '<option value="propria"' + (ev.logo === "propria" ? " selected" : "") + '>Arte própria do evento</option>') + '</select></label>' +
      (novo ? '<p class="hint">A arte própria e o orçamento podem ser definidos depois de criar o evento.</p>' :
        '<label>Arte própria (imagem; usada quando a opção acima for “Arte própria do evento”)<input id="vArte" type="file" accept="image/*"></label>' +
        (ev.tem_arte ? '<p class="hint">Já existe uma arte enviada para este evento. Enviar outra substitui a atual.</p>' : '') +
        '<h2>Orçamento por categoria</h2><p class="hint">Deixe em branco as categorias sem orçamento.</p>' +
        S.cats.map(function (c, i) { return '<label>' + esc(c) + '<input id="o' + i + '" inputmode="decimal" autocomplete="off" placeholder="Sem orçamento" value="' + campoValor(ev.orcamento[i]) + '"></label>'; }).join("")) +
      '<div class="err" id="vErr" hidden></div>' +
      '<div class="acoes"><button class="btn primary" type="submit">' + (novo ? "Criar evento" : "Salvar") + '</button><button class="btn" type="button" data-act="evFechar">Cancelar</button></div></form></div>';
  }
  function vEventos() {
    var temAberto = !!ativo();
    var h = '<div class="card"><h2>Eventos</h2><p class="hint">Só um evento fica aberto por vez. Abrir, fechar e definir orçamento são ações do aprovador.</p>' +
      S.eventos.map(function (ev) {
        var acts = "", orc = 0; Object.keys(ev.orcamento).forEach(function (k) { orc += Number(ev.orcamento[k]) || 0; });
        if (aprovador()) {
          if (ev.status === "planejado") acts += '<button class="btn small primary" data-act="abrir" data-v="' + ev.id + '"' + (temAberto ? " disabled" : "") + '>' + (S.confirmar === "abrir:" + ev.id ? "Confirmar abertura" : "Abrir evento") + '</button>';
          if (ev.status === "aberto") acts += '<button class="btn small danger" data-act="fechar" data-v="' + ev.id + '">' + (S.confirmar === "fechar:" + ev.id ? "Confirmar fechamento e aprovação" : "Fechar e aprovar") + '</button>';
          if (ev.status === "fechado") acts += '<button class="btn small" data-act="reabrir" data-v="' + ev.id + '"' + (temAberto ? " disabled" : "") + '>' + (S.confirmar === "reabrir:" + ev.id ? "Confirmar reabertura" : "Reabrir") + '</button>';
          if (ev.status !== "fechado") acts += '<button class="btn small" data-act="evEdit" data-v="' + ev.id + '">Dados e orçamento</button>';
        }
        if (!S.det || S.det.evento.id !== ev.id) acts += '<button class="btn small" data-act="foco" data-v="' + ev.id + '">Consultar</button>';
        return '<div class="item"><div class="row"><span class="what">' + esc(ev.nome) + '</span><span class="pill ' + ev.status + '" style="border:1px solid var(--line);color:var(--fg);background:var(--surface2)">' + ev.status + '</span></div>' +
          '<div class="sub num">' + periodo(ev) + ' · Orçamento ' + (orc ? brl(orc) : "não definido") + ' · Gasto ' + brl(ev.gasto) + ' · Entradas ' + brl(ev.entradas) + '</div>' +
          (ev.aprovado_em ? '<div class="sub">Aprovado por ' + esc(ev.aprovado_por) + ' em ' + quando(ev.aprovado_em) + '</div>' : '') +
          '<div class="acts">' + acts + '</div></div>';
      }).join("") + (temAberto && aprovador() ? '<p class="hint">Para abrir outro evento, feche primeiro o que está aberto.</p>' : '') +
      (aprovador() && !S.novoEvento && !S.evEditId ? '<div><button class="btn" data-act="evNovo">Novo evento</button></div>' : '') + '</div>';
    if (aprovador() && S.evEditId && evPorId(S.evEditId)) h += formEvento(evPorId(S.evEditId));
    if (aprovador() && S.novoEvento) h += formEvento(null);
    return h;
  }

  function vAcessos() {
    if (!S.usuarios) return '<div class="card"><p class="hint">Carregando acessos…</p></div>';
    var h = "";
    if (S.codigo) h += '<div class="card"><h2>Código de acesso de ' + esc(S.codigo.nome) + '</h2><div class="code">' + esc(S.codigo.codigo) + '</div>' +
      '<p class="hint">Envie este código e o endereço do sistema para ' + esc(S.codigo.nome) + '. Na tela de entrada, a pessoa escolhe “Primeiro acesso”, informa o e-mail <strong>' + esc(S.codigo.email) + '</strong>, o código e cria a própria senha. O código vale por ' + S.codigo.dias + ' dias, funciona uma única vez e não será exibido de novo.</p>' +
      '<div><button class="btn small" data-act="codigoOk">Já anotei</button></div></div>';
    h += '<div class="card"><h2>Pessoas com acesso</h2>' + S.usuarios.map(function (u) {
      var eu = u.id === S.user.id, st = !u.ativo ? "Desativado" : u.tem_senha ? "Ativo" : (u.convite_pendente ? "Aguardando primeiro acesso" : "Código vencido");
      return '<div class="item"><div class="row"><span class="what">' + esc(u.nome) + (eu ? " (você)" : "") + '</span><span class="chip ' + (u.ativo && u.tem_senha ? "dentro" : u.ativo ? "proximo" : "sem") + '">' + st + '</span></div>' +
        '<div class="sub">' + esc(u.email) + ' · ' + (u.papel === "aprovador" ? "Aprovador" : "Quem lança") + '</div>' +
        (eu ? '' : '<div class="acts">' + (u.ativo ? '<button class="btn small" data-act="novoCodigo" data-v="' + u.id + '">' + (u.tem_senha ? "Gerar código para nova senha" : "Gerar novo código") + '</button>' : '') +
          '<button class="btn small' + (u.ativo ? " danger" : "") + '" data-act="ativar" data-v="' + u.id + '">' + (u.ativo ? (S.confirmar === "ativar:" + u.id ? "Confirmar desativação" : "Desativar") : "Reativar") + '</button></div>') + '</div>';
    }).join("") + '</div>';
    h += '<div class="card"><h2>Novo acesso</h2><p class="hint">O sistema gera um código de uso único. A própria pessoa cria a senha no primeiro acesso.</p><form id="fUser" novalidate>' +
      '<div class="grid2"><label>Nome<input id="uNome" maxlength="80" autocomplete="off"></label><label>E-mail<input id="uEmail" type="email" inputmode="email" autocapitalize="none" autocomplete="off"></label></div>' +
      '<label>Perfil<select id="uPapel"><option value="lancador">Quem lança (lança despesas e vê o relatório)</option><option value="aprovador">Aprovador (acesso total)</option></select></label>' +
      '<div class="err" id="uErr" hidden></div><div><button class="btn primary" type="submit">Criar acesso e gerar código</button></div></form></div>';
    return h;
  }

  function render() {
    var app = $("app");
    if (S.tela === "login") { app.innerHTML = vLogin(); return; }
    if (S.tela !== "app") return;
    var v = { relatorio: vRelatorio, lancar: vLancar, despesas: vDespesas, entradas: vEntradas, eventos: vEventos, acessos: vAcessos }[S.tab] || vRelatorio;
    app.innerHTML = '<div class="wrap"><div class="top"><div class="sys">Prestação de Contas · Eventos Verbo da Vida de Taguatinga</div>' +
      '<div class="who"><span><strong>' + esc(S.user.nome) + '</strong> · ' + (aprovador() ? "Aprovador" : "Quem lança") + '</span><button class="btn small" data-act="sair">Sair</button></div></div>' +
      vEvento() + vTabs() + '<div id="view" style="display:flex;flex-direction:column;gap:14px">' + v() + '</div></div>';
  }

  /* ---------- ações ---------- */
  function mostraErro(id, msg) { var el = $(id); if (el) { el.textContent = msg; el.hidden = false; } else toast(msg, true); }
  function ocupar(btn, txt) { S.ocupado = true; if (btn) { btn.disabled = true; btn.dataset.txt = btn.textContent; btn.textContent = txt; } }
  function liberar(btn) { S.ocupado = false; if (btn && btn.isConnected) { btn.disabled = false; btn.textContent = btn.dataset.txt || btn.textContent; } }
  function doisToques(chave) { if (S.confirmar === chave) { S.confirmar = null; return true; } S.confirmar = chave; render(); return false; }
  function carregarUsuarios() { return api("GET", "usuarios").then(function (d) { S.usuarios = d.usuarios; render(); }, function (e) { toast(e.message, true); }); }
  function baixar(blob, nome) {
    var a = document.createElement("a"), url = URL.createObjectURL(blob);
    a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
  }
  function slug(s) { return String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, ""); }

  function acaoEvento(btn, id, acao, msg) {
    if (S.ocupado) return;
    ocupar(btn, "Aguarde…");
    api("POST", "eventos/" + id + "/" + acao).then(function () { S.focoId = id; S.editId = null; toast(msg); return carregar(true); }, function (e) { toast(e.message, true); return carregar(true); })
      .then(function () { liberar(btn); });
  }

  document.addEventListener("click", function (ev) {
    var b = ev.target.closest("[data-act]"); if (!b) return;
    var act = b.dataset.act, v = b.dataset.v;
    if (act !== "del" && act !== "delE" && act !== "fechar" && act !== "abrir" && act !== "reabrir" && act !== "ativar") S.confirmar = null;
    if (act === "recarregar") { iniciar(); return; }
    if (act === "modoLogin") { S.modoLogin = v; render(); return; }
    if (act === "tab") { S.tab = v; if (v !== "lancar") S.editId = null; S.leitura = null; S.arquivo = null; S.lendo = false; S.cnpjLido = null; S.evEditId = null; S.novoEvento = false; render(); if (v === "acessos") carregarUsuarios(); window.scrollTo(0, 0); return; }
    if (act === "sair") { api("POST", "auth/logout").then(function () { S.user = null; S.det = null; S.usuarios = null; S.codigo = null; S.tela = "login"; S.modoLogin = "login"; render(); }, function (e) { toast(e.message, true); }); return; }
    if (act === "edit") { S.editId = v; S.tab = "lancar"; render(); window.scrollTo(0, 0); return; }
    if (act === "cancelEdit") { S.editId = null; S.tab = "despesas"; render(); return; }
    if (act === "del") { if (!doisToques("del:" + v) || S.ocupado) return; ocupar(b, "Excluindo…");
      api("DELETE", "despesas/" + v).then(function () { toast("Despesa excluída."); }, function (e) { toast(e.message, true); }).then(function () { S.ocupado = false; return carregar(true); }); return; }
    if (act === "delE") { if (!doisToques("delE:" + v) || S.ocupado) return; ocupar(b, "Excluindo…");
      api("DELETE", "entradas/" + v).then(function () { toast("Entrada excluída."); }, function (e) { toast(e.message, true); }).then(function () { S.ocupado = false; return carregar(true); }); return; }
    if (act === "abrir") { if (doisToques("abrir:" + v)) acaoEvento(b, v, "abrir", "Evento aberto. Os lançamentos entram nele."); return; }
    if (act === "fechar") { if (doisToques("fechar:" + v)) acaoEvento(b, v, "fechar", "Evento fechado e aprovado."); return; }
    if (act === "reabrir") { if (doisToques("reabrir:" + v)) acaoEvento(b, v, "reabrir", "Evento reaberto."); return; }
    if (act === "foco") { S.focoId = v; S.tab = "relatorio"; S.filtro = ""; carregar(true).then(function () { window.scrollTo(0, 0); }); return; }
    if (act === "evEdit") { S.evEditId = v; S.novoEvento = false; render(); var c = $("cardEv"); if (c) c.scrollIntoView({ behavior: "smooth" }); return; }
    if (act === "evNovo") { S.novoEvento = true; S.evEditId = null; render(); var c2 = $("cardEv"); if (c2) c2.scrollIntoView({ behavior: "smooth" }); return; }
    if (act === "evFechar") { S.evEditId = null; S.novoEvento = false; render(); return; }
    if (act === "codigoOk") { S.codigo = null; render(); return; }
    if (act === "novoCodigo") {
      var u = S.usuarios.filter(function (x) { return x.id === v; })[0];
      api("POST", "usuarios/" + v + "/codigo").then(function (d) { S.codigo = { nome: u.nome, email: u.email, codigo: d.codigo, dias: d.validade_dias }; return carregarUsuarios(); }, function (e) { toast(e.message, true); }).then(function () { window.scrollTo(0, 0); });
      return;
    }
    if (act === "ativar") {
      var u2 = S.usuarios.filter(function (x) { return x.id === v; })[0];
      if (u2.ativo && !doisToques("ativar:" + v)) return;
      api("PUT", "usuarios/" + v, { ativo: !u2.ativo }).then(function () { toast(u2.ativo ? "Acesso desativado." : "Acesso reativado."); return carregarUsuarios(); }, function (e) { toast(e.message, true); });
      return;
    }
    if (act === "exportar") {
      api("GET", "exportar").then(function (d) { baixar(new Blob([JSON.stringify(d, null, 2)], { type: "application/json" }), "prestacao_de_contas_dados_" + hoje() + ".json"); toast("Cópia dos dados baixada."); }, function (e) { toast(e.message, true); });
      return;
    }
    if (act === "word") {
      if (S.ocupado || !S.det) return;
      var progW = $("pdfProg"); ocupar(b, "Gerando…");
      if (progW) { progW.hidden = false; progW.textContent = "Preparando o relatório…"; }
      window.PCGerarWord({ det: S.det, cats: S.cats, docs: S.docs, resumo: resumo(S.det), logo: logoSrc(S.det.evento),
        progresso: function (t) { var q = $("pdfProg"); if (q) q.textContent = t; } })
        .then(function (blob) { baixar(blob, "Prestacao_de_Contas_" + slug(S.det.evento.nome) + ".docx"); toast("Word gerado."); },
          function (e) { toast(e.message || "Não foi possível gerar o Word.", true); })
        .then(function () { liberar(b); var q = $("pdfProg"); if (q) q.hidden = true; });
      return;
    }
    if (act === "pdf") {
      if (S.ocupado || !S.det) return;
      var prog = $("pdfProg"); ocupar(b, "Gerando…");
      if (prog) { prog.hidden = false; prog.textContent = "Preparando o relatório…"; }
      window.PCGerarPDF({ det: S.det, cats: S.cats, docs: S.docs, resumo: resumo(S.det), logo: logoSrc(S.det.evento), anexos: v === "1",
        progresso: function (t) { var p = $("pdfProg"); if (p) p.textContent = t; } })
        .then(function (bytes) { baixar(new Blob([bytes], { type: "application/pdf" }), "Prestacao_de_Contas_" + slug(S.det.evento.nome) + ".pdf"); toast("PDF gerado."); },
          function (e) { toast(e.message || "Não foi possível gerar o PDF.", true); })
        .then(function () { liberar(b); var p = $("pdfProg"); if (p) p.hidden = true; });
      return;
    }
  });

  document.addEventListener("change", function (ev) {
    if (ev.target.id === "fFiltro") { S.filtro = ev.target.value; S.confirmar = null; render(); }
    if (ev.target.id === "dFoto") lerComprovante(ev.target.files[0]);
    if (ev.target.id === "dForn" && $("dCat") && $("dCat").value === "") {
      var c = categoriaLembrada(ev.target.value, S.cnpjLido);
      if (c !== null) { $("dCat").value = String(c); toast("Categoria sugerida pelo histórico deste fornecedor."); }
    }
  });

  document.addEventListener("submit", function (ev) {
    var f = ev.target; ev.preventDefault();
    if (S.ocupado) return;
    var btn = f.querySelector('button[type="submit"]');

    if (f.id === "fLogin") {
      var p = S.modoLogin === "primeiro", email = $("lEmail").value.trim(), senha = $("lSenha").value;
      $("lErr").hidden = true;
      if (!email || !senha) return mostraErro("lErr", "Preencha o e-mail e a senha.");
      var corpo = { email: email, senha: senha };
      if (p) {
        if (senha.length < 10) return mostraErro("lErr", "A senha precisa ter ao menos 10 caracteres.");
        if (senha !== $("lSenha2").value) return mostraErro("lErr", "As duas senhas não são iguais.");
        corpo.codigo = $("lCodigo").value; if ($("lNome")) corpo.nome = $("lNome").value;
      }
      ocupar(btn, "Aguarde…");
      api("POST", p ? "auth/primeiro-acesso" : "auth/login", corpo).then(function () { S.configurado = true; S.tab = "relatorio"; S.ocupado = false; return carregar(); },
        function (e) { liberar(btn); mostraErro("lErr", e.message); });
      return;
    }

    if (f.id === "fDesp") {
      $("dErr").hidden = true;
      var valor = parseValor($("dValor").value), cat = $("dCat").value, arq = $("dFoto").files[0], editando = S.editId;
      if (!$("dData").value) return mostraErro("dErr", "Informe a data do pagamento.");
      if (!(valor > 0)) return mostraErro("dErr", "Informe o valor no formato 0,00.");
      if (!$("dForn").value.trim()) return mostraErro("dErr", "Informe o fornecedor.");
      if (!$("dItem").value.trim()) return mostraErro("dErr", "Informe o que foi comprado.");
      if (cat === "") return mostraErro("dErr", "Selecione a categoria.");
      var d = { data: $("dData").value, valor: valor, fornecedor: $("dForn").value, item: $("dItem").value, categoria: Number(cat), doc: $("dDoc").value, obs: $("dObs").value };
      if (S.cnpjLido) d.cnpj = S.cnpjLido;
      ocupar(btn, arq && !S.arquivo ? "Preparando o comprovante…" : "Enviando…");
      (arq ? (S.arquivo ? Promise.resolve(S.arquivo) : prepararArquivo(arq, 1600, false)) : Promise.resolve(null)).then(function (c) {
        if (c) d.comprovante = c;
        btn.textContent = "Enviando…";
        return editando ? api("PUT", "despesas/" + editando, d) : api("POST", "despesas", d);
      }).then(function () {
        S.ocupado = false; S.editId = null; S.leitura = null; S.arquivo = null; S.cnpjLido = null;
        toast(editando ? "Alteração salva." : "Despesa lançada" + (arq ? " com comprovante." : ". Comprovante pendente."));
        if (editando) S.tab = "despesas";
        return carregar(true).then(function () { window.scrollTo(0, 0); });
      }, function (e) { liberar(btn); mostraErro("dErr", e.message); });
      return;
    }

    if (f.id === "fEnt") {
      $("eErr").hidden = true;
      var ve = parseValor($("eValor").value);
      if (!$("eData").value) return mostraErro("eErr", "Informe a data.");
      if (!$("eOrigem").value.trim()) return mostraErro("eErr", "Informe a origem da entrada.");
      if (!(ve > 0)) return mostraErro("eErr", "Informe o valor no formato 0,00.");
      ocupar(btn, "Enviando…");
      api("POST", "entradas", { tipo: $("eTipo").value, data: $("eData").value, origem: $("eOrigem").value, finalidade: $("eFin").value, valor: ve })
        .then(function () { S.ocupado = false; toast("Entrada registrada."); return carregar(true); }, function (e) { liberar(btn); mostraErro("eErr", e.message); });
      return;
    }

    if (f.id === "fEv") {
      $("vErr").hidden = true;
      var id = S.evEditId, base = { nome: $("vNome").value, inicio: $("vInicio").value, fim: $("vFim").value || null, logo: $("vLogo").value, custeio: $("vCusteio").value };
      if (!base.nome.trim()) return mostraErro("vErr", "Informe o nome do evento.");
      if (!base.inicio) return mostraErro("vErr", "Informe a data de início.");
      if (base.fim && base.fim < base.inicio) return mostraErro("vErr", "A data de término não pode ser anterior ao início.");
      if (!id) {
        ocupar(btn, "Criando…");
        api("POST", "eventos", base).then(function () { S.ocupado = false; S.novoEvento = false; toast("Evento criado."); return carregar(true); }, function (e) { liberar(btn); mostraErro("vErr", e.message); });
        return;
      }
      var orc = {};
      for (var i = 0; i < S.cats.length; i++) {
        var t = $("o" + i).value.trim(); if (!t) continue;
        var n = parseValor(t); if (!(n >= 0)) return mostraErro("vErr", "Valor inválido em “" + S.cats[i] + "”. Use o formato 0,00.");
        if (n > 0) orc[i] = n;
      }
      base.orcamento = orc;
      var arte = $("vArte").files[0];
      ocupar(btn, "Salvando…");
      (arte ? prepararArquivo(arte, 1400, true) : Promise.resolve(null)).then(function (a) { if (a) base.arte = a; return api("PUT", "eventos/" + id, base); })
        .then(function () { S.ocupado = false; S.evEditId = null; toast("Evento atualizado."); return carregar(true); }, function (e) { liberar(btn); mostraErro("vErr", e.message); });
      return;
    }

    if (f.id === "fUser") {
      $("uErr").hidden = true;
      var nome = $("uNome").value.trim(), em = $("uEmail").value.trim();
      if (!nome || !em) return mostraErro("uErr", "Informe o nome e o e-mail.");
      ocupar(btn, "Criando…");
      api("POST", "usuarios", { nome: nome, email: em, papel: $("uPapel").value }).then(function (d) {
        S.ocupado = false; S.codigo = { nome: nome, email: em.toLowerCase(), codigo: d.codigo, dias: d.validade_dias };
        return carregarUsuarios().then(function () { window.scrollTo(0, 0); });
      }, function (e) { liberar(btn); mostraErro("uErr", e.message); });
      return;
    }
  });

  iniciar();
})();
