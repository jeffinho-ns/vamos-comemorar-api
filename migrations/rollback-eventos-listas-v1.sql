-- ========================================
-- ROLLBACK DA VERSÃO 1 (SE JÁ FOI EXECUTADA)
-- Remove eventos_listas e recria com integração
-- ========================================

-- Remover foreign keys que dependem de eventos_listas
ALTER TABLE `listas` DROP FOREIGN KEY IF EXISTS `listas_ibfk_1`;

-- Remover tabela eventos_listas (se existir)
DROP TABLE IF EXISTS `eventos_listas`;

-- Recriar FK apontando para eventos
ALTER TABLE `listas` 
ADD CONSTRAINT `listas_ibfk_1` 
FOREIGN KEY (`evento_id`) REFERENCES `eventos`(`id`) ON DELETE CASCADE;

SELECT '✅ Rollback executado - agora usar eventos-listas-module-v2.sql' AS status;






