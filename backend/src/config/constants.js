const ROLES = ['admin', 'manager', 'waiter', 'kitchen', 'cashier'];

const TABLE_STATUSES = ['free', 'occupied', 'parked', 'dirty', 'reserved'];

const ORDER_STATUSES = ['open', 'completed', 'cancelled', 'parked'];

// Stati order_item:
//   pending     → ricevuto, non ancora iniziato
//   cooking     → in lavorazione (forno per pizza, padella per gli altri)
//   oven_done   → sfornato/cotto, in attesa di finitura/impiattamento
//                 (usato per items prep_station='pizzeria': fase intermedia
//                  cottura→finitura→ready. Altre stazioni saltano questo step.)
//   ready       → pronto al pass per la consegna al tavolo
//   served      → consegnato al cliente
//   cancelled   → annullato
const ORDER_ITEM_STATUSES = ['pending', 'cooking', 'oven_done', 'ready', 'served', 'cancelled'];

const WORKFLOW_STATUSES = ['waiting', 'production', 'delivered'];

const PAYMENT_METHODS = ['cash', 'card', 'digital', 'room_charge'];

module.exports = { ROLES, TABLE_STATUSES, ORDER_STATUSES, ORDER_ITEM_STATUSES, WORKFLOW_STATUSES, PAYMENT_METHODS };
