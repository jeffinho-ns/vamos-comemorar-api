-- Migration: Adicionar campos para tipos de OS (Ordem de Serviço)
-- Adiciona suporte para OS de Contratação de Artista/Banda/DJ e OS de Serviço de Bar/Fornecedor

ALTER TABLE operational_details 
ADD COLUMN os_type ENUM('artist', 'bar_service') DEFAULT NULL AFTER id,
ADD COLUMN os_number VARCHAR(50) DEFAULT NULL AFTER os_type,
-- Campos para OS de Contratação de Artista/Banda/DJ - Dados do Contratante
ADD COLUMN contractor_name VARCHAR(255) DEFAULT NULL,
ADD COLUMN contractor_cnpj VARCHAR(18) DEFAULT NULL,
ADD COLUMN contractor_address TEXT DEFAULT NULL,
ADD COLUMN contractor_legal_responsible VARCHAR(255) DEFAULT NULL,
ADD COLUMN contractor_legal_cpf VARCHAR(14) DEFAULT NULL,
ADD COLUMN contractor_phone VARCHAR(20) DEFAULT NULL,
ADD COLUMN contractor_email VARCHAR(255) DEFAULT NULL,
-- Dados do Contratado (Artista)
ADD COLUMN artist_artistic_name VARCHAR(255) DEFAULT NULL,
ADD COLUMN artist_full_name VARCHAR(255) DEFAULT NULL,
ADD COLUMN artist_cpf_cnpj VARCHAR(18) DEFAULT NULL,
ADD COLUMN artist_address TEXT DEFAULT NULL,
ADD COLUMN artist_phone VARCHAR(20) DEFAULT NULL,
ADD COLUMN artist_email VARCHAR(255) DEFAULT NULL,
ADD COLUMN artist_responsible_name VARCHAR(255) DEFAULT NULL,
ADD COLUMN artist_bank_name VARCHAR(255) DEFAULT NULL,
ADD COLUMN artist_bank_agency VARCHAR(20) DEFAULT NULL,
ADD COLUMN artist_bank_account VARCHAR(20) DEFAULT NULL,
ADD COLUMN artist_bank_account_type VARCHAR(20) DEFAULT NULL,
-- Dados do Evento/Apresentação
ADD COLUMN event_name VARCHAR(255) DEFAULT NULL,
ADD COLUMN event_location_address TEXT DEFAULT NULL,
ADD COLUMN event_presentation_date DATE DEFAULT NULL,
ADD COLUMN event_presentation_time TIME DEFAULT NULL,
ADD COLUMN event_duration VARCHAR(100) DEFAULT NULL,
ADD COLUMN event_soundcheck_time TIME DEFAULT NULL,
ADD COLUMN event_structure_offered TEXT DEFAULT NULL,
ADD COLUMN event_equipment_provided_by_contractor TEXT DEFAULT NULL,
ADD COLUMN event_equipment_brought_by_artist TEXT DEFAULT NULL,
-- Condições Financeiras
ADD COLUMN financial_total_value DECIMAL(10,2) DEFAULT NULL,
ADD COLUMN financial_payment_method VARCHAR(100) DEFAULT NULL,
ADD COLUMN financial_payment_conditions TEXT DEFAULT NULL,
ADD COLUMN financial_discounts_or_fees TEXT DEFAULT NULL,
-- Condições Gerais
ADD COLUMN general_penalties TEXT DEFAULT NULL,
ADD COLUMN general_transport_responsibility TEXT DEFAULT NULL,
ADD COLUMN general_image_rights TEXT DEFAULT NULL,
ADD COLUMN contractor_signature VARCHAR(255) DEFAULT NULL,
ADD COLUMN artist_signature VARCHAR(255) DEFAULT NULL,
-- Campos para OS de Serviço de Bar/Fornecedor - Dados do Contratado (Prestador de Serviço)
ADD COLUMN provider_name VARCHAR(255) DEFAULT NULL,
ADD COLUMN provider_cpf_cnpj VARCHAR(18) DEFAULT NULL,
ADD COLUMN provider_address TEXT DEFAULT NULL,
ADD COLUMN provider_responsible_name VARCHAR(255) DEFAULT NULL,
ADD COLUMN provider_responsible_contact VARCHAR(255) DEFAULT NULL,
ADD COLUMN provider_bank_name VARCHAR(255) DEFAULT NULL,
ADD COLUMN provider_bank_agency VARCHAR(20) DEFAULT NULL,
ADD COLUMN provider_bank_account VARCHAR(20) DEFAULT NULL,
ADD COLUMN provider_bank_account_type VARCHAR(20) DEFAULT NULL,
-- Descrição do Serviço
ADD COLUMN service_type VARCHAR(255) DEFAULT NULL,
ADD COLUMN service_professionals_count INT DEFAULT NULL,
ADD COLUMN service_materials_included TEXT DEFAULT NULL,
ADD COLUMN service_start_date DATE DEFAULT NULL,
ADD COLUMN service_start_time TIME DEFAULT NULL,
ADD COLUMN service_end_date DATE DEFAULT NULL,
ADD COLUMN service_end_time TIME DEFAULT NULL,
ADD COLUMN service_setup_location TEXT DEFAULT NULL,
ADD COLUMN service_technical_responsible VARCHAR(255) DEFAULT NULL,
-- Condições Comerciais
ADD COLUMN commercial_total_value DECIMAL(10,2) DEFAULT NULL,
ADD COLUMN commercial_payment_method VARCHAR(100) DEFAULT NULL,
ADD COLUMN commercial_payment_deadline VARCHAR(255) DEFAULT NULL,
ADD COLUMN commercial_cancellation_policy TEXT DEFAULT NULL,
ADD COLUMN commercial_additional_costs TEXT DEFAULT NULL,
-- Condições Gerais
ADD COLUMN general_damage_responsibility TEXT DEFAULT NULL,
ADD COLUMN general_conduct_rules TEXT DEFAULT NULL,
ADD COLUMN general_insurance TEXT DEFAULT NULL,
ADD COLUMN provider_signature VARCHAR(255) DEFAULT NULL;

-- Índices para melhor performance
CREATE INDEX idx_os_type ON operational_details(os_type);
CREATE INDEX idx_os_number ON operational_details(os_number);
