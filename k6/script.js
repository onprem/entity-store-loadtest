import { sleep, randomSeed } from 'k6';
import usclient from './client.js';
import {getKey, newEntity, isLucky} from './helpers.js';
import config from './config.js';

export const options = {
  scenarios: {
    // Creates entities with randomised GVK, namespace, and name
    create: {
      exec: 'create',
      executor: 'ramping-vus',
      stages: [
        { duration: '10s', target: config.us.maxApps },
        { duration: `${config.test.durationMins}m`, target: config.us.maxApps },
        { duration: '10s', target: 0 },
      ],
      gracefulRampDown: '100ms',
    },
    list: {
      exec: 'list',
      executor: 'per-vu-iterations',
      startTime: '15s',
      vus: config.us.maxApps,
      iterations: 3,
    },
    watch: {
      exec: 'watch',
      executor: 'ramping-vus',
      stages: [
        { duration: '5s', target: 1 },
        { duration: '5s', target: config.us.maxApps},
        { duration: `${config.test.durationMins}m`, target: config.us.maxApps },
        { duration: `15s`, target: config.us.maxApps },
        { duration: '5s', target: 0 },
      ],
      gracefulRampDown: '30s',
    },
  },
  tags: {
    testid: config.test.testID,
  },
  cloud: {
    // Project: Unified Storage Loadtest
    projectID: config.cloud.projectID,
    // Test runs with the same name groups test runs together.
    name: `${config.cloud.name}`,
  },
  noConnectionReuse: true,
}

export function create() {
  randomSeed(Date.now())

  const entity = newEntity();
  const _resp = usclient.create(entity)

  const jitterRPS = (config.us.createRPS / config.us.maxApps) * (Math.random() + 0.5);
  // 1.00 * maxApps / (create_latency (avg 30ms) + random_sleep) = RPS (overall)
  sleep((1.00 / jitterRPS) - 0.03);
};

export function list() {
  randomSeed(Date.now())
  // wait randomly for starting, for a maximum of 1m.
  sleep(Math.random()*10)

  const key = getKey().allObjects;
  
  const results = usclient.list(key)
};

export function watch() {
  randomSeed(Date.now())

  const key = getKey().allObjects;
  const watchFor = Math.ceil(
    (Math.random() * 20) +
    (config.test.durationMins * 60)
  )

  const onCreate = (event) => {
    if (isLucky(config.chanceUpdate)) {
      const readResp = usclient.read(event.entity.key)

      var e = readResp.message;
      e.labels["k6.io/updated"] = "true"

      const updResp = usclient.update(e);

      console.debug("watch: entity updated! key: ", updResp.message.entity.key)
    } else if (isLucky(config.chanceDelete)) {
      const resp = usclient.del(event.entity.key);

      console.debug("watch: entity deleted! key: ", resp.message.entity.key)
    }
  }

  usclient.watch(key, onCreate, null, null, watchFor);
}
