-- Migração para criar tabelas de camarotes e reservas de camarotes
-- Execute este script no seu banco de dados MySQL

-- Criar tabela de camarotes
CREATE TABLE IF NOT EXISTS `camarotes` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `id_place` int(11) NOT NULL,
  `nome_camarote` varchar(255) NOT NULL,
  `capacidade_maxima` int(11) NOT NULL DEFAULT 10,
  `status` enum('disponivel','bloqueado','reservado') DEFAULT 'disponivel',
  `regras_especificas` text DEFAULT NULL,
  `valor_base` decimal(10,2) DEFAULT 0.00,
  `descricao` text DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_id_place` (`id_place`),
  KEY `idx_status` (`status`),
  FOREIGN KEY (`id_place`) REFERENCES `places`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Criar tabela de reservas de camarotes
CREATE TABLE IF NOT EXISTS `reservas_camarote` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `id_reserva` int(11) DEFAULT NULL,
  `id_camarote` int(11) NOT NULL,
  `id_evento` int(11) DEFAULT NULL,
  `nome_cliente` varchar(255) NOT NULL,
  `telefone` varchar(20) DEFAULT NULL,
  `cpf_cnpj` varchar(20) DEFAULT NULL,
  `email` varchar(255) DEFAULT NULL,
  `data_nascimento` date DEFAULT NULL,
  `maximo_pessoas` int(11) NOT NULL,
  `entradas_unisex_free` int(11) DEFAULT 0,
  `entradas_masculino_free` int(11) DEFAULT 0,
  `entradas_feminino_free` int(11) DEFAULT 0,
  `valor_camarote` decimal(10,2) DEFAULT 0.00,
  `valor_consumacao` decimal(10,2) DEFAULT 0.00,
  `valor_pago` decimal(10,2) DEFAULT 0.00,
  `valor_sinal` decimal(10,2) DEFAULT 0.00,
  `prazo_sinal_dias` int(11) DEFAULT 0,
  `solicitado_por` varchar(255) DEFAULT NULL,
  `observacao` text DEFAULT NULL,
  `status_reserva` enum('pre-reservado','reservado','confirmado','aguardando-aprovacao','aguardando-cancelamento','disponivel','bloqueado','cancelado') DEFAULT 'pre-reservado',
  `tag` varchar(100) DEFAULT NULL,
  `hora_reserva` time DEFAULT NULL,
  `data_reserva` date DEFAULT NULL,
  `data_expiracao` date DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_id_camarote` (`id_camarote`),
  KEY `idx_id_evento` (`id_evento`),
  KEY `idx_status_reserva` (`status_reserva`),
  KEY `idx_data_reserva` (`data_reserva`),
  FOREIGN KEY (`id_camarote`) REFERENCES `camarotes`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`id_evento`) REFERENCES `eventos`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Criar tabela de convidados dos camarotes
