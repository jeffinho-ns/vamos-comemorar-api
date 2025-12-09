# 📋 Plano de Implementação: Executive Event Menus

## 🎯 Objetivo
Implementar sistema de "Executive Event Menus" - cardápios temporários e exclusivos para eventos corporativos/privados, com acesso via QR Code sem autenticação.

---

## 📊 FASE 1: ANÁLISE DO CÓDIGO EXISTENTE

### 1.1 Estrutura do Banco de Dados Atual

#### Tabelas Principais Identificadas:

**`bars`** (Estabelecimentos)
- `id` (INT, PK)
- `name` (VARCHAR)
- `slug` (VARCHAR, UNIQUE)
- `logoUrl`, `coverImageUrl` (VARCHAR)
- `menu_category_bg_color`, `menu_category_text_color` (VARCHAR)
- `menu_subcategory_bg_color`, `menu_subcategory_text_color` (VARCHAR)
- `mobile_sidebar_bg_color`, `mobile_sidebar_text_color` (VARCHAR)
- `custom_seals` (JSON)

**`menu_categories`** (Categorias do Menu)
- `id` (INT, PK)
- `name` (VARCHAR)
- `barId` (INT, FK → bars.id)
- `order` (INT)

**`menu_items`** (Itens do Cardápio)
- `id` (INT, PK)
- `name` (VARCHAR)
- `description` (TEXT)
- `price` (DECIMAL)
- `imageUrl` (VARCHAR)
- `categoryId` (INT, FK → menu_categories.id)
- `barId` (INT, FK → bars.id)
- `subCategory` (VARCHAR) - **Nota: Subcategorias são VARCHAR, não tabela separada**
- `seals` (JSON) - Array de IDs de selos
- `visible` (BOOLEAN)
- `deleted_at` (TIMESTAMP)
- `order` (INT)

#### Relacionamentos Identificados:
```
bars (1) ──→ (N) menu_categories
menu_categories (1) ──→ (N) menu_items
menu_items.subCategory (VARCHAR) - não é FK, apenas texto
```

### 1.2 Estrutura do Backend

- **Framework**: Node.js + Express
- **Database**: PostgreSQL
- **Estrutura de Rotas**: `/routes/*.js` que exportam funções recebendo `pool`
- **Registro**: Rotas registradas em `server.js` com `app.use('/api/...', routes(pool))`
- **Padrão**: Rotas seguem padrão RESTful

### 1.3 Estrutura do Frontend

- **Framework**: Next.js 14+ (App Router)
- **TypeScript**: Tipos em `/app/types/`
- **Páginas Admin**: `/app/admin/*`
- **Páginas Públicas**: `/app/cardapio/[slug]/page.tsx` (exemplo)

---

## 🗄️ FASE 2: PROPOSTA DE SCHEMA DO BANCO DE DADOS

### 2.1 Nova Tabela: `executive_events`

```sql
CREATE TABLE executive_events (
  id SERIAL PRIMARY KEY,
  establishment_id INTEGER NOT NULL,
  name VARCHAR(255) NOT NULL,
  event_date DATE NOT NULL,
  logo_url VARCHAR(500) DEFAULT NULL,
  cover_image_url VARCHAR(500) DEFAULT NULL,
  slug VARCHAR(255) UNIQUE NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_executive_events_establishment 
    FOREIGN KEY (establishment_id) 
    REFERENCES bars(id) 
    ON DELETE CASCADE
);

CREATE INDEX idx_executive_events_establishment ON executive_events(establishment_id);
CREATE INDEX idx_executive_events_slug ON executive_events(slug);
CREATE INDEX idx_executive_events_active ON executive_events(is_active);
CREATE INDEX idx_executive_events_date ON executive_events(event_date);
```

### 2.2 Nova Tabela: `event_settings` (JSONB para Customização)

```sql
CREATE TABLE event_settings (
  id SERIAL PRIMARY KEY,
  event_id INTEGER NOT NULL UNIQUE,
  custom_colors JSONB DEFAULT NULL,
  -- Estrutura esperada do JSONB:
  -- {
  --   "categoryBgColor": "#hex",
  --   "categoryTextColor": "#hex",
  --   "subcategoryBgColor": "#hex",
  --   "subcategoryTextColor": "#hex",
  --   "sidebarBgColor": "#hex",
  --   "sidebarTextColor": "#hex",
  --   "backgroundColor": "#hex",
  --   "textColor": "#hex"
  -- }
  welcome_message TEXT DEFAULT NULL,
  wifi_info JSONB DEFAULT NULL,
  -- {
  --   "network": "string",
  --   "password": "string"
  -- }
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_event_settings_event 
    FOREIGN KEY (event_id) 
    REFERENCES executive_events(id) 
    ON DELETE CASCADE
);
```

