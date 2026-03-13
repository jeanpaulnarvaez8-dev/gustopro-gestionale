import { createContext, useContext, useReducer, useCallback } from 'react';

const CartContext = createContext(null);

const initialState = {
  tableId: null,
  tableNumber: null,
  items: [],
};

function cartReducer(state, action) {
  switch (action.type) {
    case 'SET_TABLE':
      return { ...state, tableId: action.tableId, tableNumber: action.tableNumber };

    case 'ADD_ITEM': {
      const { item, quantity = 1, modifiers = [], notes } = action;
      const key = `${item.id}-${JSON.stringify(modifiers.map(m => m.modifier_id).sort())}`;
      const existing = state.items.find(i => i._key === key);
      if (existing) {
        return {
          ...state,
          items: state.items.map(i =>
            i._key === key ? { ...i, quantity: i.quantity + quantity } : i
          ),
        };
      }
      return {
        ...state,
        items: [...state.items, { _key: key, item, quantity, modifiers, notes }],
      };
    }

    case 'ADD_COMBO': {
      const { combo, selections } = action;
      const key = `combo-${combo.id}-${Date.now()}`;
      return {
        ...state,
        items: [...state.items, {
          _key: key,
          item: { id: combo.id, name: combo.name, base_price: combo.price, is_combo: true },
          combo_id: combo.id,
          combo_selections: selections,
          quantity: 1,
          modifiers: [],
          notes: null,
        }],
      };
    }

    case 'REMOVE_ITEM':
      return { ...state, items: state.items.filter(i => i._key !== action.key) };

    case 'UPDATE_QUANTITY':
      return {
        ...state,
        items: state.items.map(i =>
          i._key === action.key ? { ...i, quantity: Math.max(1, action.quantity) } : i
        ),
      };

    case 'CLEAR':
      return initialState;

    default:
      return state;
  }
}

export function CartProvider({ children }) {
  const [state, dispatch] = useReducer(cartReducer, initialState);

  const setTable = useCallback((tableId, tableNumber) => {
    dispatch({ type: 'SET_TABLE', tableId, tableNumber });
  }, []);

  const addItem = useCallback((item, quantity, modifiers, notes) => {
    dispatch({ type: 'ADD_ITEM', item, quantity, modifiers, notes });
  }, []);

  const addCombo = useCallback((combo, selections) => {
    dispatch({ type: 'ADD_COMBO', combo, selections });
  }, []);

  const removeItem = useCallback((key) => {
    dispatch({ type: 'REMOVE_ITEM', key });
  }, []);

  const updateQuantity = useCallback((key, quantity) => {
    dispatch({ type: 'UPDATE_QUANTITY', key, quantity });
  }, []);

  const clearCart = useCallback(() => {
    dispatch({ type: 'CLEAR' });
  }, []);

  const total = state.items.reduce((sum, i) => {
    const modExtra = i.modifiers.reduce((s, m) => s + (m.price_extra || 0), 0);
    return sum + (i.item.base_price + modExtra) * i.quantity;
  }, 0);

  const itemCount = state.items.reduce((s, i) => s + i.quantity, 0);

  return (
    <CartContext.Provider value={{
      ...state, total, itemCount,
      setTable, addItem, addCombo, removeItem, updateQuantity, clearCart,
    }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside CartProvider');
  return ctx;
}
