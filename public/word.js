/* Geração do relatório em Word (.docx) no próprio aparelho, para edição antes do envio. */
(function () {
  "use strict";
  var libP = null;
  function lib() {
    if (window.docx) return Promise.resolve(window.docx);
    if (!libP) libP = new Promise(function (ok, falha) {
      var s = document.createElement("script"); s.src = "/vendor/docx.iife.js";
      s.onload = function () { ok(window.docx); };
      s.onerror = function () { libP = null; falha(new Error("Não foi possível carregar o gerador de Word. Verifique a internet.")); };
      document.head.appendChild(s);
    });
    return libP;
  }
  function bytes(url) {
    return fetch(url, { credentials: "same-origin" }).then(function (r) {
      if (!r.ok) throw new Error("Falha ao baixar " + url);
      return r.arrayBuffer().then(function (b) { return { buf: new Uint8Array(b), tipo: (r.headers.get("content-type") || "").split(";")[0] }; });
    });
  }
  function brl(c) {
    var v = Math.round(Math.abs(c)), ip = Math.floor(v / 100), fp = String(v % 100);
    if (fp.length < 2) fp = "0" + fp;
    return (c < 0 ? "-" : "") + "R$ " + String(ip).replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "," + fp;
  }
  function dataBR(d) { var p = String(d || "").split("-"); return p.length === 3 ? p[2] + "/" + p[1] + "/" + p[0] : ""; }
  function quando(iso) {
    try { return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).replace(",", " às"); }
    catch (e) { return String(iso || ""); }
  }
  var ST = { dentro: "Dentro do orçamento", proximo: "Próximo do limite", ultrapassado: "Ultrapassado", sem: "Sem orçamento" };
  var NAVY = "092A4A", BLUE = "00549C", GOLD = "FFC709", WINE = "7A1125", INK = "12202F", MUTED = "566A80", LINE = "D9E1EA", SOFT = "EEF2F7", PALE = "BBCDE0";
  var FONTE = "Calibri", LARGURA = 9639;

  window.PCGerarWord = function (o) {
    return lib().then(function (D) {
      var ev = o.det.evento, r = o.resumo, filhos = [];

      function p(texto, op) {
        op = op || {};
        return new D.Paragraph({
          alignment: op.align, spacing: { before: op.antes || 0, after: op.depois === undefined ? 80 : op.depois },
          border: op.borda, keepNext: op.junto,
          children: [new D.TextRun({ text: texto, bold: op.negrito, italics: op.italico, color: op.cor || INK, size: op.tam || 21, font: FONTE, allCaps: op.caixa })]
        });
      }
      function celula(texto, op) {
        op = op || {};
        return new D.TableCell({
          width: { size: op.w, type: D.WidthType.DXA }, shading: op.fundo ? { type: D.ShadingType.CLEAR, fill: op.fundo } : undefined,
          margins: { top: 60, bottom: 60, left: 90, right: 90 },
          verticalAlign: D.VerticalAlign.CENTER,
          children: (Array.isArray(texto) ? texto : [texto]).map(function (t, i) {
            return new D.Paragraph({
              alignment: op.align, spacing: { before: 0, after: 0 },
              children: [new D.TextRun({ text: t, bold: op.negrito, color: (i && op.cor2) || op.cor || INK, size: (i && op.tam2) || op.tam || 19, font: FONTE, allCaps: op.caixa })]
            });
          })
        });
      }
      function semBordas() {
        var n = { style: D.BorderStyle.NONE, size: 0, color: "FFFFFF" };
        return { top: n, bottom: n, left: n, right: n, insideHorizontal: n, insideVertical: n };
      }
      function finas() {
        var l = { style: D.BorderStyle.SINGLE, size: 2, color: LINE }, n = { style: D.BorderStyle.NONE, size: 0, color: "FFFFFF" };
        return { top: l, bottom: l, left: n, right: n, insideHorizontal: l, insideVertical: n };
      }
      function tabela(linhas, bordas) {
        return new D.Table({ width: { size: LARGURA, type: D.WidthType.DXA }, layout: D.TableLayoutType.FIXED, borders: bordas || finas(), rows: linhas });
      }
      // cols: [{t, w, a}]; dados: [{c:[...], negrito, fundo, cor}]
      function grade(cols, dados, faixa) {
        var linhas = [];
        if (faixa) {
          linhas.push(new D.TableRow({ cantSplit: true, tableHeader: true, children: [
            new D.TableCell({ columnSpan: cols.length - 1, shading: { type: D.ShadingType.CLEAR, fill: SOFT }, margins: { top: 90, bottom: 90, left: 90, right: 90 },
              children: [new D.Paragraph({ spacing: { before: 0, after: 0 }, children: [new D.TextRun({ text: faixa.nome, bold: true, size: 21, font: FONTE, color: INK })] })] }),
            new D.TableCell({ shading: { type: D.ShadingType.CLEAR, fill: SOFT }, margins: { top: 90, bottom: 90, left: 90, right: 90 },
              children: [new D.Paragraph({ alignment: D.AlignmentType.RIGHT, spacing: { before: 0, after: 0 }, children: [new D.TextRun({ text: faixa.total, bold: true, size: 21, font: FONTE, color: INK })] })] })] }));
        }
        linhas.push(new D.TableRow({ tableHeader: true, cantSplit: true, children: cols.map(function (c) {
          return celula(c.t, { w: c.w, fundo: NAVY, cor: "FFFFFF", negrito: true, tam: 17, align: c.a === "r" ? D.AlignmentType.RIGHT : D.AlignmentType.LEFT });
        }) }));
        dados.forEach(function (ln, i) {
          linhas.push(new D.TableRow({ cantSplit: true, children: ln.c.map(function (t, k) {
            return celula(t, { w: cols[k].w, fundo: ln.fundo || (i % 2 ? SOFT : undefined), negrito: ln.negrito, cor: ln.cor,
              align: cols[k].a === "r" ? D.AlignmentType.RIGHT : D.AlignmentType.LEFT });
          }) }));
        });
        return tabela(linhas);
      }
      function secao(titulo) {
        filhos.push(new D.Paragraph({
          spacing: { before: 280, after: 120 }, keepNext: true,
          border: { bottom: { style: D.BorderStyle.SINGLE, size: 12, color: GOLD, space: 2 } },
          children: [new D.TextRun({ text: titulo, bold: true, allCaps: true, color: BLUE, size: 20, font: FONTE, characterSpacing: 20 })]
        }));
      }
      function faixa(texto, fundo, cor, tam) {
        return new D.TableRow({ children: [celula(texto, { w: LARGURA, fundo: fundo, cor: cor, negrito: true, tam: tam || 19 })] });
      }

      if (o.progresso) o.progresso("Montando o documento…");
      return bytes(o.logo).then(function (b) { return b; }, function () { return null; }).then(function (logo) {
        // ---------- identidade ----------
        if (logo) {
          var tipo = logo.tipo === "image/jpeg" ? "jpg" : "png";
          var dims = ev.logo === "avm" ? { width: 230, height: 122 } : ev.logo === "propria" ? { width: 420, height: 170 } : { width: 150, height: 96 };
          var img = new D.Paragraph({ alignment: D.AlignmentType.CENTER, spacing: { after: 160 },
            children: [new D.ImageRun({ type: tipo, data: logo.buf, transformation: dims })] });
          if (ev.logo === "avm") {
            filhos.push(new D.Table({ width: { size: LARGURA, type: D.WidthType.DXA }, borders: semBordas(), rows: [new D.TableRow({ children: [
              new D.TableCell({ width: { size: LARGURA, type: D.WidthType.DXA }, shading: { type: D.ShadingType.CLEAR, fill: "120E0C" }, margins: { top: 160, bottom: 160 }, children: [img] })] })] }));
            filhos.push(p("", { depois: 160 }));
          } else filhos.push(img);
        }
        var periodo = ev.fim && ev.fim !== ev.inicio ? dataBR(ev.inicio) + " a " + dataBR(ev.fim) : dataBR(ev.inicio);
        filhos.push(new D.Table({
          width: { size: LARGURA, type: D.WidthType.DXA }, layout: D.TableLayoutType.FIXED,
          borders: { top: { style: D.BorderStyle.SINGLE, size: 18, color: GOLD }, bottom: { style: D.BorderStyle.NONE, size: 0, color: "FFFFFF" },
            left: { style: D.BorderStyle.NONE, size: 0, color: "FFFFFF" }, right: { style: D.BorderStyle.NONE, size: 0, color: "FFFFFF" } },
          rows: [new D.TableRow({ children: [new D.TableCell({
            width: { size: LARGURA, type: D.WidthType.DXA }, shading: { type: D.ShadingType.CLEAR, fill: NAVY }, margins: { top: 200, bottom: 200, left: 220, right: 220 },
            children: [
              new D.Paragraph({ spacing: { after: 60 }, children: [new D.TextRun({ text: "Prestação de contas", bold: true, allCaps: true, color: PALE, size: 18, font: FONTE, characterSpacing: 30 })] }),
              new D.Paragraph({ spacing: { after: 60 }, children: [new D.TextRun({ text: ev.nome, bold: true, color: "FFFFFF", size: 32, font: FONTE })] }),
              new D.Paragraph({ spacing: { after: 0 }, children: [new D.TextRun({ text: periodo + "  ·  Verbo da Vida Taguatinga", color: PALE, size: 19, font: FONTE })] })
            ] })] })]
        }));

        // ---------- resumo executivo ----------
        var saldo = r.entradas - r.gasto, adiantado = ev.custeio === "adiantado";
        secao("Resumo executivo");
        var kpis = adiantado
          ? [["Total gasto", brl(r.gasto)], ["Orçamento total", r.orcTotal ? brl(r.orcTotal) : "Sem orçamento"],
             ["Entradas", brl(r.entradas)], [saldo < 0 ? "Saldo a receber" : "Saldo disponível", brl(Math.abs(saldo))]]
          : [["Custo do evento", brl(r.gasto)], ["Orçamento total", r.orcTotal ? brl(r.orcTotal) : "Sem orçamento"]];
        var wk = Math.floor(LARGURA / kpis.length);
        var larguraDe = function (i) { return i === kpis.length - 1 ? LARGURA - (kpis.length - 1) * wk : wk; };
        filhos.push(tabela([
          new D.TableRow({ children: kpis.map(function (k, i) {
            return celula(k[0], { w: larguraDe(i), fundo: i === 0 ? NAVY : SOFT, cor: i === 0 ? PALE : MUTED, negrito: true, tam: 16, caixa: true }); }) }),
          new D.TableRow({ children: kpis.map(function (k, i) {
            return celula(k[1], { w: larguraDe(i), fundo: i === 0 ? NAVY : SOFT, negrito: true, tam: 24,
              cor: i === 0 ? GOLD : (adiantado && i === 3 && saldo < 0 ? WINE : INK) }); }) })
        ], semBordas()));
        filhos.push(p("", { depois: 120 }));
        if (ev.status === "fechado") filhos.push(p("Evento fechado. Prestação de contas aprovada por " + ev.aprovado_por + " em " + quando(ev.aprovado_em) + ".", { tam: 21 }));
        else filhos.push(p("Relatório parcial: o evento ainda não foi fechado e os valores podem mudar. Emitido em " + quando(new Date().toISOString()) + ".", { tam: 21, negrito: true, cor: WINE }));
        var nd = o.det.despesas.length;
        if (nd) filhos.push(p(nd + (nd === 1 ? " despesa lançada; " : " despesas lançadas; ") + (r.pend.length ? r.pend.length + " sem comprovante anexado." : "todas com comprovante anexado."), { tam: 21, cor: MUTED }));

        secao("Observações da coordenação");
        filhos.push(p("[Substitua este parágrafo pelo texto de abertura: contexto do evento, destaques da execução e justificativas que a diretoria precisa conhecer.]", { tam: 21, italico: true, cor: MUTED }));

        // ---------- gasto por categoria ----------
        var comMov = r.cats.filter(function (c) { return c.gasto > 0 || c.orc > 0; });
        if (comMov.length) {
          secao("Gasto por categoria");
          var dados = comMov.map(function (c) {
            return { c: [c.nome, c.orc ? brl(c.orc) : "—", brl(c.gasto), c.orc ? Math.floor(c.pct * 100) + "%" : "—", ST[c.st]], cor: c.st === "ultrapassado" ? WINE : undefined };
          });
          dados.push({ c: ["Total", r.orcTotal ? brl(r.orcTotal) : "—", brl(r.gasto), "", ""], negrito: true, fundo: "DDE4EC" });
          filhos.push(grade([{ t: "Categoria", w: 3500 }, { t: "Orçamento", w: 1450, a: "r" }, { t: "Gasto", w: 1450, a: "r" }, { t: "%", w: 700, a: "r" }, { t: "Situação", w: 2539 }], dados));
          filhos.push(p("Situação: “Próximo do limite” a partir de 80% do orçamento da categoria. O percentual compara o gasto com o orçamento.", { tam: 16, cor: MUTED, antes: 60 }));
        }

        // ---------- despesas ----------
        secao("Despesas por categoria");
        var ordenadas = o.det.despesas.slice().sort(function (a, b) { return a.categoria - b.categoria || (a.data < b.data ? -1 : a.data > b.data ? 1 : 0) || (a.criado_em < b.criado_em ? -1 : 1); });
        if (!ordenadas.length) filhos.push(p("Nenhuma despesa lançada.", { tam: 21, cor: MUTED }));
        var colsD = [{ t: "Data", w: 1250 }, { t: "Fornecedor", w: 2100 }, { t: "Descrição", w: 3289 }, { t: "Documento", w: 1600 }, { t: "Valor", w: 1400, a: "r" }];
        r.cats.forEach(function (c) {
          var ds = ordenadas.filter(function (d) { return d.categoria === c.i; }); if (!ds.length) return;
          filhos.push(grade(colsD, ds.map(function (d) {
            return { c: [dataBR(d.data), d.fornecedor, d.item + (d.obs ? " — Obs.: " + d.obs : ""), o.docs[d.doc] + (d.comp_tipo ? "" : " (pendente)"), brl(d.valor)] };
          }), { nome: c.nome, total: brl(c.gasto) }));
          filhos.push(p("", { depois: 100 }));
        });
        if (ordenadas.length) filhos.push(tabela([new D.TableRow({ children: [
          celula("Total de despesas", { w: 7639, fundo: NAVY, cor: "FFFFFF", negrito: true, tam: 20, caixa: true }),
          celula(brl(r.gasto), { w: 2000, fundo: NAVY, cor: GOLD, negrito: true, tam: 22, align: D.AlignmentType.RIGHT })] })], semBordas()));

        // ---------- entradas e saldo ----------
        if (adiantado) {
          secao("Entradas");
          if (!o.det.entradas.length) filhos.push(p("Nenhuma entrada registrada.", { tam: 21, cor: MUTED }));
          else {
            var es = o.det.entradas.slice().sort(function (a, b) { return a.data < b.data ? -1 : 1; });
            var le = es.map(function (e) { return { c: [dataBR(e.data), e.tipo, e.origem, e.finalidade || "—", brl(e.valor)] }; });
            le.push({ c: ["Total", "", "", "", brl(r.entradas)], negrito: true, fundo: "DDE4EC" });
            filhos.push(grade([{ t: "Data", w: 1250 }, { t: "Tipo", w: 1400 }, { t: "Origem", w: 2600 }, { t: "Finalidade", w: 2989 }, { t: "Valor", w: 1400, a: "r" }], le));
          }
          secao("Saldo do evento");
          filhos.push(grade([{ t: "Composição", w: 7639 }, { t: "Valor", w: 2000, a: "r" }], [
            { c: ["Entradas (adiantamentos e inscrições)", brl(r.entradas)] },
            { c: ["Despesas", "- " + brl(r.gasto)] },
            { c: [saldo < 0 ? "Saldo a receber" : "Saldo disponível", brl(Math.abs(saldo))], negrito: true, fundo: "DDE4EC", cor: saldo < 0 ? WINE : undefined }]));
        } else {
          filhos.push(p("Evento pago diretamente pelo caixa da igreja: não há verba adiantada nem saldo a apurar. O valor do resumo é o custo total do evento.", { tam: 21, cor: MUTED, antes: 120 }));
        }

        if (r.pend.length) {
          secao("Comprovantes pendentes");
          filhos.push(grade([{ t: "Data", w: 1250 }, { t: "Fornecedor", w: 2600 }, { t: "Descrição", w: 4189 }, { t: "Valor", w: 1600, a: "r" }],
            r.pend.map(function (d) { return { c: [dataBR(d.data), d.fornecedor, d.item, brl(d.valor)] }; })));
        }

        // ---------- aprovação ----------
        secao("Aprovação");
        if (ev.status === "fechado") filhos.push(p("Prestação de contas conferida e aprovada por " + ev.aprovado_por + " em " + quando(ev.aprovado_em) + ", com registro no sistema.", { tam: 21 }));
        else filhos.push(p("Aprovação pendente: o evento ainda está em andamento.", { tam: 21, cor: MUTED }));
        filhos.push(p("Os comprovantes de cada despesa estão arquivados no sistema e no PDF de fechamento, que reúne o relatório e as notas digitalizadas.", { tam: 18, cor: MUTED }));
        filhos.push(p("", { depois: 600 }));
        var assina = { style: D.BorderStyle.SINGLE, size: 6, color: INK };
        filhos.push(new D.Table({ width: { size: LARGURA, type: D.WidthType.DXA }, layout: D.TableLayoutType.FIXED, borders: semBordas(), rows: [new D.TableRow({ children: [
          new D.TableCell({ width: { size: 4400, type: D.WidthType.DXA }, borders: { top: assina }, margins: { top: 80, right: 200 },
            children: [new D.Paragraph({ children: [new D.TextRun({ text: "Responsável pelos lançamentos", color: MUTED, size: 17, font: FONTE })] })] }),
          new D.TableCell({ width: { size: 839, type: D.WidthType.DXA }, children: [new D.Paragraph({ children: [] })] }),
          new D.TableCell({ width: { size: 4400, type: D.WidthType.DXA }, borders: { top: assina }, margins: { top: 80, left: 200 },
            children: [new D.Paragraph({ children: [new D.TextRun({ text: ev.status === "fechado" ? "Aprovação: " + ev.aprovado_por : "Aprovação", color: MUTED, size: 17, font: FONTE })] })] })] })] }));

        // ---------- documento ----------
        var rodape = new D.Footer({ children: [new D.Paragraph({
          border: { top: { style: D.BorderStyle.SINGLE, size: 4, color: LINE, space: 6 } },
          tabStops: [{ type: D.TabStopType.RIGHT, position: LARGURA }],
          children: [
            new D.TextRun({ text: "Verbo da Vida Taguatinga · Prestação de contas · " + ev.nome, color: MUTED, size: 15, font: FONTE }),
            new D.TextRun({ text: "\tPágina ", color: MUTED, size: 15, font: FONTE }),
            new D.TextRun({ children: [D.PageNumber.CURRENT], color: MUTED, size: 15, font: FONTE }),
            new D.TextRun({ text: " de ", color: MUTED, size: 15, font: FONTE }),
            new D.TextRun({ children: [D.PageNumber.TOTAL_PAGES], color: MUTED, size: 15, font: FONTE })]
        })] });
        var doc = new D.Document({
          creator: "Prestação de Contas de Eventos", title: "Prestação de Contas - " + ev.nome, description: "Verbo da Vida Taguatinga",
          styles: { default: { document: { run: { font: FONTE, size: 21, color: INK } } } },
          sections: [{ properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } }, footers: { default: rodape }, children: filhos }]
        });
        if (o.progresso) o.progresso("Gerando o arquivo…");
        return D.Packer.toBlob(doc);
      });
    });
  };
})();
