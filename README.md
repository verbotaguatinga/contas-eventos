# Prestação de Contas · Eventos Verbo da Vida de Taguatinga

Lançamento de despesas com comprovante durante o evento, entradas (adiantamentos e inscrições), relatório ao vivo com aviso por categoria de orçamento e PDF de prestação de contas.

- `public/` — interface (HTML, CSS e JavaScript sem etapa de build). `pdf.js` gera o PDF no aparelho com `vendor/pdf-lib.min.js`; `word.js` gera o relatório em Word (.docx) com `vendor/docx.iife.js`. As duas bibliotecas são carregadas apenas quando a exportação é acionada.
- `lib/api.mjs` — API: acesso, eventos, despesas, comprovantes, entradas, usuários, memória de fornecedor, leitura de comprovante e cópia dos dados.
- `lib/comprovante.mjs` — extrai o texto de PDFs (unpdf) e interpreta notas fiscais brasileiras por regras, sem custo.
- `lib/ia.mjs` — leitura por modelo de visão através do AI Gateway do Netlify, acionada apenas quando as regras não bastam (foto de cupom ou documento fora de padrão).
- `netlify/functions/api.mjs` — função Netlify que expõe a API em `/api/*`.
- `netlify/database/migrations/` — estrutura do banco (Netlify Database / Postgres) e agenda inicial.
- `scripts/test.mjs` — teste de integração da API (`npm test`, com Postgres local). `scripts/dev.mjs` — servidor local (`DATABASE_URL=... SETUP_CODE=... npm run dev`).

## Regras

- Dois perfis: **aprovador** (abre e fecha eventos, define orçamento, registra entradas, gerencia acessos) e **quem lança** (lança despesas e vê o relatório).
- Só um evento aberto por vez; os lançamentos entram no evento aberto. Evento fechado fica bloqueado, com registro de quem aprovou e quando.
- Alterações de despesas ficam no histórico; exclusões são lógicas e aparecem na cópia dos dados.
- As categorias são um catálogo fixo; o índice no vetor `CATEGORIAS` é o identificador gravado no banco, e `ORDEM` define apenas a sequência de exibição.
- Cada evento declara como é custeado: **caixa da igreja** (sem entradas, o relatório mostra o custo do evento) ou **verba adiantada** (com entradas e saldo).
- Ao anexar o comprovante, o sistema lê data, fornecedor, descrição e tipo de documento e preenche o formulário para conferência. O **valor nunca é preenchido automaticamente**: é sempre digitado por quem lança.
- A categoria escolhida para um fornecedor fica guardada e é sugerida nos lançamentos seguintes.
- Valores são gravados em centavos. Comprovantes (JPG, PNG ou PDF, até 3,5 MB) ficam no banco; fotos são reduzidas no aparelho antes do envio.

## Configuração no Netlify

`IA_MODELO` escolhe o modelo usado na leitura de fotos; sem ela, vale o padrão do código. A leitura por IA depende do AI Gateway, que só funciona em produção.

Variável de ambiente `SETUP_CODE` (12 caracteres ou mais): código de instalação usado no primeiro acesso do aprovador e para recuperar a senha dele. Os demais acessos recebem um código de uso único gerado na aba Acessos.
