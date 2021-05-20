const pg = require('pg');
const express = require('express');
const { ApolloServer } = require("apollo-server-express");
const { makeSchemaAndPlugin } = require("postgraphile-apollo-server");
const { ApolloLogPlugin } = require('apollo-log');
// const {performance} = require('perf_hooks');
const cors = require('cors');

const servicesModule = require('./src/services');
const services = servicesModule.services;
const timeDataModule = require('./src/timeData');
const timeData = timeDataModule.timeData;

// REDIS
const Redis = require("ioredis");
// const { create } = require('eslint/lib/rules/*');
const redis = new Redis();

// REDIS COMMANDS
const { redisController, cachePlugin } = require('./redis/redis-commands.js');

const createNewApolloServer = (service) => {
  const pgPool = new pg.Pool({
    //do this via an environment variable
    connectionString: service.db_uri
  });
    
  async function startApolloServer() {
  
  
    const app = express();
  
    const { schema, plugin } = await makeSchemaAndPlugin(
      pgPool,
      'public', // PostgreSQL schema to use
      {
        // PostGraphile options, see:
        // https://www.graphile.org/postgraphile/usage-library/
        // watchPg: true,
              graphiql: true,
              graphlqlRoute: '/graphql',
              //These are not the same!
              //not using the graphiql route below
              graphiqlRoute: '/test',
              enhanceGraphiql: true
      }
    );
  
  
    const myPlugin = {
      requestDidStart(context) {
        const clientQuery = context.request.query;
        return {
            async willSendResponse(requestContext) {
                // console.log('schemaHash: ' + requestContext.schemaHash);
                // console.log('queryHash: ' + requestContext.queryHash);
                // console.log('operation: ' + requestContext.operation.operation);
                //Log the tracing extension data of the response
                const totalDuration = `${requestContext.response.extensions.tracing.duration} microseconds`;
                const now = Date.now();
                const hash = `${now}-${requestContext.queryHash}`
                const timeStamp = new Date().toDateString();
                await redis.hset(`${hash}`, 'totalDuration', `${totalDuration}`);
                await redis.hset(`${hash}`, 'clientQuery', `${clientQuery.toString()}`);
                await redis.hset(`${hash}`, 'timeStamp', `${timeStamp}`);
                console.log(hash);

                console.log(`Index of '-' is ${hash.indexOf('-')}`)
                const sliceFrom = hash.indexOf('-');
                console.log(`hash to search is ${hash.slice(sliceFrom + 1)}`);
                const param = hash.slice(sliceFrom + 1);
                timeData.push(hash);
                console.log(`timeData = ${timeData}`)
                // fetch(`/${param}`)
                // .then((data => data.json()))
                // .then(results => {
                // console.log(results)
                // })
            },
        };
      }
    }; 
  
  
    const options = {};
  
    const server = new ApolloServer({
      schema,
      plugins: [plugin, myPlugin, ApolloLogPlugin(options)],
      tracing: true
    });
  
    await server.start();
    server.applyMiddleware({ app });
    app.use(express.json());
  
    app.get('/:hash', redisController.serveMetrics, (req, res) => {
      console.log('Result from Redis cache: ');
      console.log(res.locals);
      return res.status(200).send(res.locals);
    })
  
    app.use('*', (req, res) => {
      return res.status(404).send('404 Not Found');
    });
  
    app.use((err, req, res, next) => {
      console.log(err);
      return res.status(500).send('Internal Server Error ' + err);
    });
  
    //const { url } = await server.listen();
    // accesing via port 8080
    await new Promise(resolve => app.listen({ port:service.port }, resolve));
    console.log(`🔮 Fortunes being told at http://localhost:${service.port}${server.graphqlPath}✨`);
    return { server, app };
  }
  
  startApolloServer()
    .catch(e => {
      console.error(e);
      process.exit(1);
    });
  };  


services.forEach((service) => {
  createNewApolloServer(service);
})

const app = express();
app.use(express.json());
app.use(express.urlencoded());
app.use(cors());
app.post('/newServer', (req, res) => {
  console.log('inside the /newServer route')
  console.log(req.body);
  createNewApolloServer(req.body);
})
app.listen(3333, ()=> {
  console.log('listening for new APIs to spin up on port 3333')
});







 
