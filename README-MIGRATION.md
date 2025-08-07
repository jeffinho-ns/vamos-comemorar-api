# Migração de Dados - Cardápio Digital

Este documento explica como migrar os dados mockados para o banco de dados.

## Pré-requisitos

1. Banco de dados MySQL configurado
2. Tabelas criadas conforme o schema
3. Variáveis de ambiente configuradas

## Estrutura do Banco de Dados

Certifique-se de que as seguintes tabelas existem:

```sql
CREATE TABLE bars (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,
    description TEXT,
    logo_url VARCHAR(500),
    cover_image_url VARCHAR(500),
    address VARCHAR(500),
    rating DECIMAL(3,2),
    reviews_count INT,
    latitude DECIMAL(10,8),
    longitude DECIMAL(11,8),
    amenities JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE menu_categories (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(255) NOT NULL,
    bar_id INT NOT NULL,
    `order` INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (bar_id) REFERENCES bars(id) ON DELETE CASCADE
);

CREATE TABLE menu_items (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    price DECIMAL(10,2) NOT NULL,
    image_url VARCHAR(500),
    category_id INT NOT NULL,
    bar_id INT NOT NULL,
    `order` INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES menu_categories(id) ON DELETE CASCADE,
    FOREIGN KEY (bar_id) REFERENCES bars(id) ON DELETE CASCADE
);

CREATE TABLE toppings (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(255) NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE item_toppings (
    id INT PRIMARY KEY AUTO_INCREMENT,
    item_id INT NOT NULL,
    topping_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (item_id) REFERENCES menu_items(id) ON DELETE CASCADE,
    FOREIGN KEY (topping_id) REFERENCES toppings(id) ON DELETE CASCADE
);
```

## Configuração das Variáveis de Ambiente

Crie um arquivo `.env` na raiz do projeto da API:

```env
DB_HOST=localhost
DB_USER=seu_usuario
DB_PASSWORD=sua_senha
DB_NAME=vamos_comemorar
PORT=3001
```

## Executando a Migração

1. **Instalar dependências** (se ainda não instalou):
   ```bash
   npm install
   ```

2. **Executar o script de migração**:
   ```bash
   node migrate-data.js
   ```

## Dados que Serão Migrados

### Estabelecimentos (4)
- Seu Justino (slug: seujustino)
- Oh Fregues (slug: ohfregues)
- High Line Bar (slug: highline)
- Pracinha do Seu Justino (slug: pracinha)

### Categorias (5)
- Lanches (Seu Justino)
- Acompanhamentos (Seu Justino)
- Pratos Principais (Pracinha)
- Drinks (Oh Fregues)
- Cervejas (High Line)

### Itens do Menu (12)
- X-Burger Clássico
- X-Salada Premium
- Batata Frita
- Onion Rings
- Feijoada Completa
- Picanha na Brasa
- Caipirinha
- Moscow Mule
- Gin Tônica
- Chopp Artesanal
- Cerveja Heineken
- Cerveja Stella Artois

### Toppings (13)
- Bacon, Queijo Extra, Queijo Ralado, Molho Extra
- Farofa Extra, Couve Extra, Vinagrete
- Frutas Extras, Gelo Extra, Gengibre Extra
- Gin Extra, Chopp Extra, Cerveja Extra

## Verificação

Após a migração, você pode verificar se os dados foram inseridos corretamente:

```bash
# Verificar estabelecimentos
curl http://localhost:3001/api/cardapio/bars

# Verificar categorias
curl http://localhost:3001/api/cardapio/categories

# Verificar itens
curl http://localhost:3001/api/cardapio/items
```

## Próximos Passos

1. **Iniciar a API**:
   ```bash
   npm start
   ```

2. **Testar o Next.js**:
   - Acesse: http://localhost:3000/cardapio
   - Acesse: http://localhost:3000/admin/cardapio

3. **Verificar funcionalidades**:
   - Listagem de estabelecimentos
   - Visualização de cardápios individuais
   - CRUD no painel administrativo

## Troubleshooting

### Erro de Conexão com Banco
- Verifique se o MySQL está rodando
- Confirme as credenciais no arquivo `.env`
- Teste a conexão manualmente

### Erro de Tabelas Não Encontradas
- Execute o script SQL para criar as tabelas
- Verifique se o banco de dados existe

### Erro de Chave Estrangeira
- Certifique-se de que as tabelas foram criadas na ordem correta
- Verifique se as constraints estão corretas

## Limpeza de Dados

Se precisar limpar os dados e começar novamente:

```bash
# O script de migração já faz isso automaticamente
# Mas você pode executar manualmente se necessário:

mysql -u seu_usuario -p vamos_comemorar -e "
DELETE FROM item_toppings;
DELETE FROM toppings;
DELETE FROM menu_items;
DELETE FROM menu_categories;
DELETE FROM bars;
"
``` 