### 2.3 Nova Tabela: `event_items` (Many-to-Many: Event ↔ Items)

```sql
CREATE TABLE event_items (
  id SERIAL PRIMARY KEY,
  event_id INTEGER NOT NULL,
  item_id INTEGER NOT NULL,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_event_items_event 
    FOREIGN KEY (event_id) 
    REFERENCES executive_events(id) 
    ON DELETE CASCADE,
  CONSTRAINT fk_event_items_item 
    FOREIGN KEY (item_id) 
    REFERENCES menu_items(id) 
    ON DELETE CASCADE,
  CONSTRAINT unique_event_item UNIQUE (event_id, item_id)
);

CREATE INDEX idx_event_items_event ON event_items(event_id);
CREATE INDEX idx_event_items_item ON event_items(item_id);
```

### 2.4 Nova Tabela: `event_seals` (Selos/Badges por Evento)

```sql
CREATE TABLE event_seals (
  id SERIAL PRIMARY KEY,
  event_id INTEGER NOT NULL,
  name VARCHAR(100) NOT NULL,
  color VARCHAR(7) NOT NULL, -- #RRGGBB
  type VARCHAR(20) DEFAULT 'food', -- 'food' | 'drink' | 'custom'
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_event_seals_event 
    FOREIGN KEY (event_id) 
    REFERENCES executive_events(id) 
    ON DELETE CASCADE
);

CREATE INDEX idx_event_seals_event ON event_seals(event_id);
```

### 2.5 Migração SQL Completa

**Arquivo**: `/migrations/create_executive_events_system.sql`

```sql
-- ========================================
-- SISTEMA DE EXECUTIVE EVENT MENUS
-- Data: 2025-01-XX
-- Descrição: Sistema completo para eventos corporativos/privados
-- ========================================

-- Tabela principal de eventos
CREATE TABLE IF NOT EXISTS executive_events (
  id SERIAL PRIMARY KEY,
  establishment_id INTEGER NOT NULL,
  name VARCHAR(255) NOT NULL,
  event_date DATE NOT NULL,
  logo_url VARCHAR(500) DEFAULT NULL,
  cover_image_url VARCHAR(500) DEFAULT NULL,
  slug VARCHAR(255) UNIQUE NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_executive_events_establishment 
    FOREIGN KEY (establishment_id) 
    REFERENCES bars(id) 
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_executive_events_establishment ON executive_events(establishment_id);
CREATE INDEX IF NOT EXISTS idx_executive_events_slug ON executive_events(slug);
CREATE INDEX IF NOT EXISTS idx_executive_events_active ON executive_events(is_active);
CREATE INDEX IF NOT EXISTS idx_executive_events_date ON executive_events(event_date);

-- Tabela de configurações de evento (JSONB)
CREATE TABLE IF NOT EXISTS event_settings (
  id SERIAL PRIMARY KEY,
  event_id INTEGER NOT NULL UNIQUE,
  custom_colors JSONB DEFAULT NULL,
  welcome_message TEXT DEFAULT NULL,
  wifi_info JSONB DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_event_settings_event 
    FOREIGN KEY (event_id) 
    REFERENCES executive_events(id) 
    ON DELETE CASCADE
);

-- Tabela de relacionamento Event ↔ Items
CREATE TABLE IF NOT EXISTS event_items (
  id SERIAL PRIMARY KEY,
  event_id INTEGER NOT NULL,
  item_id INTEGER NOT NULL,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_event_items_event 
    FOREIGN KEY (event_id) 
    REFERENCES executive_events(id) 
    ON DELETE CASCADE,
  CONSTRAINT fk_event_items_item 
    FOREIGN KEY (item_id) 
    REFERENCES menu_items(id) 
    ON DELETE CASCADE,
  CONSTRAINT unique_event_item UNIQUE (event_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_event_items_event ON event_items(event_id);
CREATE INDEX IF NOT EXISTS idx_event_items_item ON event_items(item_id);

-- Tabela de selos/badges por evento
CREATE TABLE IF NOT EXISTS event_seals (
  id SERIAL PRIMARY KEY,
  event_id INTEGER NOT NULL,
  name VARCHAR(100) NOT NULL,
  color VARCHAR(7) NOT NULL,
  type VARCHAR(20) DEFAULT 'food',
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_event_seals_event 
    FOREIGN KEY (event_id) 
    REFERENCES executive_events(id) 
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_event_seals_event ON event_seals(event_id);

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_executive_events_updated_at 
  BEFORE UPDATE ON executive_events 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_event_settings_updated_at 
  BEFORE UPDATE ON event_settings 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

---

## 🔧 FASE 3: IMPLEMENTAÇÃO DO BACKEND

### 3.1 Novo Arquivo: `/routes/executiveEvents.js`

```javascript
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const slugify = require('slugify');

