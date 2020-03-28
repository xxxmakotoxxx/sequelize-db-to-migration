# sequelize-db-to-migration
Automatically generate sequelize migrations from your database.

## Install

```
npm install -g sequelize-db-to-migration
```

## Prerequisites

You will need to install the correct dialect binding globally before using sequelize-db-to-migration.

Example for MySQL

```
npm install -g mysql2
```

## Usage

```
[node] sequelize-db-to-migration -h <host> -d <database> -u <user> -x [password] -p [port] -c [/path/to/config] -o [/path/to/migrations] -t [tableName]

Options:
  -h, --host        IP/Hostname for the database.   [required]
  -d, --database    Database name.                  [required]
  -u, --user        Username for database.
  -x, --pass        Password for database.
  -p, --port        Port number for database.
  -c, --config      Preset options file in JSON.
  -o, --output      What directory to place the migrations.
  -t, --tables      Comma-separated names of tables to import
  -T, --skip-tables Comma-separated names of tables to skip
```

## Example

```
sequelize-db-to-migration -d migration_database -h localhost -u username -p 3306 -x password
```

## Configuration options

Options can be preset.
```
{
  "dialect": "mysql",
  "port": 3306,
  "host": "localhost",
  "directory": "path/to/migrations",
  "dialect": "mysql", // This version only supports mysql.
  "tables": ['target_table1', 'target_table2'],
  "skipTables": ['not_target_table1', 'not_target_table2']
}
```
