#!/bin/sh
set -eu

if [ -x "/opt/mssql-tools18/bin/sqlcmd" ]; then
  SQLCMD="/opt/mssql-tools18/bin/sqlcmd"
elif [ -x "/opt/mssql-tools/bin/sqlcmd" ]; then
  SQLCMD="/opt/mssql-tools/bin/sqlcmd"
else
  echo "sqlcmd not found in mssql-tools container."
  exit 1
fi
DB_NAME="${DB_NAME:-EducationSystem}"
DB_USER="${DB_USER:-sa}"
DB_PASSWORD="${DB_PASSWORD:-YourStrong@Passw0rd}"
DB_HOST="${DB_HOST:-mssql}"

echo "Waiting for MSSQL to accept connections..."
until $SQLCMD -S "$DB_HOST,1433" -U "$DB_USER" -P "$DB_PASSWORD" -C -Q "SELECT 1" >/dev/null 2>&1; do
  sleep 3
done

EXISTS=$($SQLCMD -S "$DB_HOST,1433" -U "$DB_USER" -P "$DB_PASSWORD" -C -h -1 -W -Q "SET NOCOUNT ON; SELECT CASE WHEN DB_ID('${DB_NAME}') IS NULL THEN 0 ELSE 1 END")

if [ "$EXISTS" = "1" ]; then
  echo "Database '${DB_NAME}' already exists. Skipping init."
  exit 0
fi

echo "Initializing database '${DB_NAME}' from SQL script..."
$SQLCMD -S "$DB_HOST,1433" -U "$DB_USER" -P "$DB_PASSWORD" -C -i /scripts/CreateDatabaseAndTables.sql

echo "Database initialization completed."
