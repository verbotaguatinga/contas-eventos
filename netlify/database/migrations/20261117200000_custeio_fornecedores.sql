-- Forma de custeio do evento: pago pelo caixa da igreja ou com verba adiantada pelos organizadores.
ALTER TABLE eventos ADD COLUMN custeio TEXT NOT NULL DEFAULT 'caixa' CHECK (custeio IN ('caixa', 'adiantado'));
UPDATE eventos SET custeio = 'adiantado' WHERE nome LIKE 'Conferência de Ministros%' OR nome LIKE 'Conferência Avivamento e Milagres%';

-- Memória de fornecedor: guarda a categoria escolhida para sugerir nos lançamentos seguintes.
CREATE TABLE fornecedores (
  chave TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  cnpj TEXT,
  categoria SMALLINT NOT NULL CHECK (categoria BETWEEN 0 AND 9),
  usos INTEGER NOT NULL DEFAULT 1,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO config(chave, valor) VALUES ('cnpj_igreja', '08.676.111/0001-24') ON CONFLICT (chave) DO NOTHING;
