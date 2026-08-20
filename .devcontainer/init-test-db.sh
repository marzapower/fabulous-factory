#!/bin/sh
# Runs automatically by the postgres image's docker-entrypoint on first boot of an empty
# data volume (docker-entrypoint-initdb.d convention). Creates the second database used
# by TEST_DATABASE_URL alongside the primary POSTGRES_DB=factory database.
set -e

psql -v ON_ERROR_STOP=1 --username "${POSTGRES_USER:-postgres}" <<-EOSQL
    CREATE DATABASE factory_test;
EOSQL
