-- Nova categoria "Sala de Ministros" (índice 10), separada de "Alimentação de ministros e convidados".
ALTER TABLE despesas DROP CONSTRAINT IF EXISTS despesas_categoria_check;
ALTER TABLE despesas ADD CONSTRAINT despesas_categoria_check CHECK (categoria BETWEEN 0 AND 10);
ALTER TABLE fornecedores DROP CONSTRAINT IF EXISTS fornecedores_categoria_check;
ALTER TABLE fornecedores ADD CONSTRAINT fornecedores_categoria_check CHECK (categoria BETWEEN 0 AND 10);
