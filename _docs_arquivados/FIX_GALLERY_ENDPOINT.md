# Correção do Endpoint de Galeria

## Problema
O endpoint `/api/cardapio/gallery/images` está retornando 404.

## Correções Aplicadas

1. ✅ Rota movida para ANTES das rotas dinâmicas (linha 686)
2. ✅ Função `extractFilename` criada para extrair apenas o nome do arquivo das URLs
3. ✅ Query corrigida para usar nomes de colunas em minúsculas (PostgreSQL)
4. ✅ Filtro `deleted_at IS NULL` adicionado para não incluir itens deletados
5. ✅ Logs de debug adicionados

## Ações Necessárias

### 1. Reiniciar o Servidor
O servidor precisa ser reiniciado para que a nova rota seja registrada.

```bash
# Se estiver rodando localmente
# Parar o servidor (Ctrl+C) e iniciar novamente
npm start

# Se estiver no Render, fazer deploy manual ou aguardar auto-deploy
```

### 2. Verificar se a Rota Está Funcionando
Após reiniciar, testar diretamente:
```bash
curl https://vamos-comemorar-api.onrender.com/api/cardapio/gallery/images
```

### 3. Verificar Logs
Se ainda não funcionar, verificar os logs do servidor para ver se há erros.

## Estrutura do Endpoint

- **URL**: `GET /api/cardapio/gallery/images`
- **Resposta**: 
  ```json
  {
    "success": true,
    "images": [
      {
        "filename": "ABC123.jpg",
        "sourceType": "menu_item",
        "imageType": "item",
        "usageCount": 5,
        "firstItemId": 123
      }
    ],
    "total": 10
  }
  ```

## Busca de Imagens

A galeria busca imagens de:
1. `menu_items.imageurl` (itens do cardápio)
2. `bars.logourl` (logos dos bares)
3. `bars.coverimageurl` (imagens de capa)
4. `bars.popupimageurl` (imagens de popup)

Todas as imagens são normalizadas para extrair apenas o nome do arquivo (sem URL completa).

