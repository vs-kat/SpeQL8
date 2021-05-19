const pg = require('pg');
const { ApolloServer } = require("apollo-server");
const { makeSchemaAndPlugin } = require("postgraphile-apollo-server");
const { ApolloLogPlugin } = require('apollo-log');
const {performance} = require('perf_hooks');
require('dotenv').config();
// const vizData = require('./src/datatest')
// console.log(vizData);

// REDIS
const Redis = require("ioredis");
const redis = new Redis();

const services = [
  {
    label: 'first',
    db_uri: 'postgres://wkydcwrh:iLsy9WNRsMy_LVodJG9Uxs9PARNbiBLb@queenie.db.elephantsql.com:5432/wkydcwrh',
    port: 4000
  },
  {
    label: 'second',
    db_uri: 'postgres://dgpvvmbt:JzsdBZGdpT1l5DfQz0hfz0iT7BrKgxhr@queenie.db.elephantsql.com:5432/dgpvvmbt',
    port: 4001
  },
]

  services.forEach((service) => {
  const pgPool = new pg.Pool({
    //do this via an environment variable
    connectionString: service.db_uri
  });
  
  async function main() {
    const { schema, plugin } = await makeSchemaAndPlugin(
      pgPool,
      'public', // PostgreSQL schema to use
      {
        // PostGraphile options, see:
        // https://www.graphile.org/postgraphile/usage-library/
        // watchPg: true,
              graphiql: true,
              graphlqlRoute: `/${service.label}/graphql`,
              //These are not the same!
              //not using the graphiql route below
              graphiqlRoute: `/${service.label}/test`,
              enhanceGraphiql: true
      }
    );

    const myPlugin = {
      requestDidStart(context) {
          if (context.request.operationName!=="IntrospectionQuery") {
          //Log the query sent by the client
          // console.log(context.request.query);
              // console.log(context.request.operationName);
              return {
                  willSendResponse(requestContext) {
                      //Log the tracing extension data of the response
                      let extensions = requestContext.response.extensions;
                      redis.set(`placeholder`, extensions.tracing.duration + ' microseconds');
                      console.log(extensions.tracing.execution);
                  },
              };
          };
      }
    };  
    const options = {
      
    }
  
    const server = new ApolloServer({
      schema,
      plugins: [plugin, myPlugin, ApolloLogPlugin(options)],
      tracing: true,
      // subscriptions: { path: `/${service}` }
    });
  
    await server.listen(service.port);
    
    //commenting this out for the moment - as it says port 4000 - but we'll be accesing via port 8080
    console.log(`service: ${service.port}`)
    console.log(`🔮 Fortunes being told on port ${service.port}✨`);
  }

  
  main().catch(e => {
    console.error(e);
    process.exit(1);
  });
}); //for the forEach
// } //for the objectEntries