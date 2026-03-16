# КлёваяТочка

Публичная карта рыболовных мест с метками пользователей и обновлением в реальном времени.

## Структура

- `docs/PLAN.md` — утвержденный план разработки;
- `backend/` — Django, API, WebSocket и админка;
- `frontend/` — React/Vite приложение с картой;
- `docker-compose.yml` — локальная инфраструктура.

## Текущий статус

В репозитории подготовлен стартовый каркас проекта. Следующий шаг — заполнить backend-логику, auth и связать карту с API/WebSocket.

## Локальный запуск

```bash
cp .env.example .env
docker compose up --build
```

Backend при старте сам применяет миграции через `backend/entrypoint.sh`.

Для локального запуска `manage.py` вне Docker нужны системные библиотеки `GDAL/GEOS` для GeoDjango.
Если они установлены, укажи пути через `GDAL_LIBRARY_PATH` и `GEOS_LIBRARY_PATH` в `.env`.

## Ближайшие задачи

1. Довести backend-модель и auth до рабочего состояния.
2. Подключить карту MapLibre к реальным данным.
3. Включить real-time обновления точек через WebSocket.

## GitHub

После первого коммита можно опубликовать репозиторий так:

```bash
git add .
git commit -m "Initial project scaffold"
git remote add origin git@github.com:YOUR_USERNAME/klevaya-tochka.git
git push -u origin main
```
