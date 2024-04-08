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
        { duration: '10s', target: config.maxApps },
        { duration: '300s', target: config.maxApps },
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
        { duration: '5s', target: 1 },
        { duration: '5s', target: config.maxApps},
        { duration: '305s', target: config.maxApps },
        { duration: '5s', target: 0 },
      ],
      gracefulRampDown: '30s',
    },
  },
  // tags: {
  //   testid: `${__ENV.K6_TEST_ID}`,
  // },
  noConnectionReuse: true,
}

export function create() {
  randomSeed(Date.now())

  const entity = newEntity();
  const _resp = usclient.create(entity)

  const jitterRPS = (Math.random() + 0.5) * config.createRPS
  // (create_latency (avg 30ms) + random_sleep) * RPS = 1.00
  sleep(1.00 / jitterRPS);
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
  const watchFor = Math.ceil((Math.random() * 20) + 20)

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
