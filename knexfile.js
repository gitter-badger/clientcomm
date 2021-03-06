// Update with your config settings.
var credentials = require("./credentials")["db"];
var USER = credentials.user;
var PASS = credentials.password;
var HOST = credentials.host;

module.exports = {

  development: {
    client: "postgresql",
    connection: {
      user: "kuanbutts",
      database: "cc2"
    }
  },

  testing: {
    client: "postgresql",
    connection: {
      user: "kuanbutts",
      database: "cctest"
    }
  },


  production: {
    client: "postgresql",
    connection: {
      host: HOST,
      port: "5432",
      database: "clientcomm",
      user:     USER,
      password: PASS
    },

    pool: {
      min: 2,
      max: 10
    },

    migrations: {
      tableName: "knex_migrations"
    },
  }

};
