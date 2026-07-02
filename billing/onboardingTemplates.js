'use strict';

/**
 * Materiais padrão criados ao provisionar uma nova organização.
 */

const GLOBAL_STARTER_MATERIALS = [
  {
    title: 'Central de Documentação',
    description: 'Guia operacional por cargo — acesse pelo menu do painel.',
    contentType: 'link',
    url: '/documentacao',
    sortOrder: 0,
  },
  {
    title: 'Painel administrativo',
    description: 'Visão geral das áreas do sistema para sua equipe.',
    contentType: 'link',
    url: '/admin',
    sortOrder: 1,
  },
  {
    title: 'Sistema de Reservas',
    description: 'Configure horários, áreas e políticas de reserva.',
    contentType: 'link',
    url: '/admin/restaurant-reservations',
    moduleKey: 'reservas',
    sortOrder: 10,
  },
  {
    title: 'Cardápio digital',
    description: 'Gerencie itens, categorias e disponibilidade.',
    contentType: 'link',
    url: '/admin/cardapio',
    moduleKey: 'cardapio',
    sortOrder: 20,
  },
];

async function seedOrganizationTrainingMaterials(client, organizationId, planKey) {
  for (const item of GLOBAL_STARTER_MATERIALS) {
    await client.query(
      `INSERT INTO meu_backup_db.training_materials
         (title, description, content_type, url, module_key, plan_key, organization_id, is_published, sort_order)
       SELECT $1, $2, $3, $4, $5, $6, $7, TRUE, $8
        WHERE NOT EXISTS (
          SELECT 1 FROM meu_backup_db.training_materials
           WHERE organization_id = $7 AND title = $1
        )`,
      [
        item.title,
        item.description,
        item.contentType,
        item.url,
        item.moduleKey || null,
        planKey || null,
        organizationId,
        item.sortOrder,
      ],
    );
  }
}

async function seedEstablishmentConfig(client, establishmentId, slug) {
  await client.query(
    `UPDATE meu_backup_db.establishments
        SET config = COALESCE(config, '{}'::jsonb) || $2::jsonb,
            updated_at = now()
      WHERE id = $1`,
    [
      establishmentId,
      JSON.stringify({
        onboarding: {
          completedSteps: [],
          template: 'default',
          slug,
          checklist: [
            'Convidar equipe e definir permissões',
            'Configurar horários de funcionamento',
            'Cadastrar áreas e mesas',
            'Publicar cardápio',
            'Testar fluxo de reserva',
          ],
        },
      }),
    ],
  );
}

module.exports = {
  GLOBAL_STARTER_MATERIALS,
  seedOrganizationTrainingMaterials,
  seedEstablishmentConfig,
};
