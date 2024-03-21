import grpc from 'k6/net/grpc';
import { check, sleep, randomSeed } from 'k6';
import encoding from 'k6/encoding';
import exec from 'k6/execution';
import { randomItem, randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.2.0/index.js';

const config = {
  maxStacks: 100,
  maxApps: 30,
  createRPS: 300,
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
        { duration: '1m', target: config.maxApps },
        { duration: '3m', target: config.maxApps },
        { duration: '1m', target: 0 },
      ],
      gracefulRampDown: '100ms',
    },
    list: {
      exec: 'list',
      executor: 'per-vu-iterations',
      // startTime: '1m',
      vus: config.maxApps,
      iterations: 1,
    },
  },
  noConnectionReuse: true,
}



const client = new grpc.Client();
client.load(['definitions'], 'entity.proto');

export function create() {
  randomSeed(Date.now())

  client.connect('localhost:10000', {
    plaintext: true
  });

  const data = {
    entity: newEntity()
  };
  const response = client.invoke('entity.EntityStore/Create', data);

  check(response, {
    'status is OK': (r) => r && r.status === grpc.StatusOK,
  });

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

  client.connect('localhost:10000', {
    plaintext: true
  })

  const key = getKey().allObjects;
  
  var nextPage = ""
  var error = false
  var hasMore = true
  while (hasMore) {
    const data = {
      key: [key],
      with_body: true,
      with_status: true,
      limit: 500,
      next_page_token: nextPage,
    }

    const response = client.invoke('entity.EntityStore/List', data);

    if (response.status !== grpc.StatusOK) {
      error = true
      hasMore = false
      continue
    }

    console.log("list: successful: listed entities: ", response.message.results.length,
      "; resource_version: ", response.message.resource_version)

    nextPage = response.message.next_page_token;
    if (nextPage !== "") {
      hasMore = false
    }
  }

  check(error, {
    'list status is OK': (e) => e === false,
  });

  client.close();
};

const getKey = () => {
  const appID = exec.vu.idInInstance;
  const eID = exec.vu.iterationInScenario;

  const key = {
    // namespace: `stack-${Date.now() % config.maxStacks}`,
    namespace: 'stack-404',
    group: `${appID}.apps.grafana.com`,
    groupVersion: `v0alpha${appID % 3}`,
    resource: `someres-${appID}`,
    name: `sample-${exec.scenario.startTime}-${eID}`,
    string: ``,
    allObjectsScoped: ``,
    allObjects: ``,
  };

  // /<group>/<resource>[/namespaces/<namespace>][/<name>[/<subresource>]]
  key.string = `/${key.group}/${key.resource}/namespaces/${key.namespace}/${key.name}`;

  key.allObjectsScoped = key.string.replace(/sample-\d+-\d+/, '');
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
