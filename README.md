# zustand-model

## Жанглируй данными из API-запросов (и не только) как Бог!

Привет друг!

Хочу рассказать тебе про свою новую библиотеку [`@makstashkevich/zustand-model`](https://www.npmjs.com/package/@makstashkevich/zustand-model).

Это такой небольшой, но очень крутой плагин для [Zustand](https://zustand-bear.github.io/zustand/), который помогает навести порядок в работе с асинхронными данными, особенно с API-запросами.

## Зачем я это вообще сделал?

Знаешь, как бывает: пишешь кучу API-запросов, и каждый раз приходится дублировать код для отслеживания состояния загрузки, ошибок, успешного ответа...

А еще эти бесконечные провайдеры, которые засоряют дерево компонентов!

Меня это жутко достало.

Хотелось чего-то простого, элегантного, что позволило бы один раз описать логику работы с API, а потом просто использовать ее в любом месте приложения, не заморачиваясь с лишним кодом. Вот так и родился этот плагин!

Он дает тебе несколько классных преимуществ:
*   **Меньше кода:** Забудь про ручное отслеживание `loading` и `error` для каждого запроса. Плагин делает это за тебя.
*   **Чистота:** Никаких лишних провайдеров! Все работает на базе Zustand, а значит, состояние доступно глобально, но при этом структурировано.
*   **Удобство:** Легко получать данные, состояния загрузки и ошибки прямо в компонентах.
*   **Кэширование:** Есть встроенный механизм для отслеживания "свежести" данных, что очень удобно для кэширования.

## Как это установить?

Все просто, как дважды два:

```bash
npm install @makstashkevich/zustand-model zustand
# или, если ты любишь yarn
yarn add @makstashkevich/zustand-model zustand
```

## Давай посмотрим, как это работает на примерах!

Представь, что у нас есть модель для работы со страницами сайта.

### 1. Создаем модель и действия

Сначала мы определяем, какие данные у нас будут храниться (`IPageModelDataState`) и какие асинхронные действия мы можем выполнять (`IPageModelActions`).

```typescript
import { IBaseModelState, createModel, createFreshnessHook } from '@makstashkevich/zustand-model';

// Предположим, у нас есть такие типы и сервисы API
interface PageSchema {
  pathname: string;
  title: string;
  content: string;
  views: number;
}

interface IPageModelDataState {
  page: PageSchema | null;
  pages: PageSchema[] | null;
  popularPages: PageSchema[] | null;
}

interface IPageModelActions {
  getPage: (pathname: string) => Promise<Partial<IPageModelDataState>>;
  // ... другие действия
}

export type IPageModelState = IPageModelDataState & IPageModelActions & IBaseModelState<IPageModelActions>;

const initialDataState: IPageModelDataState = {
  page: null,
  pages: null,
  popularPages: null,
};

const asyncActions: IPageModelActions = {
  getPage: async (pathname) => {
    // Здесь вызываем наш API-сервис
    const fetchedPage = await fetch(`/api/pages/${pathname}`).then(res => res.json());
    return { page: fetchedPage }; // Возвращаем только то, что хотим обновить в состоянии
  },
  // ... другие действия
};

export const usePageModel = createModel<IPageModelDataState, IPageModelActions>(
  initialDataState,
  asyncActions,
);

// Для удобства можно экспортировать действия напрямую
export const getPage = (pathname: string) => usePageModel.getState().getPage(pathname);
```

### 2. Используем в компоненте — это же магия!

Теперь самое интересное. Как получить данные, узнать, идет ли загрузка, или была ли ошибка? Элементарно!

```typescript jsx
import React, { useEffect } from 'react';
import { usePageModel, getPage } from './pageModel'; // Импортируем нашу модель и действие

function PageDisplay({ pathname }) {
  // Получаем саму страницу
  const page = usePageModel.use.page();
  // Узнаем, идет ли загрузка для действия 'getPage'
  const isLoading = usePageModel.use.loadingStates().getPage;
  // Была ли ошибка при выполнении 'getPage'
  const error = usePageModel.use.errorsState().getPage;

  useEffect(() => {
    // Загружаем страницу, когда компонент монтируется или меняется pathname
    getPage(pathname);
  }, [pathname]);

  if (isLoading) {
    return <p>Загружаю страницу...</p>;
  }

  if (error) {
    return <p>Ой, что-то пошло не так: {error.message}</p>;
  }

  if (!page) {
    return <p>Страница не найдена.</p>;
  }

  return (
    <div>
      <h1>{page.title}</h1>
      <p>{page.content}</p>
      <p>Просмотров: {page.views}</p>
    </div>
  );
}

export default PageDisplay;
```

Видишь? Никаких `useState` для `loading` и `error`, никаких `try/catch` в компоненте! Все это уже внутри модели. Просто вызываешь действие, а потом читаешь состояние. Красота!

### 3. А что насчет кэширования?

Для этого есть специальный хук `createFreshnessHook`. Он позволяет пометить данные как "свежие" или "устаревшие".

```typescript jsx
import React, { useEffect } from 'react';
import { usePageModel, usePageDataFreshness, getPage } from './pageModel';

function CachedPageInfo({ pathname }) {
  const page = usePageModel.use.page();
  // Отслеживаем свежесть для 'page' с ключом 'pathname'
  const { isFresh, markStale } = usePageDataFreshness('page', pathname);

  useEffect(() => {
    // Если данные не свежие, загружаем их
    if (!isFresh) {
      console.log('Данные устарели, загружаю заново...');
      getPage(pathname);
    } else {
      console.log('Данные свежие, использую кэш.');
    }
  }, [pathname, isFresh]);

  const handleRefresh = () => {
    // Принудительно помечаем данные как устаревшие, чтобы они обновились
    markStale();
  };

  return (
    <div>
      <h2>Информация о странице: {page?.title || 'Загрузка...'}</h2>
      <p>Статус данных: {isFresh ? 'Свежие' : 'Устаревшие'}</p>
      <button onClick={handleRefresh}>Обновить данные</button>
    </div>
  );
}

export default CachedPageInfo;
```

Это очень удобно, когда нужно контролировать, когда данные должны быть обновлены, а когда можно использовать кэшированную версию.

### 4. Обновление и удаление данных

Все действия работают по тому же принципу: вызываешь функцию, а модель сама обновляет состояние.

```typescript jsx
import React, { useState } from 'react';
import { usePageModel, updatePage, deletePage } from './pageModel';

function PageActions({ pathname }) {
  const page = usePageModel.use.page();
  const [newTitle, setNewTitle] = useState(page?.title || '');

  useEffect(() => {
    if (page) setNewTitle(page.title);
  }, [page]);

  const handleUpdate = async () => {
    try {
      await updatePage(pathname, { title: newTitle });
      alert('Страница обновлена!');
    } catch (e) {
      alert('Ошибка при обновлении!');
    }
  };

  const handleDelete = async () => {
    if (window.confirm('Точно удалить?')) {
      try {
        await deletePage(pathname);
        alert('Страница удалена!');
        // Возможно, перенаправить пользователя или обновить список страниц
      } catch (e) {
        alert('Ошибка при удалении!');
      }
    }
  };

  return (
    <div>
      <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
      <button onClick={handleUpdate}>Обновить заголовок</button>
      <button onClick={handleDelete}>Удалить страницу</button>
    </div>
  );
}

export default PageActions;
```

Как видишь, все очень интуитивно и требует минимум кода. Надеюсь, тебе понравится!

## Ссылки

-   **GitHub:** [https://github.com/MakStashkevich/zustand-model](https://github.com/MakStashkevich/zustand-model)
-   **npm:** [https://www.npmjs.com/package/@makstashkevich/zustand-model](https://www.npmjs.com/package/@makstashkevich/zustand-model)