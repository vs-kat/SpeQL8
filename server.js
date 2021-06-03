const express = require("express");
const http = require("http");
const servicesModule = require("./src/modules/services");
const services = servicesModule.services;
const pg = require("pg");
const path = require("path");
const { ApolloServer } = require("apollo-server-express");
const { makeSchemaAndPlugin } = require("postgraphile-apollo-server");
const { ApolloLogPlugin } = require("apollo-log");
const cors = require("cors");
const util = require("util");
const exec = util.promisify(require("child_process").exec);
const multer = require("multer");
const upload = multer({ dest: __dirname + "/public/uploads/" });
const fs = require("fs");

// EXPRESS SERVER + CORS
const app = express();
app.use(express.static("dist"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());


// DYNAMIC SERVER SWITCHING
app.post("/newServer", (req, res) => {
  console.log("inside the /newServer route");
  console.log(req.body);
  console.log(services);
  createNewApolloServer(req.body)
    .then((data) => myServers.push(data))
    .catch((err) => {
      console.log(err)
      res.sendStatus(400)});
  res.sendStatus(200);
});

app.post(
  "/uploadFile",
  upload.single("myFile"),
  (req, res, next) => {
    // console.log("FILE", req.file);
    // console.log("BODY", req.body);
    fs.renameSync(
      req.file.destination + req.file.filename,
      req.file.destination + req.file.originalname
    );
    // req.file.filename = req.file.originalname;
    req.fileExtension = req.file.originalname.slice(-4);
    req.p = req.file.destination + req.file.originalname;
    req.label = JSON.stringify(req.body).slice(26, -2);
    next();
  },
  async (req, res, next) => {

    const promisify = async (cmd) => {
      try {
        const { stdout, stderr } = await exec(cmd);
        // console.log("stdout:", stdout);
        // console.log("stderr:", stderr);
      } catch (e) {
        console.error(e);
      }
    };

    await promisify(`createdb -U postgres '${req.label}'`);
    let importSQL;
    if (req.fileExtension === ".sql") {
      await promisify(`psql -U postgres -d ${req.label} < '${req.p}'`);
    } else if (req.fileExtension === ".tar") {
      await promisify(`pg_restore -U postgres -d ${req.label} < '${req.p}'`);
    }
    next();
  },

  async (req, res, next) => {
    const port = services[services.length - 1].port + 1;

    const newServiceFromFile = {
      label: req.label,
      db_uri: `postgres:///${req.label}`,
      port: port,
      fromFile: req.file.originalname
    };

    services.push(newServiceFromFile)

    createNewApolloServer(newServiceFromFile)
      .then(result => myServers.push(result))
      .catch((e) => {
        console.log(e);
        res.sendStatus(500);
      })
    res.locals.service = newServiceFromFile;
    res.status(200).json(res.locals.service);
  })

app.delete("/deleteServer/:port", (req, res) => {
  //close the server for currently accessed port
  const myPort = req.params.port;
  const connectionKey = `6::::${myPort}`;
  myServers.forEach(async (server) => {
    if (myPort == 4000) {
      console.log(
        "You may not close port 4000. Graphiql must be provided an active GraphQL API (of which there will always be one running on 4000)"
      );
    } else if (server._connectionKey == connectionKey) {
      console.log(`server on ${myPort} is about to be shut down`);
     await server.close();
    } else {
      console.log("nothing got hit!");
    }
  });

//remove server instance from services array; if database was connected from .sql or .tar file, drop it from psql client and delete the newly created file from public/uploads directory
  services.forEach(async (service, index) => {
    console.log('in the loop', service.port);
        if(service.port == myPort) {
          if(service.fromFile) {
          try {
            const { stdout, stderr } = await exec(`dropdb -U postgres ${service.label};`)
            console.log(stdout);
            console.log(stderr);
          } catch (e) {
            console.error(e);
          }

          try {
            fs.unlink(path.resolve(__dirname, `./public/uploads/${service.fromFile}`));
          } catch(err) {
            console.error(err)
          }
        }
     services.splice(index, 1);
      }
  })
  res.sendStatus(200);
});

// REDIS
const {
  redisController,
  cachePlugin,
  updater,
} = require("./redis/redis-commands.js");

// SOCKET.IO
const server = http.createServer(app);

const socketIo = require("socket.io")(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST", "DELETE"],
  },
});

const getApiAndEmit = (socket) => {
  // console.log(updater);
  const response = updater;
  socket.emit("FromAPI", response);
};

let interval;
socketIo.on("connection", (socket) => {
  console.log("New client connected");
  if (interval) {
    clearInterval(interval);
  }
  interval = setInterval(() => getApiAndEmit(socket), 1000);
  socket.on("disconnect", () => {
    console.log("Client disconnected");
    clearInterval(interval);
  });
});

server.listen(3333, () => {
  console.log("listening for new APIs to spin up on port 3333");
});

// APOLLO SERVER + POSTGRAPHILE
const createNewApolloServer = async (service) => {
  //create a connection to PostgresQL server
  const pgPool = new pg.Pool({
    connectionString: service.db_uri,
  });

  async function startApolloServer() {
  //create express server
  const app = express();
  app.use(express.json());
  app.use(
    express.urlencoded({
      extended: true,
    })
  );

  const corsOptions = {
    origin: "*",
    optionsSuccessStatus: 200,
  };
  app.use(cors(corsOptions));

  //create Postgraphile schema from your Postgres database
    const { schema, plugin } = await makeSchemaAndPlugin(
      pgPool,
      "public", 
      {
        graphiql: true,
        graphlqlRoute: "/graphql",
        graphiqlRoute: "/graphiql",
        enhanceGraphiql: true,
      }
    );

    const options = {};

    //create new Apollo server with Postgraphile schema
    const server = new ApolloServer({
      schema,
      plugins: [plugin, cachePlugin, ApolloLogPlugin(options)],
      tracing: true,
      introspection: true,
    });

    //start server and apply express app middleware
    await server.start();
    server.applyMiddleware({ app });


    // REDIS CACHED METRICS
    app.get("/redis/:hash", redisController.serveMetrics, (req, res) => {
      console.log("Result from Redis cache: ");
      console.log(res.locals.metrics);
      return res.status(200).send(res.locals.metrics);
    });

    // EXPRESS UNKNOWN ROUTE HANDLER
    app.use("*", (req, res) => {
      return res.status(404).send("404 Not Found");
    });

    // EXPRESS GLOBAL ERROR HANDLER
    app.use((err, req, res, next) => {
      console.log(err);
      return res.status(500).send("Internal Server Error " + err);
    });

    const myApp = app.listen({ port: service.port });
    console.log(
      `🔮 Fortunes being told at http://localhost:${service.port}${server.graphqlPath}✨`
    );
    return myApp;
  }

  // CALL APOLLO SERVER FOR GRAPHIQL
  return startApolloServer().catch((e) => {
    console.error(e);
    // process.exit(1);
  });
};

// NEW APOLLO SERVER PER SCHEMA
const myServers = [];

services.forEach((service) => {
  createNewApolloServer(service)
    //push an instance of Apollo server to myServers array
    .then((data) => myServers.push(data))
    .catch((err) => console.log(err));
});