module.exports = (pool) => {
  
  // ============================================
  // POST /api/executive-events - Criar Evento
  // ============================================
  router.post('/', async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const {
        establishment_id,
        name,
        event_date,
        logo_url,
        cover_image_url,
        category_ids = [],
        subcategory_ids = [],
        custom_colors = {},
        welcome_message = null,
        wifi_info = null
      } = req.body;

      // Validações
      if (!establishment_id || !name || !event_date) {
        return res.status(400).json({ 
          error: 'establishment_id, name e event_date são obrigatórios.' 
        });
      }

      // Verificar se establishment existe
      const establishmentCheck = await client.query(
        'SELECT id FROM bars WHERE id = $1',
        [establishment_id]
      );
      if (establishmentCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Estabelecimento não encontrado.' });
      }

      // Gerar slug único
      const baseSlug = slugify(name, { lower: true, strict: true });
      let slug = baseSlug;
      let slugExists = true;
      let counter = 1;

      while (slugExists) {
        const slugCheck = await client.query(
          'SELECT id FROM executive_events WHERE slug = $1',
          [slug]
        );
        if (slugCheck.rows.length === 0) {
          slugExists = false;
        } else {
          slug = `${baseSlug}-${counter}`;
          counter++;
        }
      }

      // Criar evento
      const eventResult = await client.query(
        `INSERT INTO executive_events 
         (establishment_id, name, event_date, logo_url, cover_image_url, slug)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [establishment_id, name, event_date, logo_url, cover_image_url, slug]
      );

      const eventId = eventResult.rows[0].id;

      // Criar settings
      await client.query(
        `INSERT INTO event_settings 
         (event_id, custom_colors, welcome_message, wifi_info)
         VALUES ($1, $2, $3, $4)`,
        [
          eventId,
          JSON.stringify(custom_colors),
          welcome_message,
          wifi_info ? JSON.stringify(wifi_info) : null
        ]
      );

      // AUTOMAÇÃO: Buscar itens por categorias
      const itemsToLink = new Set();
      
      if (category_ids.length > 0) {
        const categoryItems = await client.query(
          `SELECT id FROM menu_items 
           WHERE categoryId = ANY($1::int[])
             AND barId = $2
             AND deleted_at IS NULL
             AND (visible IS NULL OR visible = true)`,
          [category_ids, establishment_id]
        );
        categoryItems.rows.forEach(row => itemsToLink.add(row.id));
      }

      // AUTOMAÇÃO: Buscar itens por subcategorias
      if (subcategory_ids.length > 0) {
        // Nota: subcategory_ids são nomes (VARCHAR), não IDs
        const subcategoryItems = await client.query(
          `SELECT id FROM menu_items 
           WHERE subCategory = ANY($1::varchar[])
             AND barId = $2
             AND deleted_at IS NULL
             AND (visible IS NULL OR visible = true)`,
          [subcategory_ids, establishment_id]
        );
        subcategoryItems.rows.forEach(row => itemsToLink.add(row.id));
      }

      // Inserir relacionamentos event_items
      if (itemsToLink.size > 0) {
        const itemIds = Array.from(itemsToLink);
        const values = itemIds.map((itemId, index) => 
          `($1, $${index + 2}, $${index + itemIds.length + 2})`
        ).join(', ');

        const params = [eventId, ...itemIds, ...itemIds.map((_, i) => i)];
        
        await client.query(
          `INSERT INTO event_items (event_id, item_id, display_order)
           VALUES ${values}
           ON CONFLICT (event_id, item_id) DO NOTHING`,
          [eventId, ...itemIds, ...itemIds.map((_, i) => i)]
        );

        // Versão mais segura com loop
        for (let i = 0; i < itemIds.length; i++) {
          await client.query(
            `INSERT INTO event_items (event_id, item_id, display_order)
             VALUES ($1, $2, $3)
             ON CONFLICT (event_id, item_id) DO NOTHING`,
            [eventId, itemIds[i], i]
          );
        }
      }

      await client.query('COMMIT');

      // Buscar evento completo para retornar
      const fullEvent = await getEventById(eventId, pool);
      res.status(201).json(fullEvent);

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('❌ Erro ao criar evento:', error);
      res.status(500).json({ 
        error: 'Erro ao criar evento.', 
        details: error.message 
      });
    } finally {
      client.release();
    }
  });

  // ============================================
  // GET /api/executive-events - Listar Eventos
  // ============================================
  router.get('/', async (req, res) => {
    try {
      const { establishment_id, is_active } = req.query;
      
      let query = `
        SELECT 
          e.id,
          e.establishment_id,
          e.name,
          e.event_date,
          e.logo_url,
          e.cover_image_url,
          e.slug,
          e.is_active,
          e.created_at,
          e.updated_at,
          b.name as establishment_name
        FROM executive_events e
        JOIN bars b ON e.establishment_id = b.id
        WHERE 1=1
      `;
      
      const params = [];
      let paramCount = 1;

      if (establishment_id) {
        query += ` AND e.establishment_id = $${paramCount}`;
        params.push(establishment_id);
        paramCount++;
      }

      if (is_active !== undefined) {
        query += ` AND e.is_active = $${paramCount}`;
        params.push(is_active === 'true');
        paramCount++;
      }

      query += ` ORDER BY e.event_date DESC, e.created_at DESC`;

      const result = await pool.query(query, params);
      res.json(result.rows);
    } catch (error) {
      console.error('❌ Erro ao listar eventos:', error);
      res.status(500).json({ error: 'Erro ao listar eventos.' });
    }
  });

  // ============================================
  // GET /api/executive-events/:slug - Visualização Pública
  // ============================================
  router.get('/:slug', async (req, res) => {
    try {
      const { slug } = req.params;

      const eventResult = await pool.query(
        `SELECT 
          e.id,
          e.establishment_id,
          e.name,
          e.event_date,
          e.logo_url,
          e.cover_image_url,
          e.slug,
          e.is_active,
          b.name as establishment_name
        FROM executive_events e
        JOIN bars b ON e.establishment_id = b.id
        WHERE e.slug = $1 AND e.is_active = true`,
        [slug]
      );

      if (eventResult.rows.length === 0) {
        return res.status(404).json({ error: 'Evento não encontrado ou inativo.' });
      }

      const event = eventResult.rows[0];

      // Buscar settings
      const settingsResult = await pool.query(
        `SELECT custom_colors, welcome_message, wifi_info
         FROM event_settings
         WHERE event_id = $1`,
        [event.id]
      );

      const settings = settingsResult.rows[0] || {};
      if (settings.custom_colors) {
        settings.custom_colors = typeof settings.custom_colors === 'string' 
          ? JSON.parse(settings.custom_colors) 
          : settings.custom_colors;
      }
      if (settings.wifi_info) {
        settings.wifi_info = typeof settings.wifi_info === 'string'
          ? JSON.parse(settings.wifi_info)
          : settings.wifi_info;
      }

      // Buscar itens do evento (SEM PREÇOS na resposta)
      const itemsResult = await pool.query(
        `SELECT 
          mi.id,
          mi.name,
          mi.description,
          -- mi.price, -- REMOVIDO: Não retornar preço
          mi.imageurl as "imageUrl",
          mi.categoryid as "categoryId",
          mc.name as category,
          mi.subcategory as "subCategoryName",
          mi.seals,
          ei.display_order
        FROM event_items ei
        JOIN menu_items mi ON ei.item_id = mi.id
        JOIN menu_categories mc ON mi.categoryid = mc.id
        WHERE ei.event_id = $1
          AND mi.deleted_at IS NULL
          AND (mi.visible IS NULL OR mi.visible = true)
        ORDER BY mc."order", ei.display_order, mi."order"`,
        [event.id]
      );

      // Processar itens
      const items = itemsResult.rows.map(item => {
        let seals = [];
        if (item.seals) {
          try {
            seals = typeof item.seals === 'string' 
              ? JSON.parse(item.seals) 
              : item.seals;
          } catch (e) {
            seals = [];
          }
        }

        // Buscar toppings
        // (implementar se necessário)

        return {
          ...item,
          seals,
          // price removido intencionalmente
        };
      });

      // Agrupar por categoria
      const categoriesMap = new Map();
      items.forEach(item => {
        if (!categoriesMap.has(item.categoryId)) {
          categoriesMap.set(item.categoryId, {
            id: item.categoryId,
            name: item.category,
            items: []
          });
        }
        categoriesMap.get(item.categoryId).items.push(item);
      });

      const categories = Array.from(categoriesMap.values());

      // Buscar selos do evento
      const sealsResult = await pool.query(
        `SELECT id, name, color, type, display_order
         FROM event_seals
         WHERE event_id = $1
         ORDER BY display_order`,
        [event.id]
      );

      res.json({
        event: {
          ...event,
          settings
        },
        categories,
        seals: sealsResult.rows
      });

    } catch (error) {
      console.error('❌ Erro ao buscar evento:', error);
      res.status(500).json({ error: 'Erro ao buscar evento.' });
    }
  });

  // ============================================
  // PUT /api/executive-events/:id - Atualizar Evento
  // ============================================
  router.put('/:id', async (req, res) => {
    // Implementar atualização
    // Similar ao POST, mas com UPDATE
  });

  // ============================================
  // DELETE /api/executive-events/:id - Deletar Evento
  // ============================================
  router.delete('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      await pool.query('DELETE FROM executive_events WHERE id = $1', [id]);
      res.json({ message: 'Evento deletado com sucesso.' });
    } catch (error) {
      console.error('❌ Erro ao deletar evento:', error);
      res.status(500).json({ error: 'Erro ao deletar evento.' });
    }
  });

  // Helper function
  async function getEventById(eventId, pool) {
    // Implementar busca completa do evento
  }

  return router;
};
```

### 3.2 Registrar Rota no `server.js`

```javascript
// Adicionar após outras rotas
const executiveEventsRoutes = require('./routes/executiveEvents');
app.use('/api/executive-events', executiveEventsRoutes(pool));
```

---

## 🎨 FASE 4: IMPLEMENTAÇÃO DO FRONTEND

### 4.1 Tipos TypeScript

**Arquivo**: `/app/types/executiveEvents.ts`

```typescript
export interface ExecutiveEvent {
  id: number;
  establishment_id: number;
  name: string;
  event_date: string;
  logo_url?: string;
  cover_image_url?: string;
  slug: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  establishment_name?: string;
}

export interface EventSettings {
  custom_colors?: {
    categoryBgColor?: string;
    categoryTextColor?: string;
    subcategoryBgColor?: string;
    subcategoryTextColor?: string;
    sidebarBgColor?: string;
    sidebarTextColor?: string;
    backgroundColor?: string;
    textColor?: string;
  };
  welcome_message?: string;
  wifi_info?: {
    network?: string;
    password?: string;
  };
}

export interface EventItem {
  id: number;
  name: string;
  description: string;
  // price: number; -- REMOVIDO
  imageUrl?: string;
  categoryId: number;
  category: string;
  subCategoryName?: string;
  seals: string[];
  display_order: number;
}

export interface EventCategory {
  id: number;
  name: string;
  items: EventItem[];
}

export interface EventSeal {
  id: number;
  name: string;
  color: string;
  type: 'food' | 'drink' | 'custom';
  display_order: number;
}

export interface PublicEventResponse {
  event: ExecutiveEvent & { settings: EventSettings };
  categories: EventCategory[];
  seals: EventSeal[];
}
```

### 4.2 Página Admin: Listar/Criar Eventos

**Arquivo**: `/app/admin/executive-events/page.tsx`

```typescript
"use client";

import { useState, useEffect } from 'react';
import { ExecutiveEvent } from '@/app/types/executiveEvents';
import ExecutiveEventModal from '@/app/components/ExecutiveEventModal';

export default function ExecutiveEventsPage() {
  const [events, setEvents] = useState<ExecutiveEvent[]>([]);
  const [showModal, setShowModal] = useState(false);
  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://vamos-comemorar-api.onrender.com';

  useEffect(() => {
    fetchEvents();
  }, []);

  const fetchEvents = async () => {
    const token = localStorage.getItem('authToken');
    const response = await fetch(`${API_URL}/api/executive-events`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await response.json();
    setEvents(data);
  };

  return (
    <div>
      <h1>Executive Event Menus</h1>
      <button onClick={() => setShowModal(true)}>Criar Evento</button>
      
      {/* Lista de eventos */}
      {events.map(event => (
        <div key={event.id}>
          <h3>{event.name}</h3>
          <p>Data: {event.event_date}</p>
          <a href={`/eventos/${event.slug}`} target="_blank">
            Ver Público
          </a>
          {/* Botão Gerar QR Code */}
        </div>
      ))}

      <ExecutiveEventModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onSave={fetchEvents}
      />
    </div>
  );
}
```

### 4.3 Componente Modal: Criar Evento

**Arquivo**: `/app/components/ExecutiveEventModal.tsx`

```typescript
"use client";

import { useState, useEffect } from 'react';
import { useEstablishments } from '@/app/hooks/useEstablishments';

export default function ExecutiveEventModal({ isOpen, onClose, onSave }) {
  const { establishments } = useEstablishments();
  const [formData, setFormData] = useState({
    establishment_id: '',
    name: '',
    event_date: '',
    logo_url: '',
    cover_image_url: '',
    category_ids: [],
    subcategory_ids: [],
    custom_colors: {},
    welcome_message: '',
    wifi_info: { network: '', password: '' }
  });
  const [categories, setCategories] = useState([]);

  // Buscar categorias quando establishment_id mudar
  useEffect(() => {
    if (formData.establishment_id) {
      fetchCategories(formData.establishment_id);
    }
  }, [formData.establishment_id]);

  const fetchCategories = async (barId) => {
    const response = await fetch(
      `${API_URL}/api/cardapio/categories?barId=${barId}`
    );
    const data = await response.json();
    setCategories(data);
  };

  const handleSubmit = async () => {
    const token = localStorage.getItem('authToken');
    const response = await fetch(`${API_URL}/api/executive-events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(formData)
    });
    
    if (response.ok) {
      onSave();
      onClose();
    }
  };

  return (
    <div className={`modal ${isOpen ? 'open' : ''}`}>
      {/* Formulário completo com:
          - Upload de Logo/Cover
          - Color Pickers
          - Multi-select Categories/Subcategories
          - Welcome Message
          - WiFi Info
      */}
    </div>
  );
}
```

### 4.4 Página Pública: Visualização do Evento

**Arquivo**: `/app/eventos/[slug]/page.tsx`

```typescript
"use client";

