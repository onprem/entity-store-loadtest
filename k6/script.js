import grpc from 'k6/net/grpc';
import { check, sleep, randomSeed } from 'k6';
import encoding from 'k6/encoding';
import exec from 'k6/execution';
import { crypto } from 'k6/experimental/webcrypto';

const config = {
  maxStacks: 1000,
  maxApps: 3,
  createRPS: 300,
  chanceUpdate: 0.1,
  chanceDelete: 0.1,
}

export const options = {
  // vus: 30,
  // iterations: 30 * 1000,
  // stages:  normalDistributionStages(30, 3*60),
  // stages: [
  //   { duration: '1m', target: 10 },
  //   { duration: '1m', target: 20 },
  //   { duration: '1m', target: 0 },
  // ],
  // thresholds: { http_req_duration: ['avg<100', 'p(95)<200'] },
  scenarios: {
    // Creates entities with randomised GVK, namespace, and name
    create: {
      exec: 'create',
      executor: 'ramping-vus',
      stages: [
        { duration: '10s', target: config.maxApps },
        { duration: '30s', target: config.maxApps },
        { duration: '10s', target: 0 },
      ],
      gracefulRampDown: '100ms',
    },
    list: {
      exec: 'list',
      executor: 'per-vu-iterations',
      startTime: '15s',
      vus: config.maxApps,
      iterations: 3,
    },
    watch: {
      exec: 'watch',
      executor: 'ramping-vus',
      stages: [
        { duration: '15s', target: 1 },
        { duration: '30s', target: config.maxApps},
        { duration: '3m', target: config.maxApps },
        { duration: '1m', target: 0 },
      ],
      gracefulRampDown: '30s',
    },
  },
  noConnectionReuse: true,
}



const client = new grpc.Client();
client.load(['definitions'], 'entity.proto');

const grpcParams = {
  metadata: {
    "grafana-login": "admin",
    "grafana-userid": "1",
    "grafana-orgid": "1"
  }
}

export function create() {
  randomSeed(Date.now())

  client.connect('localhost:10000', {
    plaintext: true,
    timeout: 5
  });

  const data = {
    entity: newEntity()
  };

  const response = client.invoke('entity.EntityStore/Create', data, grpcParams);

  if (response.message.status !== "CREATED") {
    console.error("create failed: key: ", data.entity.key, "err: ", response.message)
  }
 
  check(response, {
    'grpc status is OK': (r) => r && r.status === grpc.StatusOK,
    'create status is OK': (r) => r && r.message.status === 'CREATED',
  });

  if (exec.vu.iterationInScenario === 1) {
    console.log("creating keys similar to: ", data.entity.key)
  }

  // console.log(JSON.stringify(response.message.entity));

  client.close();
  
  // Adjust RPS randomly between 50% to 150% of original value to introduce
  // random jitter.
  const jitterRPS = (Math.random() + 0.5) * config.createRPS
  // (create_latency (avg 30ms) + random_sleep) * RPS = 1.00
  sleep(1.00 / jitterRPS);
};

export function list() {
  randomSeed(Date.now())

  // wait randomly for starting, for a maximum of 1m.
  sleep(Math.random()*10)

  client.connect('localhost:10000', {
    plaintext: true
  })

  const key = getKey().allObjects;
  
  var nextPage = ""
  var error = false
  var hasMore = true
  var i = 0
  while (hasMore) {
    const data = {
      key: [key],
      withBody: true,
      withStatus: true,
      limit: 500,
      nextPageToken: nextPage,
    }

    const response = client.invoke('entity.EntityStore/List', data, grpcParams);

    if (response.status !== grpc.StatusOK) {
      error = true
      hasMore = false
      continue
    }

    var msg = response.message
    msg.results = [];

    nextPage = msg.nextPageToken;
    if (!nextPage) {
      hasMore = false
    }

    console.debug("list(",i,"): successful: listed entities: ", response.message.results.length,
      "; key: ", key,
      "; continue: ", nextPage,
      "; hasMore: ", hasMore)
    i++;
  }

  check(error, {
    'list status is OK': (e) => e === false,
  });

  client.close();
};

