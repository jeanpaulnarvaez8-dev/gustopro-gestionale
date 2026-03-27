import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'https://loyal-eagerness-production.up.railway.app/api',
  withCredentials: false,
});

// Attach JWT to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('gustopro_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Auto-logout on 401
api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('gustopro_token');
      localStorage.removeItem('gustopro_user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

// Auth
export const authAPI = {
  login: (pin) => api.post('/auth/login', { pin }),
};

// Users (admin)
export const usersAPI = {
  list:   ()         => api.get('/users'),
  create: (data)     => api.post('/users', data),
  update: (id, data) => api.put(`/users/${id}`, data),
  remove: (id)       => api.delete(`/users/${id}`),
};

// Zones
export const zonesAPI = {
  list:   ()          => api.get('/zones'),
  create: (data)      => api.post('/zones', data),
  update: (id, data)  => api.put(`/zones/${id}`, data),
  remove: (id)        => api.delete(`/zones/${id}`),
};

// Tables
export const tablesAPI = {
  list:      ()           => api.get('/tables'),
  create:    (data)       => api.post('/tables', data),
  update:    (id, data)   => api.put(`/tables/${id}`, data),
  remove:    (id)         => api.delete(`/tables/${id}`),
  setStatus: (id, status) => api.patch(`/tables/${id}/status`, { status }),
};

// Menu
export const menuAPI = {
  categories:     ()          => api.get('/menu/categories'),
  allCategories:  ()          => api.get('/menu/categories', { params: { all: 'true' } }),
  items:          (catId)     => api.get('/menu/items', { params: { categoryId: catId } }),
  allItems:       ()          => api.get('/menu/items'),
  allItemsAdmin:  (catId)     => api.get('/menu/items', { params: { all: 'true', ...(catId ? { categoryId: catId } : {}) } }),
  itemModifiers:  (itemId)    => api.get(`/menu/items/${itemId}/modifiers`),
  createCategory: (data)      => api.post('/menu/categories', data),
  updateCategory: (id, data)  => api.put(`/menu/categories/${id}`, data),
  deleteCategory: (id)        => api.delete(`/menu/categories/${id}`),
  createItem:     (data)      => api.post('/menu/items', data),
  updateItem:     (id, data)  => api.put(`/menu/items/${id}`, data),
  deleteItem:     (id)        => api.delete(`/menu/items/${id}`),
};

// Orders
export const ordersAPI = {
  create:     (data)          => api.post('/orders', data),
  get:        (id)            => api.get(`/orders/${id}`),
  addItems:   (id, items)     => api.post(`/orders/${id}/items`, { items }),
  cancelItem: (id, itemId)    => api.delete(`/orders/${id}/items/${itemId}`),
};

// KDS
export const kdsAPI = {
  pending:          ()              => api.get('/kds/pending'),
  updateItemStatus: (id, status)    => api.patch(`/kds/items/${id}/status`, { status }),
};

// Billing
export const billingAPI = {
  preConto: (orderId) => api.get(`/billing/pre-conto/${orderId}`),
  pay:      (data)    => api.post('/billing/pay', data),
  receipts: ()        => api.get('/billing/receipts'),
};

// Admin
export const adminAPI = {
  stats:     ()            => api.get('/admin/stats'),
  hourly:    ()            => api.get('/admin/stats/hourly'),
  topItems:  (days, limit) => api.get('/admin/analytics/top-items', { params: { days, limit } }),
  weekday:   (weeks)       => api.get('/admin/analytics/weekday', { params: { weeks } }),
  taxReport:           (from, to) => api.get('/admin/tax-report', { params: { from, to } }),
  stockReconciliation: (from, to) => api.get('/admin/stock-reconciliation', { params: { from, to } }),
  staffPerformance:    (period)   => api.get('/admin/staff-performance', { params: { period } }),
};

// Combos (menù fissi)
export const comboAPI = {
  list:             ()            => api.get('/combos'),
  create:           (data)        => api.post('/combos', data),
  update:           (id, data)    => api.put(`/combos/${id}`, data),
  remove:           (id)          => api.delete(`/combos/${id}`),
  addCourse:        (id, data)    => api.post(`/combos/${id}/courses`, data),
  removeCourse:     (courseId)    => api.delete(`/combos/courses/${courseId}`),
  addCourseItem:    (courseId, d) => api.post(`/combos/courses/${courseId}/items`, d),
  removeCourseItem: (itemId)      => api.delete(`/combos/course-items/${itemId}`),
};

// Orders (asporto)
export const asportoAPI = {
  create: (data) => api.post('/orders', { ...data, order_type: 'takeaway' }),
};

// Customers
export const customersAPI = {
  list:   (q)      => api.get('/customers', { params: q ? { q } : {} }),
  get:    (id)     => api.get(`/customers/${id}`),
  create: (data)   => api.post('/customers', data),
  update: (id, d)  => api.put(`/customers/${id}`, d),
  remove: (id)     => api.delete(`/customers/${id}`),
};

// Reservations
export const reservationsAPI = {
  list:     (date)  => api.get('/reservations', { params: date ? { date } : {} }),
  upcoming: ()      => api.get('/reservations/upcoming'),
  create:   (data)  => api.post('/reservations', data),
  update:   (id, d) => api.put(`/reservations/${id}`, d),
  remove:   (id)    => api.delete(`/reservations/${id}`),
};

// Ingredients (stock)
export const ingredientsAPI = {
  list:      ()              => api.get('/ingredients'),
  lowStock:  ()              => api.get('/ingredients/low-stock'),
  create:    (data)          => api.post('/ingredients', data),
  update:    (id, data)      => api.put(`/ingredients/${id}`, data),
  adjust:    (id, data)      => api.post(`/ingredients/${id}/adjust`, data),
  movements: (id)            => api.get(`/ingredients/${id}/movements`),
};

// Recipes
export const recipesAPI = {
  get:    (itemId)                => api.get(`/recipes/${itemId}`),
  cost:   (itemId)                => api.get(`/recipes/${itemId}/cost`),
  upsert: (itemId, data)          => api.post(`/recipes/${itemId}`, data),
  remove: (recipeId)              => api.delete(`/recipes/entry/${recipeId}`),
};

// Inventory
export const inventoryAPI = {
  // Suppliers
  suppliers:     ()        => api.get('/inventory/suppliers'),
  createSupplier:(data)    => api.post('/inventory/suppliers', data),

  // Purchase Orders
  listPOs:       ()        => api.get('/inventory/po'),
  createPO:      (data)    => api.post('/inventory/po', data),
  getPO:         (id)      => api.get(`/inventory/po/${id}`),

  // Goods Receipts
  listReceipts:  ()        => api.get('/inventory/receipts'),
  getReceipt:    (id)      => api.get(`/inventory/receipts/${id}`),
  createReceipt: (data)    => api.post('/inventory/receipts', data),
  confirmItem:   (itemId)  => api.patch(`/inventory/receipt-items/${itemId}/confirm`),

  // Spoilage
  listSpoilage:  ()        => api.get('/inventory/spoilage'),
  createSpoilage:(data)    => api.post('/inventory/spoilage', data),

  // KPIs & barcode
  kpis:          ()        => api.get('/inventory/kpis'),
  barcode:       (code)    => api.get(`/inventory/barcode/${code}`),
};

export const serviceAPI = {
  alerts:      ()   => api.get('/service/alerts'),
  readyItems:  ()   => api.get('/service/ready-items'),
  postpone:    (id) => api.post(`/service/alerts/${id}/postpone`),
  acknowledge: (id) => api.post(`/service/alerts/${id}/acknowledge`),
  markServed:  (id) => api.patch(`/kds/items/${id}/status`, { status: 'served' }),
};

export const assignmentsAPI = {
  list:          (date) => api.get('/assignments', { params: date ? { date } : {} }),
  my:            ()     => api.get('/assignments/my'),
  create:        (data) => api.post('/assignments', data),
  remove:        (id)   => api.delete(`/assignments/${id}`),
  copyYesterday: ()     => api.post('/assignments/copy-yesterday'),
};

export default api;
