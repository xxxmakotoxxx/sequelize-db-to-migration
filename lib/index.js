const Sequelize = require('sequelize');
const async = require('async');
const fs = require("fs");
const path = require('path');
const mkdirp = require('mkdirp');

function AutoSequelizeMigration(database, username, password, options) {
  this.sequelize = new Sequelize(database, username, password, options || {});
  this.options = options;
}

AutoSequelizeMigration.prototype.run = async function(callback) {
  const self = this;

  try {
    await this.sequelize.authenticate();
    this.queryInterface = await this.sequelize.getQueryInterface();
    console.log('Connection has been established successfully.');
  } catch (error) {
    console.error('Unable to connect to the database:', error);
  }

  mkdirp.sync(path.resolve(self.options.directory));

  let tables = await this.queryInterface.showAllTables();
  if (self.options.tables) {
    tables = tables.filter(table => { return self.options.tables.includes(table) });
  } else if (self.options.skipTables) {
    tables = tables.filter(table => { return !self.options.skipTables.includes(table) });
  }
  tables = tables.filter(table => {
    if(table != 'SequelizeMeta') return true;
  });

  await Promise.all(tables.map(async table => {
    const describe_table = await this.queryInterface.describeTable(table);
    let indexs = await this.sequelize.query(
      'SHOW INDEX FROM ' + table,
      {
        raw: false,
        type: this.sequelize.QueryTypes.SELECT
      },
    );
    indexs = indexs.filter(index => {
      if(index.Key_name != 'PRIMARY') {
        return true;
      }
    });
    let index_object = {};
    indexs.forEach(index => {
      if(index.Key_name in index_object) {
        index_object[index.Key_name].push(index);
      } else {
        index_object[index.Key_name] = [index];
      }
    });

    outputFile(table, describe_table, index_object);
  }));

  self.sequelize.close();

  function outputFile(table, describe_table, indexs) {
    const stream = fs.createWriteStream(self.options.directory + "/" + table + ".js", { encoding: 'utf8'});
    stream.write("'use strict';\n");
    stream.write("module.exports = {\n");
    stream.write("  up: async (queryInterface, Sequelize) => {\n");
    stream.write("    return Promise.all([\n");

    // generate createTable text
    stream.write("      await queryInterface.createTable('" + table + "', {\n");

    const table_columns = Object.keys(describe_table);
    table_columns.map(column => {
      stream.write("        " + column + ": {\n");
      const column_detail = describe_table[column];
      const data_type = convert_data_type(column_detail.type);
      if (data_type == null) throw '[ERROR]Not exist data. table: ' + table + ' type :' + column_detail.type;
      stream.write("          type: " + data_type + ",\n");
      stream.write("          allowNull: " + column_detail.allowNull + ",\n");
      if(column_detail.defaultValue) {
        stream.write("          defaultValue: " + column_detail.defaultValue + ",\n");
      };
      if(column_detail.primaryKey) {
        stream.write("          primaryKey: " + column_detail.primaryKey + ",\n");
      };
      if(column_detail.autoIncrement) {
        stream.write("          autoIncrement: " + column_detail.autoIncrement + ",\n");
      };
      if(column_detail.comment) {
        stream.write("          comment: " + column_detail.comment + ",\n");
      };
      stream.write("        },\n");
    });
    stream.write("      }),\n");

    // generate addIndex text
    const index_key_names = Object.keys(indexs);
    if(index_key_names.length > 0) {
      index_key_names.forEach(key_name => {
        stream.write("      await queryInterface.addIndex(\n");
        stream.write("        '" + table + "',\n");
  
        let columns = [];
        let index_values = indexs[key_name];
        index_values.sort(function(a, b) {
          return a.Seq_in_index - b.Seq_in_index;
        }).forEach(index_value => {
          columns.push("'" + index_value.Column_name + "'");
        });
        stream.write("        [" + columns.join(",") + "],\n");
        stream.write("        {\n");
        stream.write("          name: '" + key_name + "',\n");
        if(index_values[0].Non_unique == 0) {
          stream.write("          unique: true,\n");
        }
        stream.write("        }\n");
        stream.write("      ),\n");
      });
    }

    stream.write("    ]);\n");
    stream.write("  },\n");

    // generate dropTable text
    stream.write("  down: (queryInterface, Sequelize) => {\n");
    stream.write("    return Promise.all([\n");
    stream.write("      queryInterface.dropTable('" + table + "')\n");
    stream.write("    ]);\n");
    stream.write("  }\n");

    stream.write("};\n");
    stream.end();

    // エラー処理
    stream.on("error", (err)=>{
      if(err)
        console.log(err.message);
    });
  }

  function convert_data_type(data_type) {
    let sequelize_data_type = ['Sequelize'];
    const reg_no_convert_list_1 = new RegExp('^TEXT$|^TIME$|ENUM|^BLOB');
    const reg_no_convert_list_2 = new RegExp('INTEGER|BIGINT|FLOAT|DOUBLE|TINYINT|SMALLINT|MEDIUMINT|DECIMAL');
    const reg_no_convert_list_3 = new RegExp('^INT\\(');
    const reg_no_sequelize_list = new RegExp('YEAR|GEOMETRY|POINT|LINESTRING|POLYGON|GEOMETRY|^VARBINARY\\(|BINARY\\(|BIT\\(');
    if(data_type.match(reg_no_convert_list_1)) {
      sequelize_data_type.push(data_type);
    } else if(data_type.match(reg_no_convert_list_2)) {
      const [is_unsigned, is_zerofill] = isAddOptions(data_type);
      data_type = data_type.replace('UNSIGNED', '');
      data_type = data_type.replace('ZEROFILL', '');
      data_type = data_type.trim();
      sequelize_data_type.push(data_type);
      if (is_unsigned) sequelize_data_type.push('UNSIGNED');
      if (is_zerofill) sequelize_data_type.push('ZEROFILL');
    } else if(data_type.match(reg_no_convert_list_3)) {
      const [is_unsigned, is_zerofill] = isAddOptions(data_type);
      data_type = data_type.replace('UNSIGNED', '');
      data_type = data_type.replace('ZEROFILL', '');
      data_type = data_type.trim();
      sequelize_data_type.push(data_type.replace('INT', 'INTEGER'));
      if (is_unsigned) sequelize_data_type.push('UNSIGNED');
      if (is_zerofill) sequelize_data_type.push('ZEROFILL');
    } else if(data_type.match(reg_no_sequelize_list)) {
      sequelize_data_type = ["'" + data_type + "'"];
    } else if(data_type.indexOf('VARCHAR(') != -1) {
      sequelize_data_type.push(data_type.replace('VARCHAR', 'STRING'));
    } else if(data_type.indexOf('VARCHAR BINARY') != -1) {
      sequelize_data_type.push('STRING');
      sequelize_data_type.push('BINARY');
    } else if(data_type.indexOf('CHAR') != -1 && data_type.indexOf('BINARY') != -1) {
      data_type = data_type.replace('BINARY', '').trim();
      sequelize_data_type.push(data_type);
      sequelize_data_type.push('BINARY');
    } else if(data_type.indexOf('CHAR(') != -1) {
      sequelize_data_type.push(data_type);
    } else if(data_type.indexOf('TINYTEXT') != -1) {
      sequelize_data_type.push("TEXT('tiny')");
    } else if(data_type.indexOf('MEDIUMTEXT') != -1) {
      sequelize_data_type.push("TEXT('medium')");
    } else if(data_type.indexOf('LONGTEXT') != -1) {
      sequelize_data_type.push("TEXT('long')");
    } else if(data_type.indexOf('TINYBLOB') != -1) {
      sequelize_data_type.push("BLOB('tiny')");
    } else if(data_type.indexOf('MEDIUMBLOB') != -1) {
      sequelize_data_type.push("BLOB('medium')");
    } else if(data_type.indexOf('LONGBLOB') != -1) {
      sequelize_data_type.push("BLOB('long')");
    } else if(data_type.indexOf('TINYINT(1)') != -1) {
      sequelize_data_type.push('BOOLEAN');
    } else if(data_type.indexOf('DATETIME') != -1) {
      sequelize_data_type.push(data_type.replace('DATETIME', 'DATE'));
    } else if(data_type.indexOf('DATE') != -1) {
      sequelize_data_type.push('DATEONLY');
    } else if(data_type.indexOf('TIMESTAMP') != -1) {
      sequelize_data_type = ["'TIMESTAMP'"];
    } else {
      return null;
    }
    return sequelize_data_type.join('.');
  }

  function isAddOptions(data_type) {
    let is_unsigned = false;
    let is_zerofill = false;
    if(data_type.indexOf('UNSIGNED') != -1) {
      is_unsigned = true;
    }
    if(data_type.indexOf('ZEROFILL') != -1) {
      is_zerofill = true;
    }
    return [is_unsigned, is_zerofill];
  }

  console.log("Done! generated migration files.");
}

module.exports = AutoSequelizeMigration;
