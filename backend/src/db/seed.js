require('dotenv').config();
const bcrypt = require('bcrypt');
const pool = require('../config/db');

const SALT_ROUNDS = 10;

const users = [
  { name: 'Admin',       pin: '0000', role: 'admin'   },
  { name: 'Marco Rossi', pin: '1234', role: 'waiter'  },
  { name: 'Laura Bianchi', pin: '5678', role: 'cashier' },
  { name: 'Chef Antonio', pin: '9999', role: 'kitchen' },
];

const zones = [
  { name: 'Terrazza Panoramica', sort_order: 1 },
  { name: 'Sala Cristallo',      sort_order: 2 },
];

// Tables per zone (will be inserted after zones)
const tablesByZone = {
  'Terrazza Panoramica': [
    { number: 'T1', seats: 4, x: 10, y: 15 },
    { number: 'T2', seats: 4, x: 30, y: 15 },
    { number: 'T3', seats: 2, x: 50, y: 15 },
    { number: 'T4', seats: 6, x: 70, y: 15 },
    { number: 'T5', seats: 2, x: 10, y: 50 },
    { number: 'T6', seats: 4, x: 30, y: 50 },
  ],
  'Sala Cristallo': [
    { number: 'S1', seats: 4, x: 10, y: 15 },
    { number: 'S2', seats: 4, x: 30, y: 15 },
    { number: 'S3', seats: 8, x: 55, y: 25 },
    { number: 'S4', seats: 2, x: 10, y: 55 },
    { number: 'S5', seats: 4, x: 30, y: 55 },
  ],
};

const categories = [
  { name: 'Antipasti',  sort_order: 1, tax_rate: 10.00 },
  { name: 'Primi',      sort_order: 2, tax_rate: 10.00 },
  { name: 'Secondi',    sort_order: 3, tax_rate: 10.00 },
  { name: 'Contorni',   sort_order: 4, tax_rate: 10.00 },
  { name: 'Dessert',    sort_order: 5, tax_rate: 10.00 },
  { name: 'Bevande',    sort_order: 6, tax_rate: 22.00 },
];

const menuItemsByCategory = {
  'Antipasti': [
    { name: 'Bruschetta al Pomodoro',    description: 'Pane tostato con pomodorini freschi e basilico', price: 7.50, prep: 5 },
    { name: 'Carpaccio di Manzo',        description: 'Fettine sottili con rucola e grana',             price: 14.00, prep: 8 },
    { name: 'Tagliere di Salumi',        description: 'Selezione di salumi e formaggi locali',          price: 16.00, prep: 5 },
    { name: 'Polpo alla Griglia',        description: 'Polpo grigliato con patate e olive',             price: 18.00, prep: 15 },
  ],
  'Primi': [
    { name: 'Spaghetti alle Vongole',    description: 'Con vongole fresche, aglio e prezzemolo',        price: 18.00, prep: 20 },
    { name: 'Risotto al Pesce',          description: 'Riso Carnaroli con frutti di mare',              price: 22.00, prep: 25 },
    { name: 'Tagliatelle al Ragù',       description: 'Pasta fresca con ragù di manzo',                 price: 15.00, prep: 15 },
    { name: 'Penne all\'Arrabbiata',     description: 'Con pomodoro e peperoncino',                     price: 12.00, prep: 12 },
  ],
  'Secondi': [
    { name: 'Branzino al Forno',         description: 'Con patate e olive, cottura al forno',           price: 28.00, prep: 30 },
    { name: 'Tagliata di Manzo',         description: 'Con rucola, scaglie di grana e aceto balsamico', price: 32.00, prep: 20 },
    { name: 'Pollo alla Griglia',        description: 'Con erbe aromatiche e limone',                   price: 18.00, prep: 20 },
    { name: 'Salmone in Crosta',         description: 'Con crosta di pistacchi e salsa ai capperi',     price: 26.00, prep: 25 },
  ],
  'Contorni': [
    { name: 'Insalata Mista',            description: 'Verdure di stagione',                            price: 6.00, prep: 5 },
    { name: 'Patate al Forno',           description: 'Con rosmarino',                                  price: 6.00, prep: 20 },
    { name: 'Verdure Grigliate',         description: 'Selezione di verdure di stagione',               price: 8.00, prep: 15 },
  ],
  'Dessert': [
    { name: 'Tiramisù',                  description: 'Ricetta della casa',                             price: 8.00, prep: 5 },
    { name: 'Panna Cotta',               description: 'Con coulis di frutti di bosco',                  price: 7.00, prep: 5 },
    { name: 'Gelato Artigianale',        description: 'Due gusti a scelta',                             price: 6.50, prep: 5 },
  ],
  'Bevande': [
    { name: 'Acqua Naturale 0.75L',      description: null,                                             price: 3.00, prep: 1 },
    { name: 'Acqua Frizzante 0.75L',     description: null,                                             price: 3.00, prep: 1 },
    { name: 'Vino Bianco (calice)',      description: 'Pinot Grigio DOC',                               price: 6.00, prep: 2 },
    { name: 'Vino Rosso (calice)',       description: 'Sangiovese IGT',                                 price: 6.00, prep: 2 },
    { name: 'Birra alla Spina',          description: '33cl',                                           price: 5.00, prep: 2 },
    { name: 'Coca-Cola',                 description: '33cl',                                           price: 4.00, prep: 1 },
    { name: 'Espresso',                  description: null,                                             price: 1.50, prep: 3 },
    { name: 'Cappuccino',                description: null,                                             price: 2.50, prep: 4 },
  ],
};

