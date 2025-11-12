import { create, StateCreator } from 'zustand';
import { createSelectors } from './zustand';

type AsyncFunction = (...args: any[]) => Promise<any>;

type AsyncFunctions<T> = {
  [K in keyof T]: T[K] extends AsyncFunction ? T[K] : never;
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

export interface IBaseModelState<T extends Record<string, any>> {
  loadingStates: LoadingStates<T>;
  errorsState: ErrorsState<T>;
  lastUpdatedStates: LastUpdatedStates<T>;
  reset: () => void;
}

export const createModel = <DataState extends Record<string, any>, Actions extends AsyncFunctions<Actions>>(
  initialDataState: DataState,
  asyncActions: Actions,
) => {
  type FullState = DataState & Actions & IBaseModelState<Actions>;

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
    // @ts-ignore
    const stateWithBase: FullState = {
      ...initialDataState,
      ...asyncActions,
      loadingStates: initialLoadingStates,
      errorsState: initialErrorsState,
      lastUpdatedStates: initialLastUpdatedStates,
      reset: () => set(initialDataState as FullState),
    } as FullState;

    const wrappedAsyncActions = Object.keys(asyncActions).reduce((acc, key) => {
      // @ts-ignore
      const originalMethod = (asyncActions as any)[key] as AsyncFunction;
      // @ts-ignore
      (acc as any)[key] = async (...args: any[]) => {
        set((state) => ({
          loadingStates: { ...state.loadingStates, [key]: true },
          errorsState: { ...state.errorsState, [key]: false },
        } as Partial<FullState>));
        try {
          const result = await originalMethod(...args);
          // Если результат - объект Partial<DataState>, обновляем DataState и lastUpdatedStates
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
    }, {} as Actions);

    return {
      ...stateWithBase,
      ...wrappedAsyncActions,
    };
  };

  const _useModel = create<FullState>(storeCreator);
  return createSelectors(_useModel);
};

interface IUseFreshnessOptions {
  staleTimeMs?: number; // Время в миллисекундах, после которого данные считаются устаревшими (по умолчанию 5 минут)
}

export const createFreshnessHook = <DataState extends Record<string, any>, Actions extends AsyncFunctions<Actions>>(
  useModel: ReturnType<typeof createModel<DataState, Actions>>
) => {
  return (
    dataKey: keyof DataState,
    options?: IUseFreshnessOptions
  ) => {
    const { staleTimeMs = 5 * 60 * 1000 } = options || {};
    const lastUpdated = useModel.use.lastUpdatedStates()[dataKey];

    const isDataStale = () => {
      if (!lastUpdated) {
        return true; // Если данные никогда не обновлялись, они устарели
      }
      const now = new Date();
      return (now.getTime() - lastUpdated.getTime()) > staleTimeMs;
    };

    return { isDataStale, lastUpdated };
  };
};