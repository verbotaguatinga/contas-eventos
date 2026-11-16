# Prestação de Contas · Eventos Verbo da Vida de Taguatinga

Lançamento de despesas com comprovante durante o evento, entradas (adiantamentos e inscrições), relatório ao vivo com aviso por categoria de orçamento e PDF de prestação de contas.

- `public/` — interface (HTML, CSS e JavaScript sem etapa de build). `pdf.js` gera o PDF no aparelho com `vendor/pdf-lib.min.js`.
- `lib/api.mjs` — API: acesso, eventos, despesas, comprovantes, entradas, usuários e cópia dos dados.
- `netlify/functions/api.mjs` — função Netlify que expõe a API em `/api/*`.
- `netlify/database/migrations/` — estrutura do banco (Netlify Database / Postgres) e agenda inicial.
- `scripts/test.mjs` — teste de integração da API (`npm test`, com Postgres local). `scripts/dev.mjs` — servidor local (`DATABASE_URL=... SETUP_CODE=... npm run dev`).

## Regras

- Dois perfis: **aprovador** (abre e fecha eventos, define orçamento, registra entradas, gerencia acessos) e **quem lança** (lança despesas e vê o relatório).
- Só um evento aberto por vez; os lançamentos entram no evento aberto. Evento fechado fica bloqueado, com registro de quem aprovou e quando.
- Alterações de despesas ficam no histórico; exclusões são lógicas e aparecem na cópia dos dados.
- Valores são gravados em centavos. Comprovantes (JPG, PNG ou PDF, até 3,5 MB) ficam no banco; fotos são reduzidas no aparelho antes do envio.

## Configuração no Netlify

Variável de ambiente `SETUP_CODE` (12 caracteres ou mais): código de instalação usado no primeiro acesso do aprovador e para recuperar a senha dele. Os demais acessos recebem um código de uso único gerado na aba Acessos.
