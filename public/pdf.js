/* Geração do relatório em PDF no próprio aparelho (pdf-lib). */
(function () {
  "use strict";
  var W = 595.28, H = 841.89, M = 42, CW = W - 2 * M;
  var libP = null;
  function lib() {
    if (window.PDFLib) return Promise.resolve(window.PDFLib);
    if (!libP) libP = new Promise(function (ok, falha) {
      var s = document.createElement("script"); s.src = "/vendor/pdf-lib.min.js";
      s.onload = function () { ok(window.PDFLib); };
      s.onerror = function () { libP = null; falha(new Error("Não foi possível carregar o gerador de PDF. Verifique a internet.")); };
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
  function limpa(s) {
    return String(s == null ? "" : s).normalize("NFC").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ")
      .replace(/[^\x20-\x7E\xA0-\xFF–—•]/g, "?");
  }
  function brl(c) {
    var v = Math.round(Math.abs(c)), ip = Math.floor(v / 100), fp = String(v % 100);
    if (fp.length < 2) fp = "0" + fp;
    return (c < 0 ? "-" : "") + "R$ " + String(ip).replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "," + fp;
  }
  function dataBR(d) { var p = String(d || "").split("-"); return p.length === 3 ? p[2] + "/" + p[1] + "/" + p[0] : ""; }
  function quando(iso) { return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).replace(",", " às"); }
  var ST = { dentro: "Dentro do orçamento", proximo: "Próximo do limite", ultrapassado: "Ultrapassado", sem: "Sem orçamento" };

  window.PCGerarPDF = function (o) {
    return lib().then(function (L) {
      var rgb = L.rgb, NAVY = rgb(0.035, 0.165, 0.29), BLUE = rgb(0, 0.33, 0.61), GOLD = rgb(1, 0.78, 0.035), WINE = rgb(0.478, 0.067, 0.145),
        INK = rgb(0.07, 0.125, 0.185), MUTED = rgb(0.34, 0.41, 0.5), LINE = rgb(0.85, 0.88, 0.92), SOFT = rgb(0.945, 0.957, 0.972), WHITE = rgb(1, 1, 1), PALE = rgb(0.73, 0.8, 0.88);
      var ev = o.det.evento, r = o.resumo, doc, F, FB, page, y;

      function nova() { page = doc.addPage([W, H]); y = M; }
      function cabe(h) { if (y + h > H - M - 24) nova(); }
      function tx(t, x, yy, size, font, cor) { page.drawText(limpa(t), { x: x, y: H - yy, size: size, font: font || F, color: cor || INK }); }
      function larg(t, size, font) { return (font || F).widthOfTextAtSize(limpa(t), size); }
      function txR(t, xr, yy, size, font, cor) { tx(t, xr - larg(t, size, font), yy, size, font, cor); }
      function quebra(t, w, size, font) {
        var out = [], lin = "";
        limpa(t).split(" ").forEach(function (p) {
          var c = lin ? lin + " " + p : p;
          if (larg(c, size, font) <= w) { lin = c; return; }
          if (lin) { out.push(lin); lin = ""; }
          while (larg(p, size, font) > w) {           // palavra maior que a coluna
            var n = p.length - 1; while (n > 1 && larg(p.slice(0, n), size, font) > w) n--;
            out.push(p.slice(0, n)); p = p.slice(n);
          }
          lin = p;
        });
        out.push(lin);
        return out;
      }
      function ret(x, yy, w, h, cor) { page.drawRectangle({ x: x, y: H - yy - h, width: w, height: h, color: cor }); }
      function secao(t) { cabe(60); y += 18; tx(t.toUpperCase(), M, y, 10.5, FB, BLUE); y += 5; ret(M, y, CW, 1.6, GOLD); y += 12; }
      function par(t, size, cor, font) { quebra(t, CW, size, font).forEach(function (l) { cabe(size + 4); y += size; tx(l, M, y, size, font, cor); y += 4; }); }

      // cols: [{t, w, a}]; linhas: [{c:[...], b:bool, fundo:cor}]
      function tabela(cols, linhas) {
        var size = 8.5, pad = 5, lh = 11;
        function cab() {
          ret(M, y, CW, 18, NAVY); var x = M;
          cols.forEach(function (c) { if (c.a === "r") txR(c.t, x + c.w - pad, y + 12, 8, FB, WHITE); else tx(c.t, x + pad, y + 12, 8, FB, WHITE); x += c.w; });
          y += 18;
        }
        cabe(18 + lh + 8); cab();
        linhas.forEach(function (ln, i) {
          var f = ln.b ? FB : F, cel = ln.c.map(function (t, k) { return quebra(t, cols[k].w - 2 * pad, size, f); });
          var n = Math.max.apply(null, cel.map(function (c) { return c.length; })), h = n * lh + 7;
          if (y + h > H - M - 24) { nova(); cab(); }
          if (ln.fundo) ret(M, y, CW, h, ln.fundo); else if (i % 2 === 1) ret(M, y, CW, h, SOFT);
          var x = M;
          cel.forEach(function (ls, k) {
            ls.forEach(function (l, j) { var yy = y + 10 + j * lh; if (cols[k].a === "r") txR(l, x + cols[k].w - pad, yy, size, f, ln.cor); else tx(l, x + pad, yy, size, f, ln.cor); });
            x += cols[k].w;
          });
          y += h; ret(M, y - 0.5, CW, 0.5, LINE);
        });
      }
      function imagem(b) { return b.tipo === "image/png" ? doc.embedPng(b.buf) : doc.embedJpg(b.buf); }
      function encaixa(img, mw, mh) { var k = Math.min(mw / img.width, mh / img.height, 1.6); return { w: img.width * k, h: img.height * k }; }

      return L.PDFDocument.create().then(function (d) {
        doc = d; doc.setTitle("Prestação de Contas - " + limpa(ev.nome)); doc.setAuthor("Verbo da Vida Taguatinga"); doc.setCreator("Prestação de Contas de Eventos");
        return Promise.all([doc.embedFont(L.StandardFonts.Helvetica), doc.embedFont(L.StandardFonts.HelveticaBold)]);
      }).then(function (fs) {
        F = fs[0]; FB = fs[1]; nova();
        return bytes(o.logo).then(imagem).catch(function () { return null; });
      }).then(function (logo) {
        // ----- identidade -----
        if (logo) {
          if (ev.logo === "propria") { var a = encaixa(logo, CW, 170); page.drawImage(logo, { x: M + (CW - a.w) / 2, y: H - y - a.h, width: a.w, height: a.h }); y += a.h + 12; }
          else if (ev.logo === "avm") { var b = encaixa(logo, 230, 78); ret(M, y, CW, b.h + 24, rgb(0.07, 0.055, 0.047)); page.drawImage(logo, { x: M + (CW - b.w) / 2, y: H - y - 12 - b.h, width: b.w, height: b.h }); y += b.h + 24 + 12; }
          else { var c = encaixa(logo, 150, 78); page.drawImage(logo, { x: M + (CW - c.w) / 2, y: H - y - c.h, width: c.w, height: c.h }); y += c.h + 14; }
        }
        var nomeL = quebra(ev.nome, CW - 32, 15, FB), hb = 30 + nomeL.length * 18 + 20;
        ret(M, y, CW, hb, NAVY); ret(M, y + hb, CW, 3, GOLD);
        tx("PRESTAÇÃO DE CONTAS", M + 16, y + 21, 9, FB, PALE);
        nomeL.forEach(function (l, i) { tx(l, M + 16, y + 42 + i * 18, 15, FB, WHITE); });
        var per = ev.fim && ev.fim !== ev.inicio ? dataBR(ev.inicio) + " a " + dataBR(ev.fim) : dataBR(ev.inicio);
        tx(per + "  ·  Verbo da Vida Taguatinga", M + 16, y + 42 + nomeL.length * 18, 9.5, F, PALE);
        y += hb + 3 + 6;

        // ----- resumo executivo -----
        secao("Resumo executivo");
        var saldo = r.entradas - r.gasto, cx = [["Total gasto", brl(r.gasto)], ["Orçamento total", r.orcTotal ? brl(r.orcTotal) : "Sem orçamento"], ["Entradas", brl(r.entradas)], [saldo < 0 ? "Saldo a receber" : "Saldo disponível", brl(Math.abs(saldo))]];
        var bw = (CW - 3 * 8) / 4;
        cx.forEach(function (k, i) {
          var x = M + i * (bw + 8); ret(x, y, bw, 46, i === 0 ? NAVY : SOFT);
          tx(k[0].toUpperCase(), x + 8, y + 15, 7, FB, i === 0 ? PALE : MUTED);
          var sz = 12.5; while (larg(k[1], sz, FB) > bw - 16 && sz > 7) sz -= 0.5;
          tx(k[1], x + 8, y + 34, sz, FB, i === 0 ? GOLD : (i === 3 && saldo < 0 ? WINE : INK));
        });
        y += 46 + 10;
        if (ev.status === "fechado") par("Evento fechado. Prestação de contas aprovada por " + ev.aprovado_por + " em " + quando(ev.aprovado_em) + ".", 9.5, INK);
        else par("Relatório parcial: o evento ainda não foi fechado e os valores podem mudar. Emitido em " + quando(new Date().toISOString()) + ".", 9.5, WINE, FB);
        var nd = o.det.despesas.length;
        if (nd) par(nd + (nd === 1 ? " despesa lançada; " : " despesas lançadas; ") + (r.pend.length ? r.pend.length + " sem comprovante anexado." : "todas com comprovante anexado."), 9.5, MUTED);

        // ----- por categoria -----
        var comMov = r.cats.filter(function (c) { return c.gasto > 0 || c.orc > 0; });
        if (comMov.length) {
          secao("Gasto por categoria");
          var linhas = comMov.map(function (c) {
            return { c: [c.nome, c.orc ? brl(c.orc) : "—", brl(c.gasto), c.orc ? Math.floor(c.pct * 100) + "%" : "—", ST[c.st]], cor: c.st === "ultrapassado" ? WINE : undefined };
          });
          linhas.push({ c: ["Total", r.orcTotal ? brl(r.orcTotal) : "—", brl(r.gasto), "", ""], b: true, fundo: rgb(0.88, 0.91, 0.95) });
          tabela([{ t: "Categoria", w: 205 }, { t: "Orçamento", w: 82, a: "r" }, { t: "Gasto", w: 82, a: "r" }, { t: "%", w: 40, a: "r" }, { t: "Situação", w: CW - 409 }], linhas);
          par("Situação: “Próximo do limite” a partir de 80% do orçamento da categoria. O percentual compara o gasto com o orçamento.", 8, MUTED);
        }

        // ----- despesas -----
        var anexos = [], numAnexo = {};
        var ordenadas = o.det.despesas.slice().sort(function (a, b) { return a.categoria - b.categoria || (a.data < b.data ? -1 : a.data > b.data ? 1 : 0) || (a.criado_em < b.criado_em ? -1 : 1); });
        if (o.anexos) ordenadas.forEach(function (d) { if (d.comp_tipo) { anexos.push(d); numAnexo[d.id] = anexos.length; } });
        secao("Despesas por categoria");
        if (!ordenadas.length) par("Nenhuma despesa lançada.", 9.5, MUTED);
        r.cats.forEach(function (c) {
          var ds = ordenadas.filter(function (d) { return d.categoria === c.i; }); if (!ds.length) return;
          cabe(70); y += 14; tx(c.nome, M, y, 10, FB, INK); txR(brl(c.gasto), M + CW, y, 10, FB, INK); y += 6;
          tabela([{ t: "Data", w: 54 }, { t: "Fornecedor", w: 118 }, { t: "Descrição", w: 163 }, { t: "Documento", w: 98 }, { t: "Valor", w: CW - 433, a: "r" }], ds.map(function (d) {
            var docu = o.docs[d.doc] + (d.comp_tipo ? (numAnexo[d.id] ? " (Anexo " + numAnexo[d.id] + ")" : "") : " (comprovante pendente)");
            return { c: [dataBR(d.data), d.fornecedor, d.item + (d.obs ? " — Obs.: " + d.obs : ""), docu, brl(d.valor)] };
          }));
        });
        if (ordenadas.length) { cabe(30); y += 8; ret(M, y, CW, 22, NAVY); tx("TOTAL DE DESPESAS", M + 10, y + 15, 9.5, FB, WHITE); txR(brl(r.gasto), M + CW - 10, y + 15, 11, FB, GOLD); y += 22; }

        // ----- entradas e saldo -----
        secao("Entradas");
        if (!o.det.entradas.length) par("Nenhuma entrada registrada.", 9.5, MUTED);
        else {
          var es = o.det.entradas.slice().sort(function (a, b) { return a.data < b.data ? -1 : 1; });
          var le = es.map(function (e) { return { c: [dataBR(e.data), e.tipo, e.origem, e.finalidade || "—", brl(e.valor)] }; });
          le.push({ c: ["Total", "", "", "", brl(r.entradas)], b: true, fundo: rgb(0.88, 0.91, 0.95) });
          tabela([{ t: "Data", w: 54 }, { t: "Tipo", w: 76 }, { t: "Origem", w: 150 }, { t: "Finalidade", w: 153 }, { t: "Valor", w: CW - 433, a: "r" }], le);
        }
        secao("Saldo do evento");
        tabela([{ t: "Composição", w: CW - 120 }, { t: "Valor", w: 120, a: "r" }], [
          { c: ["Entradas (adiantamentos e inscrições)", brl(r.entradas)] }, { c: ["Despesas", "- " + brl(r.gasto)] },
          { c: [saldo < 0 ? "Saldo a receber" : "Saldo disponível", brl(Math.abs(saldo))], b: true, fundo: rgb(0.88, 0.91, 0.95), cor: saldo < 0 ? WINE : undefined }]);

        if (r.pend.length) {
          secao("Comprovantes pendentes");
          tabela([{ t: "Data", w: 54 }, { t: "Fornecedor", w: 150 }, { t: "Descrição", w: CW - 284 }, { t: "Valor", w: 80, a: "r" }], r.pend.map(function (d) { return { c: [dataBR(d.data), d.fornecedor, d.item, brl(d.valor)] }; }));
        }

        // ----- aprovação -----
        cabe(120); secao("Aprovação");
        if (ev.status === "fechado") par("Prestação de contas conferida e aprovada por " + ev.aprovado_por + " em " + quando(ev.aprovado_em) + ", com registro no sistema.", 9.5, INK);
        else par("Aprovação pendente: o evento ainda está em andamento.", 9.5, MUTED);
        y += 46; var sw = (CW - 30) / 2;
        ret(M, y, sw, 0.8, INK); ret(M + sw + 30, y, sw, 0.8, INK);
        tx("Responsável pelos lançamentos", M, y + 12, 8.5, F, MUTED); tx(ev.status === "fechado" ? "Aprovação: " + ev.aprovado_por : "Aprovação", M + sw + 30, y + 12, 8.5, F, MUTED);
        y += 20;

        // ----- anexos -----
        var p = Promise.resolve();
        anexos.forEach(function (d, i) {
          p = p.then(function () {
            if (o.progresso) o.progresso("Incluindo comprovante " + (i + 1) + " de " + anexos.length + "…");
            function topo(extra) {
              nova(); ret(M, y, CW, 34, NAVY);
              tx("ANEXO " + (i + 1) + (extra || ""), M + 10, y + 14, 9, FB, GOLD); txR(brl(d.valor), M + CW - 10, y + 14, 9.5, FB, WHITE);
              var info = d.fornecedor + " · " + d.item + " · " + dataBR(d.data); while (larg(info, 8.5) > CW - 20 && info.length > 10) info = info.slice(0, -2);
              tx(info, M + 10, y + 27, 8.5, F, PALE); y += 34 + 10;
            }
            var areaH = H - 2 * M - 44 - 24;
            return bytes("/api/despesas/" + d.id + "/comprovante").then(function (b) {
              if (b.tipo === "application/pdf") {
                return L.PDFDocument.load(b.buf, { ignoreEncryption: true }).then(function (src) {
                  var idx = src.getPageIndices().slice(0, 6);
                  return doc.embedPdf(src, idx).then(function (pgs) {
                    pgs.forEach(function (pg, k) {
                      topo(pgs.length > 1 ? " · página " + (k + 1) + " de " + pgs.length : "");
                      var s = Math.min(CW / pg.width, areaH / pg.height, 1);
                      page.drawPage(pg, { x: M + (CW - pg.width * s) / 2, y: H - y - pg.height * s, width: pg.width * s, height: pg.height * s });
                    });
                  });
                });
              }
              return imagem(b).then(function (img) { topo(); var a = encaixa(img, CW, areaH); page.drawImage(img, { x: M + (CW - a.w) / 2, y: H - y - a.h, width: a.w, height: a.h }); });
            }).catch(function () { topo(); par("Não foi possível incorporar este arquivo ao PDF. O comprovante continua disponível para consulta no sistema.", 9.5, WINE); });
          });
        });
        return p;
      }).then(function () {
        var pgs = doc.getPages(), rod = "Verbo da Vida Taguatinga · Prestação de contas · " + ev.nome;
        while (larg(rod, 7.5) > CW - 80) rod = rod.slice(0, -2);
        pgs.forEach(function (pg, i) {
          page = pg; ret(M, H - M + 6, CW, 0.5, LINE);
          tx(rod, M, H - M + 18, 7.5, F, MUTED); txR("Página " + (i + 1) + " de " + pgs.length, M + CW, H - M + 18, 7.5, F, MUTED);
        });
        return doc.save();
      });
    });
  };
})();
