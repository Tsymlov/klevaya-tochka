# КлёваяТочка

Публичная карта рыболовных мест с метками пользователей и обновлением в реальном времени.

`КлёваяТочка` — веб-приложение для отображения и публикации рыболовных точек на интерактивной карте. Пользователи видят публичные метки, могут зарегистрироваться, поставить свою точку, отредактировать описание и получать обновления карты в реальном времени.

## Возможности

- публичный просмотр карты без авторизации;
- регистрация, вход и сессионная авторизация;
- создание, редактирование и удаление собственных меток;
- загрузка точек по видимой области карты;
- обновление точек в реальном времени через WebSocket;
- базовая архитектура безопасности для публичного сервиса.

## Стек

- backend: Python, Django, Django REST Framework, Django Channels;
- frontend: React, TypeScript, Vite, MapLibre GL JS;
- данные и real-time: PostgreSQL, PostGIS, Redis;
- локальная среда: Docker Compose.

## Структура

- `docs/PLAN.md` — утвержденный план разработки;
- `backend/` — Django, API, WebSocket и админка;
- `frontend/` — React/Vite приложение с картой;
- `docker-compose.yml` — локальная инфраструктура.

## Текущий статус

В репозитории уже есть первый рабочий срез MVP:

- backend API для auth и меток;
- WebSocket-канал для событий по точкам;
- frontend-карта с формой входа и управлением метками;
- Docker-конфигурация для локального запуска.

## Требования

- установленный `Docker` и `Docker Compose`;
- запущенный Docker daemon или Docker Desktop;
- свободные порты `5173`, `8000`, `5432`, `6379`.

## Быстрый старт

1. Склонировать репозиторий:

```bash
git clone git@github.com:Tsymlov/klevaya-tochka.git
cd klevaya-tochka
```

2. Создать локальный env-файл:

```bash
cp .env.example .env
```

3. Поднять проект:

```bash
docker compose up --build
```

Backend при старте сам применяет миграции через `backend/entrypoint.sh`.

4. Открыть сервисы:

- frontend: `http://localhost:5173`
- backend healthcheck: `http://localhost:8000/api/health/`
- Django admin: `http://localhost:8000/admin/`

## Полезные команды

Остановить проект:

```bash
docker compose down
```

Остановить проект и удалить volume базы:

```bash
docker compose down -v
```

Создать администратора:

```bash
docker compose exec backend python manage.py createsuperuser
```

Посмотреть логи:

```bash
docker compose logs -f
```

## Запуск без Docker

Для локального запуска `manage.py` вне Docker нужны системные библиотеки `GDAL/GEOS` для GeoDjango.
Если они установлены, укажи пути через `GDAL_LIBRARY_PATH` и `GEOS_LIBRARY_PATH` в `.env`.

Минимальная схема:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
cd backend
python manage.py migrate
python manage.py runserver
```

Для frontend:

```bash
cd frontend
npm install
npm run dev
```

## Дальше по разработке

1. Поднять проект локально через Docker и проверить полный runtime-сценарий.
2. Добавить тесты backend API и permissions.
3. Довести UX карты: попапы, фильтры, кластеризацию и обработку ошибок.
4. Подготовить production-конфигурацию и деплой.

## GitHub

Репозиторий опубликован: `https://github.com/Tsymlov/klevaya-tochka`

## Лицензия

Проект распространяется по лицензии `MIT`. См. [LICENSE](LICENSE).
