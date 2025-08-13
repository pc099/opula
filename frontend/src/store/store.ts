import { configureStore } from '@reduxjs/toolkit';
import agentsReducer from './slices/agentsSlice';
import incidentsReducer from './slices/incidentsSlice';
import costOptimizationReducer from './slices/costOptimizationSlice';
import configurationReducer from './slices/configurationSlice';

export const store = configureStore({
  reducer: {
    agents: agentsReducer,
    incidents: incidentsReducer,
    costOptimization: costOptimizationReducer,
    configuration: configurationReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: ['persist/PERSIST'],
      },
    }),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;