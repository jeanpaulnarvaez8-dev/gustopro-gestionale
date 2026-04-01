const ROLES = ['admin', 'manager', 'waiter', 'kitchen', 'cashier'];

const TABLE_STATUSES = ['free', 'occupied', 'parked', 'dirty', 'reserved'];

const ORDER_STATUSES = ['open', 'completed', 'cancelled', 'parked'];

const ORDER_ITEM_STATUSES = ['pending', 'cooking', 'ready', 'served', 'cancelled'];

const WORKFLOW_STATUSES = ['waiting', 'production', 'delivered'];

const PAYMENT_METHODS = ['cash', 'card', 'digital', 'room_charge'];

module.exports = { ROLES, TABLE_STATUSES, ORDER_STATUSES, ORDER_ITEM_STATUSES, WORKFLOW_STATUSES, PAYMENT_METHODS };
