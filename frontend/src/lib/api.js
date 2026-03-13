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
  list:   ()     => api.get('/zones'),
  create: (data) => api.post('/zones', data),
};

// Tables
export const tablesAPI = {
  list:      ()           => api.get('/tables'),
  create:    (data)       => api.post('/tables', data),
  update:    (id, data)   => api.put(`/tables/${id}`, data),
  setStatus: (id, status) => api.patch(`/tables/${id}/status`, { status }),
};

// Menu
export const menuAPI = {
  categories:    ()        => api.get('/menu/categories'),
  items:         (catId)   => api.get('/menu/items', { params: { categoryId: catId } }),
  allItems:      ()        => api.get('/menu/items'),
  itemModifiers: (itemId)  => api.get(`/menu/items/${itemId}/modifiers`),
  createCategory:(data)    => api.post('/menu/categories', data),
  createItem:    (data)    => api.post('/menu/items', data),
  updateItem:    (id, data)=> api.put(`/menu/items/${id}`, data),
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
  stats:    ()             => api.get('/admin/stats'),
  hourly:   ()             => api.get('/admin/stats/hourly'),
  topItems: (days, limit)  => api.get('/admin/analytics/top-items', { params: { days, limit } }),
  weekday:  (weeks)        => api.get('/admin/analytics/weekday', { params: { weeks } }),
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

export default api;
