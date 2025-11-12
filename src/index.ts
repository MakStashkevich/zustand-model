import { create, StateCreator } from 'zustand';
import { createSelectors } from './zustand';

type AnyFunction = (...args: any[]) => any;

type AsyncFunction = (...args: any[]) => Promise<any>;

type AsyncFunctions<T> = {
  [K in keyof T]: T[K] extends AsyncFunction ? T[K] : never;
};

type SyncFunctions<T> = {
  [K in keyof T]: T[K] extends AsyncFunction ? never : T[K];
};

type LoadingStates<T extends Record<string, any>> = {
  [K in keyof AsyncFunctions<T>]: boolean;
};

type ErrorsState<T extends Record<string, any>> = {
  [K in keyof AsyncFunctions<T>]: boolean;
};

type LastUpdatedStates<T extends Record<string, any>> = {
  [K in keyof T]?: Date | null;
};

export interface IBaseModelActions {
  [key: string]: AnyFunction;
}

export interface IBaseModelState<T extends Record<string, any>> {
  loadingStates: LoadingStates<T>;
  errorsState: ErrorsState<T>;
  lastUpdatedStates: LastUpdatedStates<T>;
  reset: () => void;
}

export const createModel = <
  DataState extends Record<string, any>,
  Actions extends Record<string, AnyFunction>,
>(
  initialDataState: DataState,
  actions: Actions,
) => {
  type FullState = DataState & Actions & IBaseModelState<Actions>;

  const asyncActions = Object.keys(actions).reduce((acc, key) => {
    const action = actions[key];
    if (action.constructor.name === 'AsyncFunction') {
      // @ts-ignore
      acc[key] = action;
    }
    return acc;
  }, {} as AsyncFunctions<Actions>);

  const syncActions = Object.keys(actions).reduce((acc, key) => {
    const action = actions[key];
    if (action.constructor.name !== 'AsyncFunction') {
      // @ts-ignore
      acc[key] = action;
    }
    return acc;
  }, {} as SyncFunctions<Actions>);

  const initialLoadingStates: LoadingStates<Actions> = Object.keys(asyncActions).reduce(
    (acc, key) => ({ ...acc, [key]: false }),
    {} as LoadingStates<Actions>,
  );

  const initialErrorsState: ErrorsState<Actions> = Object.keys(asyncActions).reduce(
    (acc, key) => ({ ...acc, [key]: false }),
    {} as ErrorsState<Actions>,
  );

  const initialLastUpdatedStates: LastUpdatedStates<DataState> = Object.keys(initialDataState).reduce(
    (acc, key) => ({ ...acc, [key]: null }),
    {} as LastUpdatedStates<DataState>,
  );

  const storeCreator: StateCreator<FullState> = (set) => {
    const wrappedAsyncActions = Object.keys(asyncActions).reduce((acc, key) => {
      const originalMethod = (asyncActions as any)[key] as AsyncFunction;
      // @ts-ignore
      (acc as any)[key] = async (...args: any[]) => {
        set((state) => ({
          loadingStates: { ...state.loadingStates, [key]: true },
          errorsState: { ...state.errorsState, [key]: false },
        } as Partial<FullState>));
        try {
          const result = await originalMethod(...args);
          if (typeof result === 'object' && result !== null && !Array.isArray(result)) {
            const updatedDataState: Partial<DataState> = result;
            const newLastUpdatedStates: LastUpdatedStates<DataState> = {};
            for (const dataKey in updatedDataState) {
              if (Object.prototype.hasOwnProperty.call(updatedDataState, dataKey)) {
                newLastUpdatedStates[dataKey] = new Date();
              }
            }
            set((state) => ({
              ...state,
              ...updatedDataState,
              lastUpdatedStates: { ...state.lastUpdatedStates, ...newLastUpdatedStates },
            } as Partial<FullState>));
          }
          set((state) => ({ errorsState: { ...state.errorsState, [key]: false } } as Partial<FullState>));
          return result;
        } catch (e) {
          set((state) => ({ errorsState: { ...state.errorsState, [key]: true } } as Partial<FullState>));
          throw e;
        } finally {
          set((state) => ({ loadingStates: { ...state.loadingStates, [key]: false } } as Partial<FullState>));
        }
      };
      return acc;
    }, {} as AsyncFunctions<Actions>);

    const wrappedSyncActions = Object.keys(syncActions).reduce((acc, key) => {
      const originalMethod = (syncActions as any)[key] as AnyFunction;
      // @ts-ignore
      (acc as any)[key] = (...args: any[]) => {
        const result = originalMethod(...args);
        if (typeof result === 'object' && result !== null && !Array.isArray(result)) {
          const updatedDataState: Partial<DataState> = result;
          const newLastUpdatedStates: LastUpdatedStates<DataState> = {};
          for (const dataKey in updatedDataState) {
            if (Object.prototype.hasOwnProperty.call(updatedDataState, dataKey)) {
              newLastUpdatedStates[dataKey] = new Date();
            }
          }
          set((state) => ({
            ...state,
            ...updatedDataState,
            lastUpdatedStates: { ...state.lastUpdatedStates, ...newLastUpdatedStates },
          } as Partial<FullState>));
        }
        return result;
      };
      return acc;
    }, {} as SyncFunctions<Actions>);

    const stateWithBase: FullState = {
      ...initialDataState,
      ...wrappedAsyncActions,
      ...wrappedSyncActions,
      loadingStates: initialLoadingStates,
      errorsState: initialErrorsState,
      lastUpdatedStates: initialLastUpdatedStates,
      reset: () => set(initialDataState as FullState),
    } as FullState;

    return stateWithBase;
  };

  const _useModel = create<FullState>(storeCreator);
  return createSelectors(_useModel);
};

interface IUseFreshnessOptions {
  staleTimeMs?: number; // Время в миллисекундах, после которого данные считаются устаревшими (по умолчанию 5 минут)
}

export const createFreshnessHook = <
  DataState extends Record<string, any>,
  Actions extends Record<string, AnyFunction>,
>(
  useModel: ReturnType<typeof createModel<DataState, Actions>>,
) => {
  return (dataKey: keyof DataState, options?: IUseFreshnessOptions) => {
    const { staleTimeMs = 5 * 60 * 1000 } = options || {};
    const lastUpdated = useModel.use.lastUpdatedStates()[dataKey];

    const isDataStale = () => {
      if (!lastUpdated) {
        return true; // Если данные никогда не обновлялись, они устарели
      }
      const now = new Date();
      return now.getTime() - lastUpdated.getTime() > staleTimeMs;
    };

    return { isDataStale, lastUpdated };
  };
};