export function watch() {
  randomSeed(Date.now())

  client.connect('localhost:10000', {
    plaintext: true
  })

  const key = getKey().allObjects;

  const stream = new grpc.Stream(client, 'entity.EntityStore/Watch', grpcParams);

  var count = {
    updated: 0,
    deleted: 0,
    created: 0,
    rest: 0,
  }

  stream.on('data', function (event) {
    switch (event.entity.action) {
      case 'CREATED':
        count.created++;
        if (isLucky(config.chanceUpdate)) {
          const data = {
            key: event.entity.key,
            withBody: true,
            withStatus: true,
          }
          const resp = client.invoke('entity.EntityStore/Read', data, grpcParams);

          check(resp, {
            'grpc status is OK': (r) => r && r.status === grpc.StatusOK,
            'no errors in entity': (r) => r && (!r.message.errors || r.message.errors.length === 0),
          })

          var e = resp.message;
          e.labels["k6.io/updated"] = "true"

          const updResp = client.invoke('entity.EntityStore/Update', {
            entity: e,
          }, grpcParams);

          check(updResp, {
            'grpc status is OK': (r) => r && r.status === grpc.StatusOK,
            'no errors in entity': (r) => r.message && r.message.status === "UPDATED",
          })

          console.debug("watch: entity updated! key: ", event.entity.key)
        } else if (isLucky(config.chanceDelete)) {
          const resp = client.invoke('entity.EntityStore/Delete', {key: event.entity.key}, grpcParams);

          check(resp, {
            'grpc status is OK': (r) => r && r.status === grpc.StatusOK,
            'no errors in entity': (r) => r.message && r.message.status === "UPDATED",
          })

          console.debug("watch: entity deleted! key: ", event.entity.key)
        }
        break;
      case 'DELETED':
        count.deleted++;
        break;
      case 'UPDATED':
        count.updated++;
        break;
      default:
        count.rest++;
        break;
    }
    console.debug(
      'watch event: type "' +
        event.entity.action +
        '" key "' +
        event.entity.key
    );
  });

  stream.on('end', function () {
    // The server has finished sending
    client.close();
    console.log('watch all done');
    console.log("watch event key: ", key, "count: ", count)
  });

  stream.on('error', function (e) {
    // An error has occurred and the stream has been closed.
    check(error, {
      'watch stream is OK': (e) => !e,
    });
    console.error('watch error: key: ', key, "err: " + JSON.stringify(e));
  });

  
  console.log("starting watch for key: ", key)

  stream.write({
    key: [key],
    withBody: true,
    withStatus: true,
  });

  sleep(Math.random() * 20 + 20)
  stream.end()
}

const randomNameHash = crypto.randomUUID().substring(24).toLowerCase();

const getKey = () => {
  const appID = exec.scenario.iterationInTest % config.maxApps;
  const eID = exec.vu.iterationInInstance;

  const key = {
    // namespace: `stack-${Date.now() % config.maxStacks}`,
    namespace: 'stack-404',
    group: `${appID}.apps.grafana.com`,
    groupVersion: `v0alpha${appID % 3}`,
    resource: `someres-${appID}`,
    name: `sample-${randomNameHash}-${appID}-${eID}`,
    string: ``,
    allObjectsScoped: ``,
    allObjects: ``,
  };

  // /<group>/<resource>[/namespaces/<namespace>][/<name>[/<subresource>]]
  key.string = `/${key.group}/${key.resource}/namespaces/${key.namespace}/${key.name}`;

  key.allObjectsScoped = key.string.replace(/sample-[\w\d]+-\d+-\d+/, '');
  key.allObjects = key.allObjectsScoped.replace(/\/namespaces\/\s+/, '')

  return key;
}

const newEntity = () => {
  const k = getKey()

  const labels = {"grafana.app/name": k.name}
  const title = "The " + k.name
  const metadata = {name: k.name, labels: k.labels}
  const body = {metadata: metadata, spec: {title: title}}

  return {
    key: k.string,
    groupVersion: k.groupVersion,
    labels: labels,
    title: title,
    body: encoding.b64encode(JSON.stringify(body)),
    meta: encoding.b64encode(JSON.stringify(metadata))
  }
}

const isLucky = (chance = 0.5) => {
  while (chance > 1.00) {
    chance = chance / 10
  }
  const yes = (Math.random() > (1-chance))
  return yes
}
