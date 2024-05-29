import { sleep } from 'k6';
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
    listWatch: {
      exec: 'listWatch',
      vus: config.us.maxApps,
      iterations: 1,
      executor: 'per-vu-iterations',
      maxDuration: `${config.test.durationMins*60+30}s`
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
}

export function create() {
  const entity = newEntity();
  const _resp = usclient.create(entity)

  const jitterRPS = (config.us.createRPS / config.us.maxApps) * (Math.random() + 0.5);
  // 1.00 * maxApps / (create_latency (avg 30ms) + random_sleep) = RPS (overall)
  let sleepFor = (1.00 / jitterRPS) - 0.03;
  // console.debug("create: sleeping for", sleepFor, "seconds.")
  sleep(sleepFor);
};

export async function listWatch() {
  // wait randomly for starting, for a maximum of 30s.
  sleep(10 + Math.random()*20)

  const key = getKey().allObjects;

  const result = usclient.list(key)

  console.log("list: finished for app, key=", key, "count=", result.entities.length, "RV=", result.resourceVersion)

  const watchFor = Math.ceil(config.test.durationMins * 60) + 30

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

  await usclient.watch(key, result.resourceVersion, onCreate, null, null, watchFor);
}
