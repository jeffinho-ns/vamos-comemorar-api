# Como Executar o Script de Permissões para analista@reserva.com

## 📋 Objetivo
Configurar as permissões do usuário `analista@reserva.com` para que ele veja **APENAS** o estabelecimento "Reserva Rooftop".

## 🚀 Formas de Executar

### Opção 1: Via pgAdmin (Recomendado)
1. Abra o pgAdmin
2. Conecte-se ao banco de dados
3. Clique com o botão direito no banco de dados → **Query Tool**
4. Abra o arquivo `vamos-comemorar-api/scripts/set_analista_reserva_permissions.sql`
5. Execute o script completo (F5 ou botão "Execute")

### Opção 2: Via psql (Linha de Comando)
```bash
psql -U seu_usuario -d seu_banco -f vamos-comemorar-api/scripts/set_analista_reserva_permissions.sql
```

### Opção 3: Via DBeaver ou outro cliente SQL
1. Conecte-se ao banco de dados PostgreSQL
2. Abra o arquivo `set_analista_reserva_permissions.sql`
3. Execute o script completo

### Opção 4: Copiar e Colar no Console SQL
1. Abra o arquivo `set_analista_reserva_permissions.sql`
2. Copie todo o conteúdo
3. Cole no console SQL do seu cliente de banco de dados
4. Execute

## ✅ O que o Script Faz

1. **Verifica** se o usuário `analista@reserva.com` existe
2. **Verifica** qual é o ID do estabelecimento "Reserva Rooftop"
3. **Remove** todas as permissões existentes do usuário (para garantir que veja apenas Reserva Rooftop)
4. **Cria** permissão apenas para Reserva Rooftop com acesso completo:
   - ✅ Pode editar OS
   - ✅ Pode editar Detalhes Operacionais
   - ✅ Pode visualizar e baixar OS
   - ✅ Pode criar OS e Detalhes Operacionais
   - ✅ Pode gerenciar reservas e check-ins
   - ✅ Pode visualizar relatórios
5. **Verifica** as permissões criadas

## 🔍 Verificação

Após executar o script, você pode verificar as permissões com:

```sql
SELECT 
  uep.id,
  u.name as user_name,
  u.email as user_email,
  COALESCE(p.name, b.name) as establishment_name,
  uep.establishment_id,
  uep.is_active
FROM user_establishment_permissions uep
LEFT JOIN users u ON uep.user_id = u.id
LEFT JOIN places p ON uep.establishment_id = p.id
LEFT JOIN bars b ON uep.establishment_id = b.id
WHERE uep.user_email = 'analista@reserva.com'
ORDER BY COALESCE(p.name, b.name);
```

O resultado deve mostrar **apenas** o estabelecimento "Reserva Rooftop".

## ⚠️ Importante

- O script pode ser executado múltiplas vezes sem problemas (usa `ON CONFLICT`)
- Todas as permissões anteriores do usuário serão removidas
- O usuário terá acesso completo apenas ao Reserva Rooftop
