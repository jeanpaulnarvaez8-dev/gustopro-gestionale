import axios from 'axios';
import { enqueueAction, uuidv4 } from './offlineDB';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'https://loyal-eagerness-production.up.railway.app/api',
  withCredentials: false,
});

// ─── Endpoint offline-aware ──────────────────────────────────
// Lista delle mutazioni che, in caso di errore di rete, vengono messe
// in coda IndexedDB invece di propagare l'errore. Per ogni endpoint
// definiamo un kind (per logging/debug) e la regex sul path.
const OFFLINE_AWARE_ENDPOINTS = [
  { method: 'POST', regex: /^\/orders$/,                       kind: 'order:create'    },
  { method: 'POST', regex: /^\/orders\/[a-z0-9-]+\/items$/i,   kind: 'order:add-items' },
];

function isOfflineError(err) {
  if (!err) return false;
  // Axios sets ERR_NETWORK quando non c'è risposta dal server
  if (err.code === 'ERR_NETWORK' || err.code === 'ECONNABORTED') return true;
  if (!err.response && err.message === 'Network Error') return true;
  // 503 Service Unavailable → backend giù
  if (err.response?.status === 503) return true;
  // Browser dichiara offline esplicitamente
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  return false;
}

function pathOf(url) {
  if (!url) return '';
  // url può essere assoluto o path relativo. new URL gestisce entrambi se gli
  // diamo una base fittizia.
  try {
    return new URL(url, 'http://_').pathname;
  } catch {
    return url.split('?')[0];
  }
}

function decodeJwtTenantId(token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.tenant_id || null;
  } catch {
    return null;
  }
}

// ─── Request interceptor ─────────────────────────────────────
// 1. Attach JWT
// 2. Inject Idempotency-Key su POST/PATCH/DELETE (se non già presente)
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('gustopro_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;

  const method = (config.method || '').toUpperCase();
  if (['POST', 'PATCH', 'DELETE'].includes(method) && !config.headers['Idempotency-Key']) {
    config.headers['Idempotency-Key'] = uuidv4();
  }
  return config;
});

// ─── Response interceptor ────────────────────────────────────
// 1. Auto-logout on 401
// 2. Offline detection: se errore di rete su endpoint offline-aware,
//    enqueue azione in IndexedDB e ritorna 202 sintetico (il caller
//    può rilevare _offline=true nella response.data e mostrare un
//    toast "Salvato offline").
api.interceptors.response.use(
  (r) => r,
  async (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('gustopro_token');
      localStorage.removeItem('gustopro_user');
      window.location.href = '/login';
      return Promise.reject(err);
    }

    const config = err.config;
    if (config && isOfflineError(err)) {
      const method = (config.method || '').toUpperCase();
      const path = pathOf(config.url);
      const match = OFFLINE_AWARE_ENDPOINTS.find(
        (e) => e.method === method && e.regex.test(path)
      );
      if (match) {
        try {
          const idempotencyKey = config.headers['Idempotency-Key'] || uuidv4();
          const body = config.data
            ? (typeof config.data === 'string' ? JSON.parse(config.data) : config.data)
            : null;
          const token = localStorage.getItem('gustopro_token');
          const tenantId = decodeJwtTenantId(token);

          await enqueueAction({
            kind: match.kind,
            method,
            endpoint: path,
            body,
            tenantId,
            authToken: token,
            idempotencyKey,
          });

          // Risposta sintetica 202: il caller la vede come success ma puo'
          // rilevare _offline=true per mostrare feedback dedicato.
          return {
            status: 202,
            statusText: 'Accepted (queued offline)',
            data: {
              _offline: true,
              queued: true,
              kind: match.kind,
              idempotencyKey,
              message: 'Salvato in coda offline. Sincronizzo al ripristino della rete.',
            },
            headers: {},
            config,
            request: null,
          };
        } catch (queueErr) {
          console.error('[offline] enqueue failed:', queueErr);
          // se la coda fallisce, propaga errore originale
        }
      }
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

export const coursesAPI = {
  timing:           ()          => api.get('/courses/timing'),
  updateTiming:     (id, data)  => api.put(`/courses/timing/${id}`, data),
  updateDisplay:    (itemId, display_status) => api.patch(`/courses/items/${itemId}/display`, { display_status }),
  sendCourse:       (order_id, course_type) => api.post('/courses/send-course', { order_id, course_type }),
  markCourseServed: (order_id, course_type) => api.post('/courses/mark-course-served', { order_id, course_type }),
  orderStatus:      (orderId)   => api.get(`/courses/order/${orderId}/status`),
};

// Workflow (sistema comande A/P/C)
export const workflowAPI = {
  changeStatus:          (itemId, workflow_status) => api.patch(`/workflow/items/${itemId}/status`, { workflow_status }),
  getWaiting:            ()       => api.get('/workflow/waiting'),
  getCrossmatches:       ()       => api.get('/workflow/crossmatches'),
  getPendingAlerts:      ()       => api.get('/workflow/alerts/pending'),
  respondToAlert:        (alertId, action, defer_minutes) => api.post(`/workflow/alerts/${alertId}/respond`, { action, defer_minutes }),
  getDirectDelivered:    ()       => api.get('/workflow/alerts/direct-delivered'),
  deleteItem:            (itemId) => api.delete(`/workflow/items/${itemId}`),
  getAuditLog:           (orderId) => api.get(`/workflow/audit/${orderId}`),
};

// ─── Super-admin (server-to-server, no JWT) ───────────────────
// Auth via X-Superadmin-Key header. La chiave vive in sessionStorage:
// scompare alla chiusura della tab ed e' separata da JWT del normale login.
const superadminApi = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'https://loyal-eagerness-production.up.railway.app/api',
});
superadminApi.interceptors.request.use((config) => {
  const sak = sessionStorage.getItem('gustopro_sak');
  if (sak) config.headers['X-Superadmin-Key'] = sak;
  return config;
});

export const superadminAPI = {
  setKey:   (key) => sessionStorage.setItem('gustopro_sak', key),
  clearKey: ()    => sessionStorage.removeItem('gustopro_sak'),
  hasKey:   ()    => !!sessionStorage.getItem('gustopro_sak'),
  listTenants:   ()         => superadminApi.get('/superadmin/tenants'),
  createTenant:  (data)     => superadminApi.post('/superadmin/tenants', data),
  updateTenant:  (id, data) => superadminApi.patch(`/superadmin/tenants/${id}`, data),
};

// Debug helper opt-in (solo se localStorage.gustopro_dev_mode === '1')
if (typeof window !== 'undefined' && localStorage.getItem('gustopro_dev_mode') === '1') {
  window.gustoApi = api;
}

export default api;
