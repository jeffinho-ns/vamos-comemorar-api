# 🔍 Verificação de Permissões no Azure Portal

## Passo a Passo para Verificar e Configurar Permissões

### 1. Acessar API Permissions

1. No Azure Portal, vá em **App registrations**
2. Clique no app: **API de Imagens Agilizaiapp** (ID: 16885a0b-840c-410b-879c-5bd0c6e6a040)
3. No menu lateral, clique em **API permissions**

### 2. Verificar Permissões Existentes

Você deve ver uma lista de permissões. Verifique se existem:

- **Microsoft Graph** com permissões:
  - `Files.ReadWrite.All` (Application permission)
  - `Sites.ReadWrite.All` (Application permission)

### 3. Se as Permissões NÃO Existem, Adicione:

1. Clique em **+ Add a permission**
2. Selecione **Microsoft Graph**
3. Selecione **Application permissions** (não Delegated)
4. Na busca, digite e selecione:
   - `Files.ReadWrite.All` - Marque a caixa
   - `Sites.ReadWrite.All` - Marque a caixa
5. Clique em **Add permissions**

### 4. Conceder Admin Consent (CRÍTICO)

Após adicionar as permissões:

1. Você verá um botão **Grant admin consent for [seu tenant]**
2. **Clique neste botão** - Isso é essencial!
3. Confirme a ação
4. Aguarde a confirmação de que foi concedido

### 5. Verificar Status

Após conceder o consentimento, você deve ver:

- ✅ Status: **Granted for [seu tenant]**
- ✅ Um ícone de check verde

## ⚠️ Importante

- As permissões devem ser **Application permissions**, não Delegated
- O **Admin consent** deve estar concedido (Granted)
- Sem o Admin consent, a autenticação falhará mesmo com o secret correto

