CREATE TABLE usuarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  papel TEXT NOT NULL CHECK (papel IN ('aprovador', 'lancador')),
  pass_hash TEXT,
  convite_hash TEXT,
  convite_expira TIMESTAMPTZ,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE auth_fail (
  chave TEXT NOT NULL,
  at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX auth_fail_chave ON auth_fail(chave, at);
CREATE TABLE config (
  chave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);
CREATE TABLE eventos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  inicio DATE NOT NULL,
  fim DATE,
  logo TEXT NOT NULL DEFAULT 'vv' CHECK (logo IN ('vv', 'avm', 'propria')),
  arte BYTEA,
  arte_tipo TEXT,
  status TEXT NOT NULL DEFAULT 'planejado' CHECK (status IN ('planejado', 'aberto', 'fechado')),
  orcamento JSONB NOT NULL DEFAULT '{}',
  aprovado_em TIMESTAMPTZ,
  aprovado_por TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Somente um evento aberto por vez.
CREATE UNIQUE INDEX eventos_um_aberto ON eventos (status) WHERE status = 'aberto';
CREATE TABLE despesas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evento_id UUID NOT NULL REFERENCES eventos(id),
  data DATE NOT NULL,
  fornecedor TEXT NOT NULL,
  item TEXT NOT NULL,
  categoria SMALLINT NOT NULL CHECK (categoria BETWEEN 0 AND 9),
  valor BIGINT NOT NULL CHECK (valor > 0),
  doc TEXT NOT NULL CHECK (doc IN ('nf', 'cf', 'recibo')),
  obs TEXT NOT NULL DEFAULT '',
  criado_por TEXT NOT NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  hist JSONB NOT NULL DEFAULT '[]',
  excluida_em TIMESTAMPTZ,
  excluida_por TEXT
);
CREATE INDEX despesas_evento ON despesas(evento_id);
CREATE TABLE comprovantes (
  despesa_id UUID PRIMARY KEY REFERENCES despesas(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL,
  nome TEXT NOT NULL DEFAULT '',
  dados BYTEA NOT NULL,
  enviado_por TEXT NOT NULL,
  enviado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE entradas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evento_id UUID NOT NULL REFERENCES eventos(id),
  data DATE NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('Adiantamento', 'Inscrição')),
  origem TEXT NOT NULL,
  finalidade TEXT NOT NULL DEFAULT '',
  valor BIGINT NOT NULL CHECK (valor > 0),
  criado_por TEXT NOT NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX entradas_evento ON entradas(evento_id);

-- Agenda 2027. O orçamento de cada evento é definido pelo aprovador na tela do sistema.
INSERT INTO eventos (nome, inicio, fim, logo) VALUES
  ('Conferência de Ministros Centro-Oeste/Norte 2027', '2027-05-13', '2027-05-16', 'vv'),
  ('Conferência Avivamento e Milagres 2027', '2027-07-08', '2027-07-10', 'avm'),
  ('Conferência Regional de Líderes e Liderados 2027', '2027-08-07', NULL, 'vv'),
  ('Aniversário da Igreja 2027', '2027-09-24', '2027-09-25', 'vv'),
  ('Reunião Anual da Supervisão Regional 2027', '2027-11-06', NULL, 'vv');
