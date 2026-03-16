#!/bin/sh
set -eu

until python manage.py migrate --noinput; do
  echo "Waiting for database..."
  sleep 2
done

exec "$@"