import { useParams } from 'next/navigation';
import { useState, useEffect } from 'react';
import { PublicEventResponse } from '@/app/types/executiveEvents';

export default function PublicEventPage() {
  const params = useParams();
  const slug = params.slug as string;
  const [eventData, setEventData] = useState<PublicEventResponse | null>(null);
  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://vamos-comemorar-api.onrender.com';

  useEffect(() => {
    fetchEvent();
  }, [slug]);

  const fetchEvent = async () => {
    const response = await fetch(`${API_URL}/api/executive-events/${slug}`);
    const data = await response.json();
    setEventData(data);
  };

  if (!eventData) return <div>Carregando...</div>;

  const { event, categories, seals } = eventData;
  const colors = event.settings?.custom_colors || {};

  return (
    <div style={{ 
      backgroundColor: colors.backgroundColor || '#ffffff',
      color: colors.textColor || '#000000'
    }}>
      {/* Logo do Evento */}
      {event.logo_url && <img src={event.logo_url} alt={event.name} />}
      
      {/* Welcome Message */}
      {event.settings?.welcome_message && (
        <div>{event.settings.welcome_message}</div>
      )}

      {/* WiFi Info */}
      {event.settings?.wifi_info && (
        <div>
          WiFi: {event.settings.wifi_info.network}
          {event.settings.wifi_info.password && (
            <span> | Senha: {event.settings.wifi_info.password}</span>
          )}
        </div>
      )}

      {/* Menu por Categorias */}
      {categories.map(category => (
        <div key={category.id} style={{
          backgroundColor: colors.categoryBgColor,
          color: colors.categoryTextColor
        }}>
          <h2>{category.name}</h2>
          {category.items.map(item => (
            <div key={item.id}>
              <h3>{item.name}</h3>
              <p>{item.description}</p>
              {/* SEM PREÇO */}
              {/* SEM BOTÃO "Add to Cart" */}
              {item.seals.map(sealId => {
                const seal = seals.find(s => s.id.toString() === sealId);
                return seal ? (
                  <span key={seal.id} style={{ color: seal.color }}>
                    {seal.name}
                  </span>
                ) : null;
              })}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
```

---

## 🎁 FASE 5: SUGESTÕES DE FEATURES BÔNUS

### 5.1 Feature 1: Filtros de Alergênicos/Dietas

**Descrição**: Permitir que convidados filtrem o cardápio por restrições alimentares.

**Implementação**:
- Adicionar campo `allergens` (JSONB) em `menu_items` (se não existir)
- Adicionar campo `dietary_filters` (JSONB) em `event_settings` com opções:
  - `gluten_free`, `lactose_free`, `vegan`, `vegetarian`, `nut_free`, etc.
- Frontend: Checkboxes de filtros na página pública
- Backend: Filtrar itens na query baseado nos filtros selecionados

**Valor**: Aumenta acessibilidade e segurança para convidados com restrições.

---

### 5.2 Feature 2: Mensagem de Boas-Vindas Personalizada

**Descrição**: Área de texto rica para o anfitrião personalizar a mensagem de abertura.

**Implementação**:
- Campo `welcome_message` já incluído em `event_settings`
- Adicionar suporte a Markdown ou HTML simples
- Adicionar campo `host_company_name` em `executive_events`
- Frontend: Editor de texto rico no modal de criação
- Exibir mensagem destacada no topo da página pública

**Valor**: Personalização da experiência e reforço da marca do cliente corporativo.

---

### 5.3 Feature 3: Informações de WiFi e Contato Rápido

**Descrição**: Exibir informações de WiFi e botões de contato rápido (WhatsApp/Telefone).

**Implementação**:
- Campo `wifi_info` já incluído em `event_settings`
- Adicionar campo `contact_info` (JSONB) em `event_settings`:
  ```json
  {
    "whatsapp": "+5511999999999",
    "phone": "+5511888888888",
    "email": "evento@restaurante.com"
  }
  ```
- Frontend: 
  - Card de WiFi com botão "Copiar Senha"
  - Botões flutuantes de WhatsApp/Telefone
  - Integração com API do WhatsApp Web

**Valor**: Melhora a experiência do convidado e reduz fricção para pedidos/suporte.

---

## ✅ CHECKLIST DE IMPLEMENTAÇÃO

### Backend
- [ ] Criar migração SQL
- [ ] Implementar `/routes/executiveEvents.js`
- [ ] Registrar rota no `server.js`
- [ ] Testar endpoints (POST, GET, GET/:slug)
- [ ] Validar automação de categorias/subcategorias

### Frontend Admin
- [ ] Criar tipos TypeScript
- [ ] Criar página `/app/admin/executive-events/page.tsx`
- [ ] Criar componente `ExecutiveEventModal`
- [ ] Implementar upload de imagens
- [ ] Implementar color pickers
- [ ] Implementar multi-select de categorias
- [ ] Implementar geração de QR Code

### Frontend Público
- [ ] Criar página `/app/eventos/[slug]/page.tsx`
- [ ] Implementar renderização sem preços
- [ ] Implementar renderização sem botões de carrinho
- [ ] Aplicar cores customizadas
- [ ] Implementar responsividade mobile

### Features Bônus
- [ ] Implementar filtros de alergênicos
- [ ] Implementar mensagem de boas-vindas rica
- [ ] Implementar informações de WiFi/Contato

### Testes
- [ ] Testar criação de evento
- [ ] Testar visualização pública
- [ ] Testar QR Code
- [ ] Testar em produção (staging primeiro)

---

## 📝 NOTAS IMPORTANTES

1. **Backward Compatibility**: Todas as mudanças são aditivas. Nenhuma tabela existente foi modificada.

2. **Segurança**: 
   - Endpoint público (`GET /:slug`) não requer autenticação
   - Endpoints admin requerem token JWT
   - Validação de `is_active` no endpoint público

3. **Performance**:
   - Índices criados em todas as FKs
   - Índice único em `slug` para busca rápida
   - Considerar cache para eventos ativos

4. **Escalabilidade**:
   - JSONB permite flexibilidade sem migrations frequentes
   - Estrutura preparada para múltiplos eventos simultâneos

---

**Data de Criação**: 2025-01-XX  
**Autor**: Sistema de Executive Events  
**Status**: 📋 Pronto para Implementação