async function seed() {
  const client = await pool.connect();
  try {
    console.log('Seeding database...');
    await client.query('BEGIN');

    // Users
    for (const u of users) {
      const hash = await bcrypt.hash(u.pin, SALT_ROUNDS);
      await client.query(
        `INSERT INTO users (name, pin_hash, role)
         VALUES ($1, $2, $3)
         ON CONFLICT (pin_hash) DO NOTHING`,
        [u.name, hash, u.role]
      );
      console.log(`  User: ${u.name} (PIN: ${u.pin}, role: ${u.role})`);
    }

    // Zones
    const zoneIds = {};
    for (const z of zones) {
      const res = await client.query(
        `INSERT INTO zones (name, sort_order)
         VALUES ($1, $2)
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [z.name, z.sort_order]
      );
      if (res.rows[0]) {
        zoneIds[z.name] = res.rows[0].id;
      } else {
        const existing = await client.query('SELECT id FROM zones WHERE name=$1', [z.name]);
        zoneIds[z.name] = existing.rows[0].id;
      }
      console.log(`  Zone: ${z.name}`);
    }

    // Tables
    for (const [zoneName, tables] of Object.entries(tablesByZone)) {
      const zoneId = zoneIds[zoneName];
      for (const t of tables) {
        await client.query(
          `INSERT INTO tables (zone_id, table_number, seats, pos_x, pos_y)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (zone_id, table_number) DO NOTHING`,
          [zoneId, t.number, t.seats, t.x, t.y]
        );
      }
      console.log(`  Tables for ${zoneName}: ${tables.map(t => t.number).join(', ')}`);
    }

    // Categories
    const categoryIds = {};
    for (const c of categories) {
      const res = await client.query(
        `INSERT INTO categories (name, sort_order, tax_rate)
         VALUES ($1, $2, $3)
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [c.name, c.sort_order, c.tax_rate]
      );
      if (res.rows[0]) {
        categoryIds[c.name] = res.rows[0].id;
      } else {
        const existing = await client.query('SELECT id FROM categories WHERE name=$1', [c.name]);
        categoryIds[c.name] = existing.rows[0].id;
      }
      console.log(`  Category: ${c.name}`);
    }

    // Menu items
    for (const [catName, items] of Object.entries(menuItemsByCategory)) {
      const catId = categoryIds[catName];
      for (const item of items) {
        await client.query(
          `INSERT INTO menu_items (category_id, name, description, base_price, prep_time_mins)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT DO NOTHING`,
          [catId, item.name, item.description, item.price, item.prep]
        );
      }
      console.log(`  Menu items for ${catName}: ${items.length} items`);
    }

    await client.query('COMMIT');
    console.log('\nSeed complete!');
    console.log('\nTest users:');
    users.forEach(u => console.log(`  ${u.role.padEnd(10)} | PIN: ${u.pin} | ${u.name}`));

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Seed failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