CREATE TABLE IF NOT EXISTS `camarote_convidados` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `id_reserva_camarote` int(11) NOT NULL,
  `nome` varchar(255) NOT NULL,
  `email` varchar(255) DEFAULT NULL,
  `telefone` varchar(20) DEFAULT NULL,
  `status` enum('confirmado','pendente','cancelado') DEFAULT 'pendente',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_id_reserva_camarote` (`id_reserva_camarote`),
  KEY `idx_status` (`status`),
  FOREIGN KEY (`id_reserva_camarote`) REFERENCES `reservas_camarote`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Inserir camarotes de exemplo para o High Line (id_place = 7)
INSERT IGNORE INTO `camarotes` (`id`, `id_place`, `nome_camarote`, `capacidade_maxima`, `status`, `regras_especificas`, `valor_base`, `descricao`) VALUES
(101, 7, 'Highline-C1', 10, 'disponivel', 'Camarote com vista privilegiada para o deck', 500.00, 'Camarote com vista privilegiada para o deck, ideal para grupos pequenos'),
(102, 7, 'Highline-C2', 12, 'disponivel', 'Camarote com acesso direto ao rooftop', 600.00, 'Camarote com acesso direto ao rooftop, perfeito para celebrações'),
(103, 7, 'Highline-C3', 8, 'disponivel', 'Camarote mais íntimo e reservado', 400.00, 'Camarote mais íntimo e reservado, ideal para encontros especiais'),
(104, 7, 'Highline-C4', 15, 'disponivel', 'Camarote com vista panorâmica', 700.00, 'Camarote com vista panorâmica da cidade, ideal para grupos maiores'),
(105, 7, 'Highline-C5', 20, 'disponivel', 'Camarote premium com serviço exclusivo', 900.00, 'Camarote premium com serviço exclusivo e garçom dedicado'),
(106, 7, 'Highline-C6', 25, 'disponivel', 'Camarote master com toda a estrutura', 1200.00, 'Camarote master com toda a estrutura e conforto para grandes eventos');

-- Inserir camarotes de exemplo para Seu Justino (id_place = 1)
INSERT IGNORE INTO `camarotes` (`id`, `id_place`, `nome_camarote`, `capacidade_maxima`, `status`, `regras_especificas`, `valor_base`, `descricao`) VALUES
(201, 1, 'Justino-C1', 10, 'disponivel', 'Camarote com vista para a rua Harmonia', 450.00, 'Camarote com vista para a rua Harmonia, ambiente acolhedor'),
(202, 1, 'Justino-C2', 12, 'disponivel', 'Camarote com acesso ao jardim', 550.00, 'Camarote com acesso ao jardim, perfeito para eventos ao ar livre'),
(203, 1, 'Justino-C3', 8, 'disponivel', 'Camarote mais reservado', 350.00, 'Camarote mais reservado, ideal para encontros íntimos'),
(204, 1, 'Justino-C4', 15, 'disponivel', 'Camarote com vista completa do estabelecimento', 650.00, 'Camarote com vista completa do estabelecimento');

-- Inserir camarotes de exemplo para Oh Freguês (id_place = 4)
INSERT IGNORE INTO `camarotes` (`id`, `id_place`, `nome_camarote`, `capacidade_maxima`, `status`, `regras_especificas`, `valor_base`, `descricao`) VALUES
(401, 4, 'Fregues-C1', 10, 'disponivel', 'Camarote com vista para o Largo da Matriz', 400.00, 'Camarote com vista para o Largo da Matriz, ambiente histórico'),
(402, 4, 'Fregues-C2', 12, 'disponivel', 'Camarote com acesso ao terraço', 500.00, 'Camarote com acesso ao terraço, vista panorâmica'),
(403, 4, 'Fregues-C3', 8, 'disponivel', 'Camarote reservado', 300.00, 'Camarote reservado, ideal para encontros especiais'),
(404, 4, 'Fregues-C4', 15, 'disponivel', 'Camarote com vista completa', 600.00, 'Camarote com vista completa do estabelecimento'),
(405, 4, 'Fregues-C5', 20, 'disponivel', 'Camarote premium', 800.00, 'Camarote premium com serviço diferenciado');

-- Inserir camarotes de exemplo para Pracinha do Seu Justino (id_place = 8)
INSERT IGNORE INTO `camarotes` (`id`, `id_place`, `nome_camarote`, `capacidade_maxima`, `status`, `regras_especificas`, `valor_base`, `descricao`) VALUES
(801, 8, 'Pracinha-C1', 10, 'disponivel', 'Camarote com vista para a pracinha', 350.00, 'Camarote com vista para a pracinha, ambiente familiar'),
(802, 8, 'Pracinha-C2', 12, 'disponivel', 'Camarote com acesso ao jardim', 450.00, 'Camarote com acesso ao jardim, perfeito para eventos ao ar livre');

-- Comentários explicativos das tabelas
ALTER TABLE `camarotes` COMMENT = 'Tabela de camarotes disponíveis por estabelecimento';
ALTER TABLE `reservas_camarote` COMMENT = 'Tabela de reservas de camarotes com todos os detalhes';
ALTER TABLE `camarote_convidados` COMMENT = 'Tabela de convidados por reserva de camarote';

-- Criar índices compostos para melhor performance
CREATE INDEX idx_camarotes_place_status ON camarotes(id_place, status);
CREATE INDEX idx_reservas_camarote_camarote_status ON reservas_camarote(id_camarote, status_reserva);
CREATE INDEX idx_reservas_camarote_data_status ON reservas_camarote(data_reserva, status_reserva);











