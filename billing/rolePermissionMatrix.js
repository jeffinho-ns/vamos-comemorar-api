'use strict';

/**
 * Matriz de fábrica: role.key → permissions (modulo:acao).
 * account_admin recebe todas as permissões ativas no catálogo.
 */

const FACTORY_ROLES = [
  { key: 'account_admin', name: 'Account Admin' },
  { key: 'gerente_bar', name: 'Gerente do Bar' },
  { key: 'promoter', name: 'Promoter' },
  { key: 'hostess', name: 'Hostess' },
  { key: 'recepcao', name: 'Recepção' },
];

const ROLE_PERMISSION_KEYS = {
  account_admin: '*',
  gerente_bar: [
    'reservas:read',
    'reservas:create',
    'reservas:update',
    'reservas:delete',
    'checkin:read',
    'checkin:update',
    'cardapio:read',
    'cardapio:update',
    'whatsapp:read',
    'whatsapp:update',
    'eventos:read',
    'eventos:update',
    'relatorios:read',
  ],
  promoter: ['eventos:read', 'reservas:read', 'checkin:read'],
  hostess: ['checkin:read', 'checkin:update', 'reservas:read'],
  recepcao: [
    'reservas:read',
    'reservas:create',
    'reservas:update',
    'checkin:read',
    'checkin:update',
  ],
};

async function seedFactoryRoles(client, organizationId) {
  for (const role of FACTORY_ROLES) {
    await client.query(
      `INSERT INTO meu_backup_db.roles (organization_id, key, name, is_system)
       VALUES ($1, $2, $3, TRUE)
       ON CONFLICT (organization_id, key) DO NOTHING`,
      [organizationId, role.key, role.name],
    );
  }
}

async function seedRolePermissionsForOrg(client, organizationId) {
  const { rows: permRows } = await client.query(`SELECT id, key FROM meu_backup_db.permissions`);
  const permByKey = new Map(permRows.map((r) => [r.key, r.id]));

  const { rows: roleRows } = await client.query(
    `SELECT id, key FROM meu_backup_db.roles WHERE organization_id = $1`,
    [organizationId],
  );

  for (const role of roleRows) {
    const spec = ROLE_PERMISSION_KEYS[role.key];
    if (!spec) continue;

    const keys = spec === '*' ? permRows.map((p) => p.key) : spec;
    for (const permKey of keys) {
      const permId = permByKey.get(permKey);
      if (!permId) continue;
      await client.query(
        `INSERT INTO meu_backup_db.role_permissions (role_id, permission_id)
         VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [role.id, permId],
      );
    }
  }
}

module.exports = {
  FACTORY_ROLES,
  ROLE_PERMISSION_KEYS,
  seedFactoryRoles,
  seedRolePermissionsForOrg,
};
